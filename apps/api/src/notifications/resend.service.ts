import { Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import type { Env } from "../config";

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Fully-rendered HTML. The caller is responsible for templating. */
  html: string;
  /** Plaintext fallback for clients that don't render HTML. */
  text?: string;
  /**
   * Per-template tag used for analytics in Resend dashboard. Examples:
   * "verify-email", "password-reset". One value per template.
   */
  tag?: string;
}

/**
 * Thin wrapper around the Resend SDK with three behaviours by environment:
 *
 *  - production       → real Resend send. Failures throw (caller's job to swallow).
 *  - dev / test       → logs the email payload to console. No network call.
 *  - prod without key → defensive: same as dev. envSchema.superRefine should
 *                       have rejected boot in this case, but we degrade safely
 *                       just in case (e.g. a misconfigured replica).
 *
 * Why we don't await Resend in the dev path: keeps unit tests fast and avoids
 * fake network errors when developers don't have an internet connection.
 */
@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly client: Resend | null;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    const apiKey = this.config.get("RESEND_API_KEY", { infer: true });
    this.fromAddress = this.config.get("EMAIL_FROM", { infer: true });

    if (apiKey) {
      this.client = new Resend(apiKey);
      this.logger.log(`Resend client initialised (from=${this.fromAddress})`);
    } else {
      this.client = null;
      this.logger.warn(
        `RESEND_API_KEY not set — emails will be logged to console instead of sent.`,
      );
    }
  }

  async send(input: SendEmailInput): Promise<void> {
    if (!this.client) {
      // Dev / test fallback — log the email and resolve.
      this.logger.log(
        `[email · console fallback] to=${input.to} subject="${input.subject}" tag=${input.tag ?? "-"}`,
      );
      this.logger.debug(`[email body]\n${input.html}`);
      return;
    }

    const result = await this.client.emails.send({
      from: this.fromAddress,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.tag ? { tags: [{ name: "template", value: input.tag }] } : {}),
    });

    if (result.error) {
      // Resend returns { data: null, error: { message, name } } on failure.
      throw new Error(
        `Resend send failed (tag=${input.tag ?? "-"}): ${result.error.message}`,
      );
    }

    this.logger.log(
      `[email sent] to=${input.to} subject="${input.subject}" id=${result.data?.id ?? "?"}`,
    );
  }
}
