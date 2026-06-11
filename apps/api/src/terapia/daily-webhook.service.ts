import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { nameFromUrl } from "./providers/daily-video.provider";

/**
 * Daily.co webhook payload. Daily sends one of these events:
 *   - meeting.started       → set startedAt, status=IN_PROGRESS
 *   - meeting.ended         → set endedAt + actualDurationSec, status=COMPLETED
 *   - participant.joined    → log only (per-user join, may be 1-2 events)
 *   - participant.left      → log only
 *
 * Reference: https://docs.daily.co/reference/rest-api/webhooks
 */
export interface DailyWebhookEvent {
  version: string;
  type:
    | "meeting.started"
    | "meeting.ended"
    | "participant.joined"
    | "participant.left";
  id: string; // unique event id
  event_ts: number; // seconds since epoch
  payload: {
    room?: string; // room name (we encode session-<id>)
    meeting_id?: string; // Daily's internal meeting id
    duration?: number; // meeting.ended → seconds
    start_ts?: number; // meeting.started/ended → seconds since epoch
    end_ts?: number; // meeting.ended → seconds since epoch
    [key: string]: unknown;
  };
}

export type WebhookProcessResult =
  | { status: "applied"; type: string; sessionId: string }
  | { status: "ignored"; reason: string }
  | { status: "duplicate" };

@Injectable()
export class DailyWebhookService {
  private readonly logger = new Logger("DailyWebhookService");
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.webhookSecret =
      this.config.get<string>("DAILY_WEBHOOK_SECRET") ?? undefined;
  }

  /**
   * True when the webhook secret is set. When false, the controller MUST
   * reject all incoming events (fail-closed) so an unauthenticated caller
   * cannot mutate session state.
   */
  isConfigured(): boolean {
    return Boolean(this.webhookSecret && this.webhookSecret.length > 0);
  }

  /**
   * Verify Daily.co's HMAC signature header.
   *
   * Daily signs the raw JSON body with HMAC-SHA256 using the configured
   * webhook secret and sends the hex digest in `X-Webhook-Signature`.
   *
   * Uses `timingSafeEqual` to avoid leaking the secret through timing.
   */
  verifySignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!this.webhookSecret) return false;
    if (!signatureHeader) return false;

    const expected = createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");

    // timingSafeEqual requires equal-length buffers.
    if (signatureHeader.length !== expected.length) return false;

    try {
      return timingSafeEqual(
        Buffer.from(signatureHeader, "utf8"),
        Buffer.from(expected, "utf8"),
      );
    } catch {
      return false;
    }
  }

  /**
   * Apply a verified webhook event to the matching TherapySession.
   *
   * Room naming convention: `session-<sessionId>` — we strip the prefix to
   * locate the row. Unknown rooms are ignored (Daily may send events for
   * rooms we didn't create, e.g. dashboard testing).
   *
   * Idempotency: we never roll back state. Re-applying the same event is a
   * no-op for terminal states.
   */
  async process(event: DailyWebhookEvent): Promise<WebhookProcessResult> {
    const roomName = event.payload?.room;
    if (!roomName || typeof roomName !== "string") {
      return { status: "ignored", reason: "missing_room" };
    }
    const sessionId = sessionIdFromRoomName(roomName);
    if (!sessionId) {
      return { status: "ignored", reason: "room_not_session" };
    }

    const session = await this.prisma.therapySession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        endedAt: true,
        scheduledAt: true,
      },
    });
    if (!session) {
      this.logger.warn(
        `[daily] webhook ${event.type} for unknown session=${sessionId}`,
      );
      return { status: "ignored", reason: "session_not_found" };
    }

    switch (event.type) {
      case "meeting.started": {
        // Only set startedAt the first time. Idempotent for retries.
        if (session.startedAt) {
          return { status: "duplicate" };
        }
        const startedAt = event.payload.start_ts
          ? new Date(event.payload.start_ts * 1000)
          : new Date(event.event_ts * 1000);
        // If the session was CANCELLED or COMPLETED, don't override status.
        // (Defensive: Daily could send out-of-order events.)
        const data: Record<string, unknown> = { startedAt };
        if (session.status === "SCHEDULED") {
          data.status = "IN_PROGRESS";
        }
        await this.prisma.therapySession.update({
          where: { id: sessionId },
          data,
        });
        this.logger.log(
          `[daily] meeting.started session=${sessionId} startedAt=${startedAt.toISOString()}`,
        );
        return { status: "applied", type: event.type, sessionId };
      }

      case "meeting.ended": {
        if (session.endedAt) {
          return { status: "duplicate" };
        }
        const endedAt = event.payload.end_ts
          ? new Date(event.payload.end_ts * 1000)
          : new Date(event.event_ts * 1000);
        // Prefer the duration Daily reports; fall back to (endedAt - startedAt).
        let actualDurationSec: number | null = null;
        if (typeof event.payload.duration === "number") {
          actualDurationSec = Math.max(0, Math.round(event.payload.duration));
        } else if (session.startedAt) {
          actualDurationSec = Math.max(
            0,
            Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
          );
        }
        const data: Record<string, unknown> = { endedAt };
        if (actualDurationSec !== null) data.actualDurationSec = actualDurationSec;
        // Promote to COMPLETED only from active states. Preserve CANCELLED.
        if (
          session.status === "SCHEDULED" ||
          session.status === "IN_PROGRESS"
        ) {
          data.status = "COMPLETED";
        }
        await this.prisma.therapySession.update({
          where: { id: sessionId },
          data,
        });
        this.logger.log(
          `[daily] meeting.ended session=${sessionId} endedAt=${endedAt.toISOString()} dur=${actualDurationSec}s`,
        );
        return { status: "applied", type: event.type, sessionId };
      }

      case "participant.joined":
      case "participant.left":
        // We don't persist per-participant events for v1. Pulso could
        // aggregate them later for engagement metrics.
        this.logger.log(
          `[daily] ${event.type} session=${sessionId} (no-op)`,
        );
        return { status: "ignored", reason: "noop_event" };

      default:
        return { status: "ignored", reason: "unknown_type" };
    }
  }
}

/**
 * Reverse of `roomNameFor` in daily-video.provider.ts: given a room name
 * like `session-clxyz` returns `clxyz`. Returns null for room names that
 * don't follow our convention.
 *
 * Also accepts a full URL (resilient against Daily passing either form).
 */
export function sessionIdFromRoomName(roomOrUrl: string): string | null {
  // If it's a URL, extract the path segment first.
  let name = roomOrUrl;
  if (roomOrUrl.startsWith("https://") || roomOrUrl.startsWith("http://")) {
    name = nameFromUrl(roomOrUrl) ?? "";
  }
  if (!name.startsWith("session-")) return null;
  const id = name.slice("session-".length);
  return id.length > 0 ? id : null;
}
