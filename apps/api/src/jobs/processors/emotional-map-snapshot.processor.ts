import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

// NestJS DI: value imports required for runtime metadata (see eslint-config
// override for *.processor.ts).
import { PrismaService } from "../../prisma";
import { EmotionalMapService } from "../../emotional-map/emotional-map.service";
import { flagEnabled } from "../../shared/flags";
// PR-0.1 — the worker stamps snapshots with the SAME identity helper the API
// reads them back with. One module, so the two can never disagree.
import { factsIdentity } from "../../emotional-map/cache-identity";
// PR-0.1 — the same barrier the revocation takes, from the same module.
import {
  lockUserShared,
  readPrivacyRevision,
} from "../../emotional-map/privacy-barrier";
// NOTE: importing the same helper does NOT guarantee the worker and the API
// agree — they are separate Railway services with separate environments. The
// startup log + the `/api/health/emotional-map` probe are what actually catch a
// divergence (see cache-identity.ts → runtimeIdentity).
import {
  JobName,
  QueueName,
  type EmotionalMapSnapshotJobPayload,
} from "../queue-names";

/**
 * EmotionalMapSnapshotProcessor — Sprint G2.
 *
 * Fan-out: iterate every user with at least one diary entry or reading
 * session, recompute their emotional map via the existing
 * `EmotionalMapService.compute(userId)`, and upsert a single
 * `EmotionalMapSnapshot` row keyed on `(userId, month)`.
 *
 * Why fan-out from a single job rather than enqueuing one job per user:
 *   - At v1 scale (~1k users), a single sequential pass with await is
 *     well under the per-job timeout. We pay one Redis round-trip per
 *     run instead of N.
 *   - The LLM provider already has its own rate-limiting baked into the
 *     IEmotionalMapProvider implementations.
 *
 * Per-user errors are isolated: the LLM might 5xx for one user but the
 * next user's snapshot must still land. We log + continue.
 *
 * Idempotency: upserting on `(userId, month)` means re-running the same
 * month (cron retry, ops backfill) overwrites the existing row — safe.
 */
@Processor(QueueName.EMOTIONAL_MAP_SNAPSHOT)
export class EmotionalMapSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(EmotionalMapSnapshotProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emotionalMap: EmotionalMapService,
  ) {
    super();
  }

  async process(job: Job<EmotionalMapSnapshotJobPayload>): Promise<{
    candidates: number;
    persisted: number;
    /** Computed, then dropped: the user's privacy revision moved mid-compute. */
    skippedRevoked: number;
    failed: number;
    monthIso: string;
    dryRun: boolean;
  }> {
    if (job.name !== JobName.RUN_EMOTIONAL_MAP_SNAPSHOT) {
      // Unknown sub-job — no-op rather than fail to keep the queue clean.
      this.logger.warn(`Unknown job name "${job.name}" on emotional-map queue`);
      return {
        candidates: 0,
        persisted: 0,
        skippedRevoked: 0,
        failed: 0,
        monthIso: "",
        dryRun: !!job.data?.dryRun,
      };
    }

    // PR-0.2 — fail closed. When the map kill switch is off, the worker computes
    // and persists NOTHING: no `compute()`, no scoring, no snapshot rows. It is
    // not a dry run (that still iterates candidates) — it is a hard no-op, so a
    // data-quality incident can take the whole surface down from one env var.
    if (!flagEnabled("EMOTIONAL_MAP_PUBLIC")) {
      this.logger.log(
        "EmotionalMapSnapshot skipped — EMOTIONAL_MAP_PUBLIC is off",
      );
      return {
        candidates: 0,
        persisted: 0,
        skippedRevoked: 0,
        failed: 0,
        monthIso: "",
        dryRun: !!job.data?.dryRun,
      };
    }

    const month = resolveTargetMonth(job.data?.targetMonth);
    const dryRun = !!job.data?.dryRun;
    const monthIso = month.toISOString();

    // Candidate set: users with at least one diary entry OR reading session.
    // We deliberately skip cold accounts — they would produce a neutral
    // snapshot (0.5 across all axes) every month, polluting the chart.
    const userRows = await this.prisma.user.findMany({
      where: {
        OR: [{ diaryEntries: { some: {} } }, { readingSessions: { some: {} } }],
      },
      select: { id: true },
    });

    if (dryRun) {
      this.logger.log(
        `EmotionalMapSnapshot dryRun · month=${monthIso} · candidates=${userRows.length}`,
      );
      return {
        candidates: userRows.length,
        persisted: 0,
        skippedRevoked: 0,
        failed: 0,
        monthIso,
        dryRun: true,
      };
    }

    let persisted = 0;
    let failed = 0;
    let skippedRevoked = 0;
    for (const { id: userId } of userRows) {
      try {
        // PR-0.1 — the revision we are working UNDER. `compute()` is the widest
        // stale-read window in the system: it reads the user's consent, then may
        // spend seconds inside an LLM call. If the user revokes while we are in
        // there, the numbers we are holding were derived from data that no longer
        // exists — and an unguarded upsert would write them back into the very
        // table the revocation just emptied.
        const revisionAtCompute = await readPrivacyRevision(
          this.prisma,
          userId,
        );

        const result = await this.emotionalMap.compute(userId);

        // A SHORT transaction to land the write: take the same shared lock the
        // revocation's exclusive lock conflicts with, re-read the revision, and
        // only persist if nothing moved underneath us. If it moved, we throw the
        // numbers away — they describe a consent state the user has left behind.
        // Next month's run (or an ops backfill) recomputes from what remains.
        const wrote = await this.prisma.$transaction(async (tx) => {
          await lockUserShared(tx, userId);
          const revisionNow = await readPrivacyRevision(tx, userId);
          if (revisionNow !== revisionAtCompute) return false;

          // PR-0.1 — stamp the identity of the code + config that produced
          // these numbers, so the API can refuse to serve them as its own
          // history after a scoring or config change. `privacyRevision` is
          // PROVENANCE, not a guard: the lock above is what makes the write
          // safe. It records which consent state these numbers were computed
          // under, so a row can be audited after the fact.
          const stamp = {
            ...factsIdentity(),
            privacyRevision: revisionNow,
          };
          const values = Array.from(result.values);
          await tx.emotionalMapSnapshot.upsert({
            where: { userId_month: { userId, month } },
            create: {
              userId,
              month,
              pct: result.pct,
              // Fase G — the Evolución chart plots coverage (signal backing
              // the map), not the legacy global pct.
              coverage: result.coverage,
              values,
              provider: result.provider,
              ...stamp,
            },
            update: {
              pct: result.pct,
              coverage: result.coverage,
              values,
              provider: result.provider,
              ...stamp,
            },
          });
          return true;
        });

        if (wrote) persisted++;
        else {
          skippedRevoked++;
          this.logger.log(
            `EmotionalMapSnapshot skipped user=${userId} · privacy revision moved during compute`,
          );
        }
      } catch (err) {
        failed++;
        this.logger.warn(
          `EmotionalMapSnapshot failed for user=${userId} · ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `EmotionalMapSnapshot done · month=${monthIso} · persisted=${persisted}/${userRows.length} · skippedRevoked=${skippedRevoked} · failed=${failed}`,
    );

    return {
      candidates: userRows.length,
      persisted,
      skippedRevoked,
      failed,
      monthIso,
      dryRun: false,
    };
  }
}

/**
 * Resolve which month to snapshot.
 *  - With `targetMonth` set: parse, anchor to the first of that month UTC.
 *  - Without: anchor to the first of the CURRENT UTC month. The cron fires
 *    on the 1st at 04:00 UTC, so "current" === "the month we're starting".
 */
function resolveTargetMonth(targetMonth: string | undefined): Date {
  if (targetMonth) {
    const parsed = new Date(`${targetMonth}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(
        Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1),
      );
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
