import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { DataExportProcessor } from "./data-export.processor";
import { JobName } from "../queue-names";

function buildJob<T>(name: string, data: T, attemptsMade = 0, attempts = 2) {
  return {
    id: "job-1",
    name,
    data,
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<T>;
}

describe("DataExportProcessor", () => {
  let processor: DataExportProcessor;

  const mockPrisma = {
    dataExportRequest: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    user: { findUnique: vi.fn() },
    userProgress: { findMany: vi.fn().mockResolvedValue([]) },
    subscription: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const mockStorage = {
    uploadFile: vi.fn().mockResolvedValue("https://r2.example/exports/x.json"),
  };
  const mockResend = { send: vi.fn().mockResolvedValue(undefined) };
  const mockConfig = {
    get: vi.fn(() => "https://app.example.com"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    mockPrisma.dataExportRequest.update.mockResolvedValue({});
    mockStorage.uploadFile.mockResolvedValue(
      "https://r2.example/exports/x.json",
    );
    mockResend.send.mockResolvedValue(undefined);

    processor = new DataExportProcessor(
      mockPrisma as never,
      mockStorage as never,
      mockResend as never,
      mockConfig as never,
    );
  });

  it("happy path: marks PROCESSING → uploads JSON → marks READY → sends email", async () => {
    mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
      id: "req-1",
      user: {
        id: "user-1",
        email: "user@example.com",
        deleteRequestedAt: null,
      },
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      firstName: "Jane",
      name: "Jane Doe",
      city: null,
      avatarUrl: null,
      role: "USER",
      plan: "FREE",
      emailVerified: true,
      authProvider: "LOCAL",
      createdAt: new Date(),
      mood: null,
      moodUpdatedAt: null,
      currentStreakDays: 0,
      longestStreakDays: 0,
      profile: null,
      preferences: null,
      readerPreferences: null,
      notificationSettings: null,
      privacySettings: null,
    });

    await processor.process(
      buildJob(JobName.RUN_DATA_EXPORT, {
        requestId: "req-1",
        userId: "user-1",
      }),
    );

    // PROCESSING write
    expect(mockPrisma.dataExportRequest.update).toHaveBeenNthCalledWith(1, {
      where: { id: "req-1" },
      data: { status: "PROCESSING" },
    });

    // Upload happened with a JSON-shaped buffer
    expect(mockStorage.uploadFile).toHaveBeenCalledTimes(1);
    const [buffer, key, mime] = mockStorage.uploadFile.mock.calls[0];
    expect(mime).toBe("application/json");
    expect(key).toMatch(/^data-exports\/user-1\/req-1\.json$/);
    const parsed = JSON.parse(buffer.toString("utf-8"));
    expect(parsed._meta.exportSchemaVersion).toBe(1);
    expect(parsed.user.id).toBe("user-1");

    // READY write with the uploaded URL
    expect(mockPrisma.dataExportRequest.update).toHaveBeenLastCalledWith({
      where: { id: "req-1" },
      data: expect.objectContaining({
        status: "READY",
        fileUrl: "https://r2.example/exports/x.json",
      }),
    });

    // Notification email
    expect(mockResend.send).toHaveBeenCalledTimes(1);
    expect(mockResend.send.mock.calls[0][0].tag).toBe("data-export-ready");
  });

  it("skips quietly if the user requested deletion before the worker ran", async () => {
    mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
      id: "req-1",
      user: {
        id: "user-1",
        email: "user@example.com",
        deleteRequestedAt: new Date(),
      },
    });

    await processor.process(
      buildJob(JobName.RUN_DATA_EXPORT, {
        requestId: "req-1",
        userId: "user-1",
      }),
    );

    expect(mockStorage.uploadFile).not.toHaveBeenCalled();
    expect(mockResend.send).not.toHaveBeenCalled();
  });

  it("rethrows to let BullMQ retry; does NOT mark FAILED on a non-final attempt", async () => {
    mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
      id: "req-1",
      user: { id: "user-1", email: "u@x.z", deleteRequestedAt: null },
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "u@x.z",
      firstName: null,
      name: "U",
      city: null,
      avatarUrl: null,
      role: "USER",
      plan: "FREE",
      emailVerified: true,
      authProvider: "LOCAL",
      createdAt: new Date(),
      mood: null,
      moodUpdatedAt: null,
      currentStreakDays: 0,
      longestStreakDays: 0,
      profile: null,
      preferences: null,
      readerPreferences: null,
      notificationSettings: null,
      privacySettings: null,
    });
    mockStorage.uploadFile.mockRejectedValueOnce(new Error("R2 timeout"));

    await expect(
      processor.process(
        buildJob(
          JobName.RUN_DATA_EXPORT,
          { requestId: "req-1", userId: "user-1" },
          0, // attemptsMade
          2, // attempts (so 0+1 < 2 → NOT final)
        ),
      ),
    ).rejects.toThrow("R2 timeout");

    // Updates: PROCESSING only. NO FAILED on a non-final attempt.
    const statusUpdates = mockPrisma.dataExportRequest.update.mock.calls.map(
      (c) => c[0].data.status,
    );
    expect(statusUpdates).toEqual(["PROCESSING"]);
  });

  it("on FINAL failed attempt, marks status=FAILED before rethrowing", async () => {
    mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
      id: "req-1",
      user: { id: "user-1", email: "u@x.z", deleteRequestedAt: null },
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "u@x.z",
      firstName: null,
      name: "U",
      city: null,
      avatarUrl: null,
      role: "USER",
      plan: "FREE",
      emailVerified: true,
      authProvider: "LOCAL",
      createdAt: new Date(),
      mood: null,
      moodUpdatedAt: null,
      currentStreakDays: 0,
      longestStreakDays: 0,
      profile: null,
      preferences: null,
      readerPreferences: null,
      notificationSettings: null,
      privacySettings: null,
    });
    mockStorage.uploadFile.mockRejectedValueOnce(new Error("R2 timeout"));

    await expect(
      processor.process(
        buildJob(
          JobName.RUN_DATA_EXPORT,
          { requestId: "req-1", userId: "user-1" },
          1, // attemptsMade
          2, // attempts (1+1 === 2 → final)
        ),
      ),
    ).rejects.toThrow("R2 timeout");

    const statusUpdates = mockPrisma.dataExportRequest.update.mock.calls.map(
      (c) => c[0].data.status,
    );
    expect(statusUpdates).toEqual(["PROCESSING", "FAILED"]);
  });
});
