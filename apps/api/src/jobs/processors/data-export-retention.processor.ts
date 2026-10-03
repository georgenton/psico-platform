import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StorageService } from "../../storage";
import {
  DATA_EXPORT_STATUS,
  dataExportRetentionCutoff,
} from "../../users/data-export-retention";
import {
  dataExportObjectKey,
  isUserOwnedKey,
} from "../../users/user-owned-objects";
import {
  JobName,
  QueueName,
  type DataExportRetentionJobPayload,
} from "../queue-names";

/**
 * Deletes data-export objects whose retention has elapsed.
 *
 * Before this, nothing did. There was no lifecycle rule on the bucket, no sweep,
 * and account deletion did not touch storage — so a JSON file holding a person's
 * entire profile, reading history and subscription stayed in R2 indefinitely,
 * long after the 2-minute download link that fetched it had expired.
 *
 * ── What EXPIRED means ────────────────────────────────────────────────────
 *
 * Object deleted, `fileUrl` cleared, row kept. The row is the operational record
 * of who asked for their own data and when — worth keeping precisely because the
 * file is not. The download endpoint answers 410 for it, so a client stops
 * retrying and offers a fresh request rather than polling for a month-old file.
 *
 * ── Ordering, and what a failure leaves behind ────────────────────────────
 *
 * Object first, row second, and never the reverse. If the delete fails the row
 * stays READY, so the next pass tries again — the file is still there and still
 * downloadable, which is the mild outcome. Clearing the row first would mean a
 * failed delete left an object nothing names any more: unreachable AND
 * un-deletable, because the key is derived from the row.
 *
 * One row's failure does not abort the pass. A single object R2 refuses should
 * not keep a hundred others alive for another day.
 *
 * ── Idempotence ───────────────────────────────────────────────────────────
 *
 * Safe to run twice. `DeleteObject` answers success for a key that is already
 * gone (S3 semantics), and an EXPIRED row is not selected again because the
 * query asks for READY with a non-null `fileUrl`.
 */
@Processor(QueueName.DATA_EXPORT_RETENTION)
export class DataExportRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(DataExportRetentionProcessor.name);

  /**
   * How many rows one pass will touch.
   *
   * A bound rather than a page loop: the sweep runs daily and the 30-day request
   * cooldown means the steady-state arrival rate is at most one export per user
   * per month, so a backlog this large means something else is wrong and a
   * runaway pass is not the way to find out. Anything left over is picked up
   * tomorrow.
   */
  private readonly MAX_PER_RUN = 500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<DataExportRetentionJobPayload>): Promise<void> {
    if (job.name !== JobName.RUN_DATA_EXPORT_RETENTION) {
      throw new Error(
        `DataExportRetentionProcessor unknown job name: ${job.name}`,
      );
    }

    const now = job.data.nowIso ? new Date(job.data.nowIso) : new Date();
    const cutoff = dataExportRetentionCutoff(now);
    const dryRun = job.data.dryRun === true;

    // READY with bytes, past the cutoff. The `completedAt: null` arm catches a
    // row that reached READY without a timestamp — which the processor never
    // produces, so it would be a bug; expiring it by `createdAt` is better than
    // letting one immortal object outlive the policy because of a null.
    const due = await this.prisma.dataExportRequest.findMany({
      where: {
        status: DATA_EXPORT_STATUS.READY,
        fileUrl: { not: null },
        OR: [
          { completedAt: { lte: cutoff } },
          { completedAt: null, createdAt: { lte: cutoff } },
        ],
      },
      select: { id: true, userId: true },
      orderBy: { createdAt: "asc" },
      take: this.MAX_PER_RUN,
    });

    if (due.length === 0) {
      this.logger.log(
        `Data-export retention: nothing due before ${cutoff.toISOString()}`,
      );
      return;
    }

    if (dryRun) {
      this.logger.log(
        `Data-export retention DRY RUN: ${due.length} export(s) would expire (cutoff ${cutoff.toISOString()})`,
      );
      return;
    }

    let expired = 0;
    let failed = 0;

    for (const row of due) {
      // Computed from (userId, requestId), not read from `fileUrl`. The template
      // has never changed, so this is also what makes legacy rows — whose
      // `fileUrl` holds an absolute URL no browser could ever load — cleanable.
      const key = dataExportObjectKey(row.userId, row.id);

      // Should never fire; the key was just built from the owner's own ids. It
      // is here because the cost of being wrong is deleting another user's
      // object, and an assertion is a cheaper place to find that out.
      if (!isUserOwnedKey(key, row.userId)) {
        failed += 1;
        this.logger.error(
          `Data-export retention: refusing a key outside its owner's prefixes (request ${row.id})`,
        );
        continue;
      }

      try {
        await this.storage.deleteObject(key);
      } catch (err) {
        // Row stays READY on purpose: the file is still there and still
        // downloadable, and tomorrow's pass retries. No key in the message —
        // it carries both the user id and the request id.
        failed += 1;
        this.logger.error(
          `Data-export retention: R2 delete failed for request ${row.id} — row left READY for the next pass: ${(err as Error).message}`,
        );
        continue;
      }

      // Only now, and only for this row. `updateMany` with the status in the
      // WHERE keeps a concurrent pass from double-writing, and makes the write
      // a no-op if something else already expired it.
      const written = await this.prisma.dataExportRequest.updateMany({
        where: { id: row.id, status: DATA_EXPORT_STATUS.READY },
        data: { status: DATA_EXPORT_STATUS.EXPIRED, fileUrl: null },
      });
      if (written.count === 1) expired += 1;
    }

    // COUNTS only — never a key, never a userId, and never a signed URL (the
    // sweep mints none).
    this.logger.log(
      `Data-export retention: expired=${expired} failed=${failed} due=${due.length} cutoff=${cutoff.toISOString()}`,
    );
  }
}
