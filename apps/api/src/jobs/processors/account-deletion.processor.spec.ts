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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    mockPrisma.user.delete.mockResolvedValue({});
    processor = new AccountDeletionProcessor(mockPrisma as never);
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
