import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ResendService } from "../../notifications";
import { JobName, QueueName, type EmailJobPayload } from "../queue-names";

/**
 * Consumes the `email` queue. Delegates to ResendService.send — same code
 * path as in-process emails (Sprint S2 register flow). The queue exists for:
 *  - Retry on transient failures (BullMQ exponential backoff 1s/5s/25s)
 *  - Decoupling API response time from email send latency
 *  - Survival across deploys (jobs persist in Redis)
 *
 * Failures: throw the original error. BullMQ catches, retries per attempts,
 * eventually moves to the failed jobs list. Operators can re-run via the
 * BullMQ UI or `queue.retry(jobId)`.
 */
@Processor(QueueName.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly resend: ResendService) {
    super();
  }

  async process(job: Job<EmailJobPayload>): Promise<void> {
    if (job.name !== JobName.SEND_EMAIL) {
      // BullMQ guarantees names from `add(name, ...)`. This guards against
      // a future bug where two job kinds get crossed.
      throw new Error(`EmailProcessor received unknown job name: ${job.name}`);
    }

    const { to, subject, html, text, tag } = job.data;
    this.logger.log(
      `Processing email job ${job.id} · attempt=${job.attemptsMade + 1}/${job.opts.attempts ?? 1} · to=${to} · tag=${tag ?? "-"}`,
    );

    await this.resend.send({ to, subject, html, text, tag });
  }
}
