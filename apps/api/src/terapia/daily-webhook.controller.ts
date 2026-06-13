import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import type { Request } from "express";
import {
  type DailyWebhookEvent,
  DailyWebhookService,
} from "./daily-webhook.service";

/**
 * Daily.co webhook endpoint — receives meeting lifecycle events to capture
 * the real session length.
 *
 * Path: `POST /api/terapia/webhooks/daily`
 *
 * Security model:
 *  - No `@UseGuards(JwtAuthGuard)` — Daily.co can't authenticate.
 *  - HMAC SHA-256 signature in `X-Webhook-Signature` validated against
 *    `DAILY_WEBHOOK_SECRET`.
 *  - Fail-closed: when the secret is unset, returns 503 (NOT 200) so a
 *    misconfigured prod can't accept unauthenticated state changes.
 *  - `@SkipThrottle()` — Daily can burst-fire multiple events per session.
 *
 * Raw body capture: NestJS doesn't pass the raw buffer by default. The main
 * bootstrap configures Express's `verify` callback to stash it on the
 * request as `req.rawBody` for HMAC verification.
 */
@ApiTags("terapia")
@Controller("terapia/webhooks/daily")
@SkipThrottle()
export class DailyWebhookController {
  private readonly logger = new Logger("DailyWebhookController");

  constructor(private readonly service: DailyWebhookService) {}

  @Post()
  @ApiOperation({
    summary: "Recibe eventos de Daily.co (meeting.started, meeting.ended).",
  })
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: Request): Promise<{ ok: true; result?: string }> {
    if (!this.service.isConfigured()) {
      throw new ServiceUnavailableException("DAILY_WEBHOOK_NOT_CONFIGURED");
    }

    const rawBody = readRawBody(req);
    if (!rawBody) {
      throw new UnauthorizedException("MISSING_BODY");
    }

    const signature = readSignatureHeader(req);
    if (!this.service.verifySignature(rawBody, signature)) {
      this.logger.warn("[daily] webhook signature mismatch");
      throw new UnauthorizedException("INVALID_SIGNATURE");
    }

    let event: DailyWebhookEvent;
    try {
      event = JSON.parse(rawBody) as DailyWebhookEvent;
    } catch {
      throw new UnauthorizedException("INVALID_BODY");
    }

    const result = await this.service.process(event);
    return { ok: true, result: result.status };
  }
}

function readRawBody(req: Request): string | undefined {
  // Express middleware in main.ts stashes the verified raw body here.
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (raw && raw.length > 0) return raw.toString("utf8");
  // Fallback: stringify the parsed body. Less robust but avoids null state.
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return undefined;
}

function readSignatureHeader(req: Request): string | undefined {
  // Daily.co uses `X-Webhook-Signature` (case-insensitive in HTTP).
  const value =
    req.headers["x-webhook-signature"] ?? req.headers["x-daily-signature"];
  if (Array.isArray(value)) return value[0];
  return value;
}
