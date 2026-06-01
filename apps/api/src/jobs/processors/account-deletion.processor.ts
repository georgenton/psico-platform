import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
import {
  JobName,
  QueueName,
  type AccountDeletionJobPayload,
} from "../queue-names";

/**
 * Hard-deletes a user 30 days after they requested deletion (job enqueued
 * with `delay: 30d` from UsersService.requestDelete).
 *
 * Self-correcting behaviour:
 *  - Re-fetches `User.deleteRequestedAt` at execution time.
 *  - If the user cancelled (deleteRequestedAt cleared) → no-op, log info.
 *  - If the user was already deleted (manually, by support) → no-op.
 *  - If the user still has `deleteRequestedAt` set AND it's been ≥30 days
 *    since that timestamp → execute `prisma.user.delete()`. Prisma cascades
 *    through every owned table (profile, refresh tokens, progress,
 *    subscription, conversations, achievements, preferences, etc. — see
 *    `schema.prisma` `onDelete: Cascade`).
 *
 * Why we re-check the timestamp at execution:
 *  - The job's delay can drift slightly (Redis restart, worker restart).
 *  - The user might have cancelled.
 *  - Defense in depth: even if BullMQ misfires, we never delete prematurely.
 *
 * NO audit-log row for the deletion itself — the audit table has FK
 * `AuthEvent.userId → User.id ON DELETE SET NULL`. The historical
 * AuthEvents survive (userId becomes null) for compliance.
 */
@Processor(QueueName.ACCOUNT_DELETION)
export class AccountDeletionProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountDeletionProcessor.name);

  // Match UsersService.DELETE_COOLDOWN_DAYS
  private readonly COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<AccountDeletionJobPayload>): Promise<void> {
    if (job.name !== JobName.FINALIZE_ACCOUNT_DELETION) {
      throw new Error(`AccountDeletionProcessor unknown job name: ${job.name}`);
    }

    const { userId, requestedAt } = job.data;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, deleteRequestedAt: true },
    });

    if (!user) {
      this.logger.log(`User ${userId} already deleted — skipping`);
      return;
    }

    if (!user.deleteRequestedAt) {
      this.logger.log(
        `User ${userId} cancelled deletion (deleteRequestedAt cleared) — skipping`,
      );
      return;
    }

    // Defense in depth: verify cooldown elapsed using the DB-stored
    // timestamp, not the job's `requestedAt` payload. If a user requested
    // deletion, then cancelled, then re-requested, the DB's
    // deleteRequestedAt reflects the LATEST request — we honor that.
    const elapsed = Date.now() - user.deleteRequestedAt.getTime();
    if (elapsed < this.COOLDOWN_MS) {
      this.logger.warn(
        `User ${userId} cooldown not elapsed (${Math.round(elapsed / 86400_000)}d < 30d) — ` +
          `job payload requestedAt=${requestedAt}, DB requestedAt=${user.deleteRequestedAt.toISOString()}. Skipping.`,
      );
      return;
    }

    this.logger.warn(
      `Hard-deleting user ${userId} (requested ${user.deleteRequestedAt.toISOString()})`,
    );

    // Prisma cascades through every relation. The User row is removed and
    // all its data with it. AuthEvent rows survive with userId=null.
    await this.prisma.user.delete({ where: { id: userId } });

    this.logger.log(`User ${userId} deleted`);
  }
}
