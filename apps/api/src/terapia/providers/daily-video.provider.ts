import { Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { IVideoProvider } from "./video-provider.interface";

/**
 * DailyVideoProvider — Sprint S69.
 *
 * Production-ready integration with the Daily.co REST API. ADR 0014
 * documents the strategy decision (Daily.co + iframe-embedded SDK over
 * Whereby/LiveKit).
 *
 * Flow:
 *   - `createRoom`     → POST   https://api.daily.co/v1/rooms
 *   - `createJoinToken`→ POST   https://api.daily.co/v1/meeting-tokens
 *   - `destroyRoom`    → DELETE https://api.daily.co/v1/rooms/:name
 *
 * Auth: bearer DAILY_API_KEY (provisioned by ops, stored in Railway env).
 *
 * Room naming: `session-<sessionId>`. Stable across joins; idempotent
 * createRoom for retries (Daily returns 409 conflict if we try to create
 * the same name twice — we swallow that and re-fetch the URL).
 *
 * Privacy: Daily.co does NOT record sessions by default. We explicitly
 * disable cloud recording at room creation; if the client side opts in,
 * the room properties would need to change. For v1 we keep this off.
 */
@Injectable()
export class DailyVideoProvider implements IVideoProvider {
  readonly name = "daily";
  private readonly logger = new Logger("DailyVideoProvider");
  private readonly apiKey: string | undefined;
  private readonly domain: string | undefined;
  private readonly baseUrl = "https://api.daily.co/v1";

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>("DAILY_API_KEY") ?? undefined;
    this.domain = this.config.get<string>("DAILY_DOMAIN") ?? undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.domain);
  }

  async createRoom(opts: {
    sessionId: string;
    expiresInSec: number;
  }): Promise<{ roomUrl: string; expiresAt: Date }> {
    this.assertConfigured();
    const name = roomNameFor(opts.sessionId);
    const expSec = Math.floor(Date.now() / 1000) + opts.expiresInSec;
    const expiresAt = new Date(expSec * 1000);

    const res = await fetch(`${this.baseUrl}/rooms`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({
        name,
        privacy: "private",
        properties: {
          exp: expSec,
          enable_recording: false,
          enable_chat: false,
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
          max_participants: 2,
          eject_at_room_exp: true,
        },
      }),
    });

    // 409 = room already exists — idempotent path (retry-safe).
    if (res.status === 409) {
      const existing = await this.fetchRoom(name);
      if (!existing) {
        throw new Error("DAILY_ROOM_CONFLICT_NO_EXISTING");
      }
      return { roomUrl: existing.url, expiresAt };
    }

    if (!res.ok) {
      const body = await safeReadText(res);
      this.logger.error(
        `createRoom failed status=${res.status} body=${truncate(body)}`,
      );
      throw new Error(`DAILY_CREATE_ROOM_FAILED:${res.status}`);
    }

    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      throw new Error("DAILY_CREATE_ROOM_MISSING_URL");
    }
    return { roomUrl: data.url, expiresAt };
  }

  async createJoinToken(opts: {
    roomUrl: string;
    userName: string;
    isOwner: boolean;
    expiresInSec: number;
  }): Promise<{ joinToken: string; expiresAt: Date }> {
    this.assertConfigured();
    const expSec = Math.floor(Date.now() / 1000) + opts.expiresInSec;
    const expiresAt = new Date(expSec * 1000);
    const roomName = nameFromUrl(opts.roomUrl);
    if (!roomName) {
      throw new Error("DAILY_INVALID_ROOM_URL");
    }

    const res = await fetch(`${this.baseUrl}/meeting-tokens`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: opts.userName,
          is_owner: opts.isOwner,
          exp: expSec,
        },
      }),
    });

    if (!res.ok) {
      const body = await safeReadText(res);
      this.logger.error(
        `createJoinToken failed status=${res.status} body=${truncate(body)}`,
      );
      throw new Error(`DAILY_CREATE_TOKEN_FAILED:${res.status}`);
    }

    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      throw new Error("DAILY_CREATE_TOKEN_MISSING_TOKEN");
    }
    return { joinToken: data.token, expiresAt };
  }

  async destroyRoom(roomUrl: string): Promise<void> {
    this.assertConfigured();
    const name = nameFromUrl(roomUrl);
    if (!name) {
      this.logger.warn(`destroyRoom: invalid roomUrl=${roomUrl}`);
      return;
    }
    const res = await fetch(`${this.baseUrl}/rooms/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: this.authHeaders(),
    });
    // 404 = already deleted (or never existed) — idempotent.
    if (res.status === 404) return;
    if (!res.ok) {
      const body = await safeReadText(res);
      this.logger.error(
        `destroyRoom failed status=${res.status} body=${truncate(body)}`,
      );
      // Non-fatal: room expires automatically.
    }
  }

  private async fetchRoom(
    name: string,
  ): Promise<{ url: string } | null> {
    const res = await fetch(`${this.baseUrl}/rooms/${encodeURIComponent(name)}`, {
      method: "GET",
      headers: this.authHeaders(),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ? { url: data.url } : null;
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error("DAILY_NOT_CONFIGURED");
    }
  }

  private authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }
}

export function roomNameFor(sessionId: string): string {
  // Daily room names accept [a-zA-Z0-9-_] and must be 1-100 chars.
  // Our session ids are cuid/uuid-like so safe; we prefix to keep them
  // findable in the Daily dashboard.
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 90);
  return `session-${safe}`;
}

export function nameFromUrl(roomUrl: string): string | null {
  try {
    const u = new URL(roomUrl);
    const seg = u.pathname.replace(/^\/+|\/+$/g, "");
    return seg || null;
  } catch {
    return null;
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function truncate(s: string, max = 200): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
