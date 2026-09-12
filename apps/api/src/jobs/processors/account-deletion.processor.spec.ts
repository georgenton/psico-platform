import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { AccountDeletionProcessor } from "./account-deletion.processor";
import { JobName } from "../queue-names";

function buildJob<T>(name: string, data: T) {
  return { id: "job-1", name, data } as unknown as Job<T>;
}

describe("AccountDeletionProcessor", () => {
  let processor: AccountDeletionProcessor;
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
  };

  /**
   * The Círculos detach the processor now runs before the delete.
   *
   * A spy, not a stub that swallows: the ORDER matters (ending live activities
   * after removing the account leaves a window where the seat is unreachable
   * and the activity still live), and one of the tests below asserts it.
   */
  const circles = {
    detachUser: vi.fn().mockResolvedValue({
      memberships: 0,
      activitiesCancelled: 0,
      activitiesClosed: 0,
      seatsWithdrawn: 0,
      invitationsRevoked: 0,
      guestSessionsRevoked: 0,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    mockPrisma.user.delete.mockResolvedValue({});
    circles.detachUser.mockResolvedValue({
      memberships: 0,
      activitiesCancelled: 0,
      activitiesClosed: 0,
      seatsWithdrawn: 0,
      invitationsRevoked: 0,
      guestSessionsRevoked: 0,
    });
    processor = new AccountDeletionProcessor(
      mockPrisma as never,
      circles as never,
    );
  });

  const now = Date.now();
  const thirtyOneDaysAgo = new Date(now - 31 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000);

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
