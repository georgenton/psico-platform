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
    // Sprint B.2 — the personal objects in R2 are enumerated inside the same
    // locked transaction that decides the deletion, so they are read here.
    dataExportRequest: {
      findMany: vi.fn().mockResolvedValue([]),
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
  /**
   * R2. A spy because the ORDER is the contract: objects are deleted before
   * `user.delete`, so a refusal from R2 aborts the whole transaction and the
   * account survives with its data intact. The reverse order would delete the
   * account and leave a dump of its data in the bucket, unreachable because the
   * key died with the row that named it.
   */
  const storage = {
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };

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
    mockPrisma.dataExportRequest.findMany.mockResolvedValue([]);
    storage.deleteObject.mockResolvedValue(undefined);
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
      storage as never,
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
    // Both now happen inside the ONE transaction that holds the lock, so the
    // detach receives that transaction's client rather than the base one.
    expect(circles.detachUser).toHaveBeenCalledWith("user-1", mockPrisma);
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

    it("does NOT delete when the cooldown restarted mid-job", async () => {
      // Re-requested five days ago: the 30 days are counted from the row as it
      // stands, never from the job payload, and never shortened.
      lockedRow.rows = [{ id: "user-1", deleteRequestedAt: FIVE_DAYS_AGO }];

      await processor.process(job());

      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it("touches NOTHING in Círculos when the cancellation wins", async () => {
      // The defect this replaced: the detach ran first, in its own
      // transactions, so a person who cancelled could still have had their
      // envelopes destroyed and their activities ended by a job that then
      // decided not to delete them.
      lockedRow.rows = [{ id: "user-1", deleteRequestedAt: null }];

      await processor.process(job());

      expect(circles.detachUser).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it("touches NOTHING in Círculos when the cooldown restarted", async () => {
      lockedRow.rows = [{ id: "user-1", deleteRequestedAt: FIVE_DAYS_AGO }];

      await processor.process(job());

      expect(circles.detachUser).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it("runs the detach with the SAME client that holds the lock", async () => {
      await processor.process(job());
      expect(circles.detachUser).toHaveBeenCalledWith("user-1", mockPrisma);
      // One transaction, not one per activity plus one for the delete.
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
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
  // ── R2 erasure (Sprint B.2) ─────────────────────────────────────────────
  //
  // Before this, the processor called `user.delete()` and touched storage not at
  // all. Prisma cascades the rows, which takes the KEYS with them — so a JSON
  // file holding a person's entire profile stayed in the bucket, unreachable and
  // un-deletable by any code path. Erasure, not housekeeping.

  describe("personal objects in R2", () => {
    // A real cuid, not this file's `user-1`: the avatar allowlist requires at
    // least 8 characters in the id segment, and every id Prisma mints is a
    // 25-character cuid. Loosening that pattern so a short fixture passes would
    // widen a security boundary to suit a test.
    const USER = "cmupxz8sf0000wolm2wemalb7";
    const AVATAR_KEY = `avatars/${USER}/0123456789abcdef.png`;

    function requestDeletion(avatarUrl: string | null = null) {
      mockPrisma.user.findUnique
        // the unlocked pre-check
        .mockResolvedValueOnce({
          id: USER,
          deleteRequestedAt: thirtyOneDaysAgo,
        })
        // the read inside the locked transaction
        .mockResolvedValueOnce({ avatarUrl });
      return buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
        userId: USER,
        requestedAt: thirtyOneDaysAgo.toISOString(),
      });
    }

    it("deletes this user's own avatar", async () => {
      await processor.process(
        requestDeletion(`/api/content-assets/${AVATAR_KEY}`),
      );
      expect(storage.deleteObject).toHaveBeenCalledWith(AVATAR_KEY);
      expect(mockPrisma.user.delete).toHaveBeenCalled();
    });

    it("deletes every data-export object the user has", async () => {
      mockPrisma.dataExportRequest.findMany.mockResolvedValue([
        { id: "req-1", fileUrl: `data-exports/${USER}/req-1.json` },
        { id: "req-2", fileUrl: `data-exports/${USER}/req-2.json` },
      ]);

      await processor.process(requestDeletion());

      expect(storage.deleteObject).toHaveBeenCalledWith(
        `data-exports/${USER}/req-1.json`,
      );
      expect(storage.deleteObject).toHaveBeenCalledWith(
        `data-exports/${USER}/req-2.json`,
      );
    });

    it("never deletes a third-party avatar", async () => {
      // Google sign-in writes `claims.picture` into this column. Those bytes
      // are not ours to erase.
      await processor.process(
        requestDeletion("https://lh3.googleusercontent.com/a/abc123"),
      );
      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).toHaveBeenCalled();
    });

    it("never deletes another user's avatar, even if the column names one", async () => {
      await processor.process(
        requestDeletion(
          "/api/content-assets/avatars/cmqlzzzzz0009abcdefghijkl/0123456789abcdef.png",
        ),
      );
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it("never deletes an unrelated prefix", async () => {
      // A catalog cover, an author's book, an audiobook master: all live in the
      // same bucket and none of them leaves when a reader does.
      for (const stored of [
        "/api/content-assets/catalog-books/eec/cover/a1b2c3d4e5f60718.jpg",
        "/api/content-assets/autor-books/cmql4vbi0001abcdefghijkl/cover-fedcba9876543210.jpg",
        "/api/content-assets/media/eec/c1/audiobook/0123456789abcdef.m4a",
      ]) {
        vi.clearAllMocks();
        lockedRow.rows = [{ id: USER, deleteRequestedAt: thirtyOneDaysAgo }];
        mockPrisma.dataExportRequest.findMany.mockResolvedValue([]);
        await processor.process(requestDeletion(stored));
        expect(storage.deleteObject).not.toHaveBeenCalled();
      }
    });

    it("deletes the objects BEFORE removing the account", async () => {
      // The order IS the contract. Reversed, a failing R2 delete would leave the
      // account gone and its export orphaned forever.
      const order: string[] = [];
      storage.deleteObject.mockImplementation(async () => {
        order.push("r2");
      });
      mockPrisma.user.delete.mockImplementation(async () => {
        order.push("db");
        return {};
      });
      mockPrisma.dataExportRequest.findMany.mockResolvedValue([
        { id: "req-1", fileUrl: `data-exports/${USER}/req-1.json` },
      ]);

      await processor.process(requestDeletion());

      expect(order).toEqual(["r2", "db"]);
    });

    it("does NOT delete the account when R2 refuses", async () => {
      // Privacy over availability: the account lives a little longer with its
      // data intact, and BullMQ retries. The alternative is unrecoverable.
      storage.deleteObject.mockRejectedValue(new Error("R2 unavailable"));
      mockPrisma.dataExportRequest.findMany.mockResolvedValue([
        { id: "req-1", fileUrl: `data-exports/${USER}/req-1.json` },
      ]);

      await expect(processor.process(requestDeletion())).rejects.toThrow(
        /R2 unavailable/,
      );
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it("touches no object at all when the request was cancelled under the lock", async () => {
      // Nothing may be destroyed on a path that then decides not to delete.
      lockedRow.rows = [{ id: USER, deleteRequestedAt: null }];
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER,
        deleteRequestedAt: thirtyOneDaysAgo,
      });
      mockPrisma.dataExportRequest.findMany.mockResolvedValue([
        { id: "req-1", fileUrl: `data-exports/${USER}/req-1.json` },
      ]);

      await processor.process(
        buildJob(JobName.FINALIZE_ACCOUNT_DELETION, {
          userId: USER,
          requestedAt: thirtyOneDaysAgo.toISOString(),
        }),
      );

      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });
  });
});
