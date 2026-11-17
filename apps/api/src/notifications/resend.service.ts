import { Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import type { Env } from "../config";
import {
  resolveEnvironment,
  type PsicoEnvironment,
} from "../shared/psico-environment";
import {
  describeMailGate,
  mailGate,
  parseMailAllowlist,
  type MailAllowlist,
} from "./mail-gate";

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
 *
 * Y una cuarta, desde el 2026-11-17: **con clave, fuera de producción, sólo a
 * destinatarios autorizados** (`EMAIL_ALLOWLIST`). Este es el único punto por
 * el que sale correo real — las cinco superficies pasan por `send()` —, así que es
 * donde vive la guarda. El razonamiento completo está en `mail-gate.ts`; lo
 * corto: incorporar una credencial no debe activar por accidente el digest
 * semanal a cada cuenta de staging.
 */
@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly client: Resend | null;
  private readonly fromAddress: string;
  private readonly allowlist: MailAllowlist;
  private readonly environment: PsicoEnvironment;

  constructor(private readonly config: ConfigService<Env, true>) {
    const apiKey = this.config.get("RESEND_API_KEY", { infer: true });
    this.fromAddress = this.config.get("EMAIL_FROM", { infer: true });
    this.allowlist = parseMailAllowlist(
      this.config.get("EMAIL_ALLOWLIST", { infer: true }),
    );
    this.environment = resolveEnvironment();

    if (apiKey) {
      this.client = new Resend(apiKey);
      this.logger.log(`Resend client initialised (from=${this.fromAddress})`);
    } else {
      this.client = null;
      this.logger.warn(
        `RESEND_API_KEY not set — emails will be logged to console instead of sent.`,
      );
    }

    // Se dice en el arranque, con clave o sin ella: la diferencia entre «no
    // sale nada» y «sale a todos» no puede quedar implícita en la ausencia de
    // una variable.
    const estado = describeMailGate(
      this.allowlist,
      this.environment,
      Boolean(apiKey),
    );
    if (apiKey && this.allowlist.entries.length === 0) {
      if (this.environment === "production")
        this.logger.log(`[correo] ${estado}`);
      else this.logger.warn(`[correo] ${estado}`);
    } else {
      this.logger.log(`[correo] ${estado}`);
    }
    if (this.allowlist.malformed.length > 0) {
      this.logger.warn(
        `[correo] EMAIL_ALLOWLIST: entradas ilegibles, que NO autorizan a nadie: ${this.allowlist.malformed.join(", ")}`,
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

    // Hay cliente: esto saldría de verdad. La guarda va ANTES de la llamada.
    //
    // Un destinatario retenido no es un error del remitente: el digest hace
    // fan-out sobre muchas personas y lanzar aquí abortaría la tanda entera por
    // una dirección. Se registra y se sigue — y el registro nombra el motivo,
    // para que «no llegó» no se confunda con «falló».
    const verdict = mailGate(input.to, this.allowlist, this.environment);
    if (!verdict.send) {
      this.logger.warn(
        `[email · retenido] to=${input.to} tag=${input.tag ?? "-"} motivo=${verdict.reason}`,
      );
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
