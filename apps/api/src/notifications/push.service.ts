import { Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import webpush from "web-push";
import type { Env } from "../config";

/**
 * PushService — Sprint S43 (Expo) + Sprint S47 (Web Push / VAPID).
 *
 * Single send surface for all push notifications across the platform. The
 * caller hands in raw `DeviceToken.token` strings and a uniform message;
 * the service routes each token to the right transport based on its prefix:
 *
 *   - `ExponentPushToken[…]` / `ExpoPushToken[…]`  → Expo Push HTTP API
 *   - `web:<JSON>`                                  → Web Push (VAPID) per RFC 8030
 *   - anything else                                 → status="error" (skipped)
 *
 * Why one service instead of one per transport:
 *  - Callers (WeeklyDigestProcessor, InactiveNudgeProcessor) shouldn't have
 *    to know whether a user has a mobile install, browser install, both, or
 *    neither. They just iterate `user.deviceTokens` and call `sendToTokens`.
 *  - Receipt mapping stays the same shape (`PushReceipt[]`), preserving the
 *    existing stale-token pruning logic.
 *
 * Failure model:
 * - Bad tokens come back inside the response with status="error" + optionally
 *   `invalidToken` set (caller deletes from DB).
 * - Network errors propagate so BullMQ retries the job.
 * - Web push without VAPID keys configured: tokens are skipped with a logged
 *   warning, not an exception — the same job still delivers Expo tokens.
 */
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Deep-link route, e.g. "/diario" or "/eco/threads/abc". */
  url?: string;
}

export interface PushReceipt {
  status: "ok" | "error";
  /** Token Expo / WebPush flags as invalid; caller should prune from DB. */
  invalidToken?: string;
  /** Original error code for debugging. */
  errorCode?: string;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Sprint S47 — serialized Web Push subscription (output of `PushSubscription.toJSON()`). */
interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  /**
   * Lazily initialized + memoized. We set VAPID details exactly once per
   * process (the `web-push` library mutates module-level state internally,
   * so calling repeatedly is wasteful but not unsafe).
   */
  private vapidInitialized = false;
  private vapidAvailable = false;

  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * Send a single push message to many tokens. Returns one receipt per
   * input token (in the same order). Mixed batches of Expo + Web tokens
   * are split internally, dispatched in parallel, and re-zipped on the way
   * out so the caller's index-based pruning still works.
   */
  async sendToTokens(
    tokens: string[],
    message: PushMessage,
  ): Promise<PushReceipt[]> {
    // Partition by platform, remembering the original index for re-merge.
    const expoIdx: number[] = [];
    const webIdx: number[] = [];
    const unknownIdx: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (
        t.startsWith("ExponentPushToken[") ||
        t.startsWith("ExpoPushToken[")
      ) {
        expoIdx.push(i);
      } else if (t.startsWith("web:")) {
        webIdx.push(i);
      } else {
        unknownIdx.push(i);
      }
    }

    const receipts: PushReceipt[] = tokens.map(() => ({ status: "error" }));

    // Sprint S43 — Expo branch.
    if (expoIdx.length > 0) {
      const expoTokens = expoIdx.map((i) => tokens[i]!);
      const expoReceipts = await this.sendExpo(expoTokens, message);
      expoIdx.forEach((origIdx, j) => {
        receipts[origIdx] = expoReceipts[j]!;
      });
    }

    // Sprint S47 — Web Push branch.
    if (webIdx.length > 0) {
      const webTokens = webIdx.map((i) => tokens[i]!);
      const webReceipts = await this.sendWeb(webTokens, message);
      webIdx.forEach((origIdx, j) => {
        receipts[origIdx] = webReceipts[j]!;
      });
    }

    // Unknown shapes already initialized to status="error" above.
    if (unknownIdx.length > 0) {
      this.logger.warn(
        `PushService received ${unknownIdx.length} token(s) with unknown shape; skipped`,
      );
    }

    return receipts;
  }

  // ───────────────────────────────────────────────────────────────────
  // Expo branch (Sprint S43)
  // ───────────────────────────────────────────────────────────────────

  private async sendExpo(
    expoTokens: string[],
    message: PushMessage,
  ): Promise<PushReceipt[]> {
    const payload = expoTokens.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      sound: "default",
      data: { ...(message.data ?? {}), url: message.url ?? null },
    }));

    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      this.logger.error(
        `Expo push transport failed: ${(err as Error).message}`,
      );
      throw err;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      this.logger.error(`Expo push HTTP ${res.status}: ${txt}`);
      throw new Error(`EXPO_PUSH_${res.status}`);
    }

    const json = (await res.json()) as {
      data?: Array<{
        status: "ok" | "error";
        message?: string;
        details?: { error?: string };
      }>;
    };
    const data = json.data ?? [];

    return expoTokens.map((tok, i) => {
      const r = data[i];
      if (!r) return { status: "error" as const };
      if (r.status === "ok") return { status: "ok" as const };
      return {
        status: "error" as const,
        errorCode: r.details?.error,
        invalidToken:
          r.details?.error === "DeviceNotRegistered" ? tok : undefined,
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // Web Push branch (Sprint S47)
  // ───────────────────────────────────────────────────────────────────

  /**
   * Send a push to many Web subscriptions. Unlike Expo, each subscription
   * hits its own push service URL (Mozilla, Google, Apple) so we fan out
   * with `Promise.allSettled` and translate each rejection into a per-token
   * receipt. One subscription failing doesn't block the others.
   */
  private async sendWeb(
    webTokens: string[],
    message: PushMessage,
  ): Promise<PushReceipt[]> {
    if (!this.ensureVapid()) {
      // No keys configured — return error per token but DON'T throw. The
      // overall job (e.g. WeeklyDigest) should still deliver Expo tokens.
      this.logger.warn(
        `Web push skipped for ${webTokens.length} token(s): VAPID keys not configured`,
      );
      return webTokens.map(() => ({ status: "error" }));
    }

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url ?? "/",
      data: message.data ?? {},
    });

    const results = await Promise.allSettled(
      webTokens.map(async (tok) => {
        const sub = parseWebToken(tok);
        if (!sub) {
          // Malformed JSON after `web:` — prune.
          return {
            status: "error" as const,
            errorCode: "InvalidSubscription",
            invalidToken: tok,
          };
        }
        try {
          await webpush.sendNotification(sub, payload, { TTL: 3600 });
          return { status: "ok" as const };
        } catch (err) {
          // web-push throws a WebPushError with .statusCode for HTTP failures.
          const statusCode = (err as { statusCode?: number }).statusCode;
          const isStale = statusCode === 404 || statusCode === 410;
          return {
            status: "error" as const,
            errorCode: statusCode ? `WEBPUSH_${statusCode}` : "WEBPUSH_UNKNOWN",
            invalidToken: isStale ? tok : undefined,
          };
        }
      }),
    );

    return results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { status: "error" as const, errorCode: "WEBPUSH_THROW" },
    );
  }

  /**
   * Set the VAPID details with `web-push` exactly once, on first use. Returns
   * `true` if VAPID is configured and we're ready to send. `false` means
   * the operator hasn't set the keys and Web tokens will be skipped — the
   * env schema's `superRefine` already rejects the half-set state at boot.
   */
  private ensureVapid(): boolean {
    if (this.vapidInitialized) return this.vapidAvailable;
    this.vapidInitialized = true;
    const pub = this.config.get("VAPID_PUBLIC_KEY", { infer: true });
    const priv = this.config.get("VAPID_PRIVATE_KEY", { infer: true });
    const sub = this.config.get("VAPID_SUBJECT", { infer: true });
    if (!pub || !priv || !sub) {
      this.vapidAvailable = false;
      return false;
    }
    webpush.setVapidDetails(sub, pub, priv);
    this.vapidAvailable = true;
    return true;
  }
}

/**
 * Parse a `web:<JSON>` token back into a Web Push subscription object.
 * Returns `null` for any malformed input; the caller treats null as a
 * stale-token signal so it gets pruned.
 *
 * Exported for tests.
 */
export function parseWebToken(token: string): WebPushSubscription | null {
  if (!token.startsWith("web:")) return null;
  try {
    const json = JSON.parse(token.slice(4)) as Partial<WebPushSubscription>;
    if (
      typeof json.endpoint !== "string" ||
      !json.keys ||
      typeof json.keys.p256dh !== "string" ||
      typeof json.keys.auth !== "string"
    ) {
      return null;
    }
    return {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    };
  } catch {
    return null;
  }
}
