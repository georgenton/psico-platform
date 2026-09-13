import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesAccountDeletionService } from "../../circles/circles-account-deletion.service";
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly circles: CirclesAccountDeletionService,
  ) {
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

    // ── Authority BEFORE any irreversible effect ─────────────────────────
    //
    // The previous cut ran `detachUser` in its own transactions and only THEN
    // took the `User` lock to revalidate. That ordering could destroy a
    // person's envelopes and end their activities and then decide not to
    // delete the account, because they had cancelled in the meantime. The
    // comment that excused it — that ending activities is "a consequence of
    // having asked" — was a retention policy nobody authorised, invented to
    // justify an ordering bug. It is gone.
    //
    // Now there is ONE transaction. It takes the same `User` row lock
    // `createDuo` takes before it writes anything, re-reads the request and
    // the 30 days under that lock, and only then touches Círculos. If the
    // cancellation wins, nothing was mutated: not a single envelope, not a
    // single activity. If the deletion wins, cleanup and removal commit
    // together, so a later failure cannot leave a half-done cleanup standing
    // against a cancellation that was accepted.
    //
    // The cleanup shares this client rather than opening nested transactions:
    // independent ones would commit on their own and reintroduce exactly the
    // window this fix closes.
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          { id: string; deleteRequestedAt: Date | null }[]
        >`SELECT "id", "deleteRequestedAt" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;

        const row = locked[0];
        if (!row)
          return { deleted: false as const, reason: "vanished" as const };
        if (!row.deleteRequestedAt) {
          return { deleted: false as const, reason: "cancelled" as const };
        }
        if (Date.now() - row.deleteRequestedAt.getTime() < this.COOLDOWN_MS) {
          return {
            deleted: false as const,
            reason: "cooldown-restarted" as const,
          };
        }

        // Only past this point does anything change.
        const circles = await this.circles.detachUser(userId, tx as never);

        // Nothing may have appeared that the inventory above missed. A
        // `createDuo` that committed earlier is already included; one that
        // arrives now blocks on the lock this transaction holds.
        const live = await this.circles.countLiveParticipation(
          userId,
          tx as never,
        );
        if (live > 0) {
          throw new Error(
            `ACCOUNT_DELETION_RACED_NEW_PARTICIPATION: ${live} live seat(s)`,
          );
        }

        // Prisma cascades through every relation. The User row is removed and
        // all its data with it. AuthEvent rows survive with userId=null, and
        // the three Círculos references detach (circle creator, membership,
        // ledger actor) — see `20260913000000_circles_account_deletion`.
        await tx.user.delete({ where: { id: userId } });
        return { deleted: true as const, circles };
      },
      // The cleanup is bounded by one account's participation, but it is more
      // than the 5s Prisma allows an interactive transaction by default.
      { timeout: 120_000, maxWait: 10_000 },
    );

    // ── The log says what happened, not what was attempted ────────────────
    //
    // It used to print "deleted" unconditionally, including on every path that
    // deliberately did not delete. An operator reading that line could not
    // tell a completed deletion from a cancelled one.
    if (!outcome.deleted) {
      const why = {
        vanished: "the account was already gone",
        cancelled: "the request was cancelled before the decision point",
        "cooldown-restarted": "the request was renewed; the 30 days restart",
      }[outcome.reason];
      this.logger.log(`User ${userId} NOT deleted — ${why}`);
      return;
    }

    // COUNTS only. No activity, invitation, circle or seat id, and no token —
    // the sweep's shape is operationally useful, its subjects are not. The
    // Círculos module itself may not log at all (`circles-scope.spec.ts`), so
    // this line lives here, outside it.
    const c = outcome.circles;
    if (c.memberships > 0 || c.seatsWithdrawn > 0 || c.envelopesPurged > 0) {
      this.logger.log(
        `circles detach: memberships=${c.memberships} ` +
          `cancelled=${c.activitiesCancelled} closed=${c.activitiesClosed} ` +
          `seats=${c.seatsWithdrawn} invitations=${c.invitationsRevoked} ` +
          `guestSessions=${c.guestSessionsRevoked} envelopes=${c.envelopesPurged}`,
      );
    }

    this.logger.log(`User ${userId} deleted`);
  }
}
