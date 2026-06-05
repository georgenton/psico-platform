import { Injectable, Logger } from "@nestjs/common";

/**
 * PushService — Sprint S43.
 *
 * Thin client over the Expo Push API. We deliberately avoid
 * `expo-server-sdk` (extra dep + WebSocket noise) in favor of a plain
 * fetch — the Expo Push HTTP endpoint accepts a JSON array of message
 * envelopes, batches up to 100 per call.
 *
 * Failure model:
 * - Bad tokens (DeviceNotRegistered) come back in the response, NOT as
 *   an HTTP error. The caller is expected to prune them from DB.
 * - Network / 5xx errors propagate so BullMQ retries kick in.
 *
 * We don't enforce rate limits ourselves — Expo's API caps at ~600
 * notifications/sec which is fine for our scale. If we ever bulk-blast,
 * chunk into 100-msg batches.
 */
export interface PushMessage {
  to: string; // Expo push token
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Deep-link route, e.g. "/diario" or "/eco/threads/abc". */
  url?: string;
}

export interface PushReceipt {
  status: "ok" | "error";
  /** Token Expo flags as invalid; caller should prune from DB. */
  invalidToken?: string;
  /** Original error code from Expo for debugging. */
  errorCode?: string;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  /**
   * Send a single push message to many tokens. Returns one receipt per
   * token (parallel arrays). Tokens that are obviously not Expo tokens
   * (e.g. future web push) are skipped with status="error".
   */
  async sendToTokens(
    tokens: string[],
    message: Omit<PushMessage, "to">,
  ): Promise<PushReceipt[]> {
    const expoTokens = tokens.filter(
      (t) =>
        t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["),
    );
    if (expoTokens.length === 0) return tokens.map(() => ({ status: "error" }));

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
      // Transport failure: caller's BullMQ retry will run the job again.
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

    // Map back into the original `tokens` order (web/unknown tokens get
    // an error placeholder). Easier debugging for the caller.
    let cursor = 0;
    return tokens.map((tok) => {
      if (
        !tok.startsWith("ExponentPushToken[") &&
        !tok.startsWith("ExpoPushToken[")
      ) {
        return { status: "error" as const };
      }
      const r = data[cursor++];
      if (!r) return { status: "error" as const };
      if (r.status === "ok") return { status: "ok" as const };
      return {
        status: "error" as const,
        errorCode: r.details?.error,
        // DeviceNotRegistered = stale token; caller should DELETE it.
        invalidToken:
          r.details?.error === "DeviceNotRegistered" ? tok : undefined,
      };
    });
  }
}
