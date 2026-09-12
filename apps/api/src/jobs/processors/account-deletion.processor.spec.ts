import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { AccountDeletionProcessor } from "./account-deletion.processor";
import { JobName } from "../queue-names";

function buildJob<T>(name: string, data: T) {
  return { id: "job-1", name, data } as unknown as Job<T>;
}

const NOW = Date.now();
const THIRTY_ONE_DAYS_AGO = new Date(NOW - 31 * 24 * 60 * 60 * 1000);
const FIVE_DAYS_AGO = new Date(NOW - 5 * 24 * 60 * 60 * 1000);

describe("AccountDeletionProcessor", () => {
  let processor: AccountDeletionProcessor;
  /**
   * The final delete now runs inside a transaction that locks the `User` row,
   * re-reads the request under that lock, and refuses if live Círculos
   * participation appeared after the inventory was taken. The double models
   * that: `$queryRaw` is the locked read, `$transaction` hands the same object
   * back as the transaction client.
   */
  const lockedRow = {
    rows: [] as { id: string; deleteRequestedAt: Date | null }[],
  };
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
    $queryRaw: vi.fn(async () => lockedRow.rows),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockPrisma),
    ),
  };

  /**
   * The Círculos detach the processor now runs before the delete.
   *
   * A spy, not a stub that swallows: the ORDER matters (ending live activities
   * after removing the account leaves a window where the seat is unreachable
   * and the activity still live), and one of the tests below asserts it.
   */
  const circles = {
    countLiveParticipation: vi.fn().mockResolvedValue(0),
    detachUser: vi.fn().mockResolvedValue({
      memberships: 0,
      activitiesCancelled: 0,
      activitiesClosed: 0,
      seatsWithdrawn: 0,
      invitationsRevoked: 0,
      guestSessionsRevoked: 0,
      envelopesPurged: 0,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    mockPrisma.user.delete.mockResolvedValue({});
    circles.countLiveParticipation.mockResolvedValue(0);
    // By default the locked re-read agrees with the unlocked one.
    lockedRow.rows = [{ id: "user-1", deleteRequestedAt: THIRTY_ONE_DAYS_AGO }];
    circles.detachUser.mockResolvedValue({
      memberships: 0,
      activitiesCancelled: 0,
      activitiesClosed: 0,
      seatsWithdrawn: 0,
      invitationsRevoked: 0,
      guestSessionsRevoked: 0,
      envelopesPurged: 0,
    });
    processor = new AccountDeletionProcessor(
      mockPrisma as never,
      circles as never,
    );
  });

  const thirtyOneDaysAgo = THIRTY_ONE_DAYS_AGO;
  const fiveDaysAgo = FIVE_DAYS_AGO;

  it("deletes the user when cooldown elapsed and deleteRequestedAt still set", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      deleteRequestedAt: thirtyOneDaysAgo,
    });

    await processor.process(
      buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
        userId: "user-1",
        requestedAt: thirtyOneDaysAgo.toISOString(),
      }),
    );

    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { id: "user-1" },
    });
  });

  it("ends Círculos participation BEFORE removing the account", async () => {
    // Order is the assertion, not merely that both happened.
    //
    // Delete-then-tidy has a window in which the account is gone and the shared
    // activity is still live: the counterpart could confirm in that window and
    // trigger a REVEAL of a snapshot written by somebody who no longer exists.
    // Detach-then-delete has no such window — and if the detach fails, the
    // account survives and the job retries the whole thing.
    const order: string[] = [];
    circles.detachUser.mockImplementation(async () => {
      order.push("detach");
      return {
        memberships: 1,
        activitiesCancelled: 1,
        activitiesClosed: 0,
        seatsWithdrawn: 1,
        invitationsRevoked: 1,
        guestSessionsRevoked: 1,
        envelopesPurged: 1,
      };
    });
    mockPrisma.user.delete.mockImplementation(async () => {
      order.push("delete");
      return {};
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      deleteRequestedAt: thirtyOneDaysAgo,
    });

    await processor.process(
      buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
        userId: "user-1",
        requestedAt: thirtyOneDaysAgo.toISOString(),
      }),
    );

    expect(order).toEqual(["detach", "delete"]);
    expect(circles.detachUser).toHaveBeenCalledWith("user-1");
  });

  it("does not touch Círculos for a cancelled or already-deleted account", async () => {
    // The cooldown and cancellation guards run first. A person who changed
    // their mind must not have their live Dúo cancelled as a side effect of a
    // job that then decides not to delete them.
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      deleteRequestedAt: null,
    });
    await processor.process(
      buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
        userId: "user-1",
        requestedAt: thirtyOneDaysAgo.toISOString(),
      }),
    );
    expect(circles.detachUser).not.toHaveBeenCalled();
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();

    mockPrisma.user.findUnique.mockResolvedValue(null);
    await processor.process(
      buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
        userId: "user-1",
        requestedAt: thirtyOneDaysAgo.toISOString(),
      }),
    );
    expect(circles.detachUser).not.toHaveBeenCalled();
  });

  it("leaves the account intact when the detach fails", async () => {
    // The whole job retries. A half-done deletion — account gone, activity
    // live — is the state this ordering exists to make unreachable.
    circles.detachUser.mockRejectedValue(new Error("storage down"));
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      deleteRequestedAt: thirtyOneDaysAgo,
    });

    await expect(
      processor.process(
        buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
          userId: "user-1",
          requestedAt: thirtyOneDaysAgo.toISOString(),
        }),
      ),
    ).rejects.toThrow();

    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  describe("the final decision is re-made under the User row lock", () => {
    const job = () =>
      buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
        userId: "user-1",
        requestedAt: THIRTY_ONE_DAYS_AGO.toISOString(),
      });

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        deleteRequestedAt: THIRTY_ONE_DAYS_AGO,
      });
    });

    it("takes the lock before reading, and deletes inside that transaction", async () => {
      await processor.process(job());
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.$queryRaw).toHaveBeenCalledOnce();
      // The locked read is a `FOR UPDATE` on the User row — the same row
      // `createDuo` locks before it writes anything.
      const sql = String(mockPrisma.$queryRaw.mock.calls[0]![0]);
      expect(sql).toMatch(/FOR UPDATE/);
      expect(mockPrisma.user.delete).toHaveBeenCalledOnce();
    });

    it("does NOT delete when the request was cancelled after the job started", async () => {
      // The unlocked read at the top saw a live request; by the time the lock
      // is held the person has changed their mind. The authoritative point is
      // the one under the lock.
      lockedRow.rows = [{ id: "user-1", deleteRequestedAt: null }];

      await processor.process(job());

      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it("does NOT delete when the cooldown restarted mid-job", async () => {
      // Re-requested five days ago: the 30 days are counted from the row as it
      // stands, never from the job payload, and never shortened.
      lockedRow.rows = [{ id: "user-1", deleteRequestedAt: FIVE_DAYS_AGO }];

      await processor.process(job());

      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it("aborts when a Dúo appeared after the inventory was taken", async () => {
      // `detachUser` ran against an inventory that is now stale — a creation
      // committed in between. Deleting now would leave a live activity whose
      // other seat nobody can ever fill, so the job fails and retries; the
      // retry's detach reaches the new seat.
      circles.countLiveParticipation.mockResolvedValue(1);

      await expect(processor.process(job())).rejects.toThrow(
        /ACCOUNT_DELETION_RACED_NEW_PARTICIPATION/,
      );

      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it("deletes once nothing live is left", async () => {
      circles.countLiveParticipation.mockResolvedValue(0);
      await processor.process(job());
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });
    });

    it("does not delete a user who vanished before the final step", async () => {
      lockedRow.rows = [];
      await processor.process(job());
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });
  });

  it("no-ops when user already deleted (find returns null)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await processor.process(
      buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
        userId: "user-1",
        requestedAt: thirtyOneDaysAgo.toISOString(),
      }),
    );

    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it("no-ops when user cancelled deletion (deleteRequestedAt is null)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      deleteRequestedAt: null,
    });

    await processor.process(
      buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
        userId: "user-1",
        requestedAt: thirtyOneDaysAgo.toISOString(),
      }),
    );

    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it("no-ops when cooldown not elapsed (defense in depth — even if BullMQ misfires)", async () => {
    // User re-requested deletion 5 days ago even though the job was
    // originally enqueued 31 days ago. We honor the LATEST request.
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      deleteRequestedAt: fiveDaysAgo,
    });

    await processor.process(
      buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
        userId: "user-1",
        requestedAt: thirtyOneDaysAgo.toISOString(),
      }),
    );

    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it("throws on unknown job name (guards against future bugs)", async () => {
    await expect(
      processor.process(
        buildJob("wrong-name", { userId: "user-1", requestedAt: "now" }),
      ),
    ).rejects.toThrow(/unknown job name/);
  });
});
