import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { EmailProcessor } from "./email.processor";
import { JobName } from "../queue-names";

function buildJob<T>(name: string, data: T, attemptsMade = 0): Job<T> {
  return {
    id: "job-1",
    name,
    data,
    attemptsMade,
    opts: { attempts: 3 },
  } as unknown as Job<T>;
}

describe("EmailProcessor", () => {
  let processor: EmailProcessor;
  const mockResend = { send: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    processor = new EmailProcessor(mockResend as never);
  });

  it("delegates to ResendService.send with the exact job payload", async () => {
    const payload = {
      to: "user@example.com",
      subject: "Welcome",
      html: "<p>hi</p>",
      text: "hi",
      tag: "verify-email",
    };

    await processor.process(buildJob(JobName.SEND_EMAIL, payload));

    expect(mockResend.send).toHaveBeenCalledWith(payload);
  });

  it("throws if the job name is unknown — guards against future bugs", async () => {
    await expect(
      processor.process(
        buildJob("wrong-name", { to: "x", subject: "x", html: "x" }),
      ),
    ).rejects.toThrow(/unknown job name/);
  });

  it("propagates Resend errors so BullMQ can retry per attempts policy", async () => {
    mockResend.send.mockRejectedValueOnce(new Error("Resend 503"));

    await expect(
      processor.process(
        buildJob(JobName.SEND_EMAIL, {
          to: "x@y.z",
          subject: "x",
          html: "x",
        }),
      ),
    ).rejects.toThrow("Resend 503");
  });
});
