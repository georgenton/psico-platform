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
    book: { findMany: vi.fn().mockResolvedValue([]) },
    edition: { findFirst: vi.fn().mockResolvedValue(null) },
    revisionUnit: { count: vi.fn().mockResolvedValue(0) },
    userProgress: { findMany: vi.fn().mockResolvedValue([]) },
    subscription: { findUnique: vi.fn().mockResolvedValue(null) },
    guideSession: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const mockStorage = {
    // `uploadFile` stays mocked so a test can prove the processor never calls it:
    // it returns `${R2_PUBLIC_URL}/${key}`, and that base is the authenticated S3
    // endpoint, so the link it produced was never downloadable.
    uploadFile: vi.fn().mockResolvedValue("https://r2.example/exports/x.json"),
    putObject: vi.fn().mockResolvedValue(undefined),
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
    mockStorage.putObject.mockResolvedValue(undefined);
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
    expect(mockStorage.putObject).toHaveBeenCalledTimes(1);
    expect(mockStorage.uploadFile).not.toHaveBeenCalled();
    const [buffer, key, mime] = mockStorage.putObject.mock.calls[0];
    expect(mime).toBe("application/json");
    expect(key).toMatch(/^data-exports\/user-1\/req-1\.json$/);
    const parsed = JSON.parse(buffer.toString("utf-8"));
    expect(parsed._meta.exportSchemaVersion).toBe(1);
    expect(parsed.user.id).toBe("user-1");

    // READY write with the OBJECT KEY, not a URL. A URL in this column is a
    // link that keeps working for anybody who ever reads the row, and the file
    // is the user's whole profile and reading history.
    expect(mockPrisma.dataExportRequest.update).toHaveBeenLastCalledWith({
      where: { id: "req-1" },
      data: expect.objectContaining({
        status: "READY",
        fileUrl: "data-exports/user-1/req-1.json",
      }),
    });
    const readyWrite = mockPrisma.dataExportRequest.update.mock.calls.at(-1)![0]
      .data as { fileUrl: string };
    expect(readyWrite.fileUrl).not.toMatch(/^https?:\/\//);
    expect(readyWrite.fileUrl).not.toContain("X-Amz-Signature");

    // Notification email — and it must NOT carry the file. A link to the export
    // in an inbox outlives every expiry we could set on it.
    expect(mockResend.send).toHaveBeenCalledTimes(1);
    const mail = mockResend.send.mock.calls[0][0] as {
      tag: string;
      html: string;
      text: string;
    };
    expect(mail.tag).toBe("data-export-ready");
    expect(mail.html).not.toContain("data-exports/");
    expect(mail.text).not.toContain("data-exports/");
    expect(mail.html).toContain("/dashboard/perfil");
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

    expect(mockStorage.putObject).not.toHaveBeenCalled();
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
    mockStorage.putObject.mockRejectedValueOnce(new Error("R2 timeout"));

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
    mockStorage.putObject.mockRejectedValueOnce(new Error("R2 timeout"));

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
