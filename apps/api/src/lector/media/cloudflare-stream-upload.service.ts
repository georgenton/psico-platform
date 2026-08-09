import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config";

/**
 * C3 — INGESTING a chapter video into Cloudflare Stream.
 *
 * Deliberately separate from `CloudflareStreamAccessService`. That one answers
 * "may this reader watch this video, for the next fifteen minutes"; this one
 * answers "where do these bytes go, and have they finished processing". Same
 * provider, different promise, different failure modes — and the access service
 * is on the reader's hot path, which is not somewhere to put an ingest concern.
 *
 * ── Why the bytes never touch this API ────────────────────────────────────
 *
 * Cloudflare mints a ONE-TIME upload URL bound to a video it has already
 * allocated. The browser posts the file straight there. We considered proxying
 * through the API for symmetry with audio (C2B), and rejected it:
 *
 *   - a chapter video is hundreds of megabytes where an audio master is tens,
 *     so it runs into request body limits and proxy timeouts that audio never
 *     reaches;
 *   - proxying would hold that whole body in the API process, competing with
 *     every reader request on the same dyno;
 *   - the one-time URL carries no credential, so handing it to a browser gives
 *     the browser nothing it could reuse or abuse.
 *
 * The API keeps the part that actually needs authority: which chapter the video
 * belongs to, what it is called, and whether it may be published.
 *
 * Nothing here is logged: not the API token, not the account id, not the video
 * UID, not the upload URL, not the raw provider response. Every failure —
 * missing configuration, non-2xx, malformed body, network error, timeout —
 * surfaces as the same value-free `MEDIA_PROVIDER_UNAVAILABLE`, matching the
 * access service exactly.
 */

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * How long the editor has to actually pick the file, in seconds.
 *
 * Long enough to survive "I'll find it after this meeting", short enough that a
 * forgotten intent stops being usable the same day. Cloudflare requires between
 * two minutes and six hours.
 */
export const UPLOAD_URL_TTL_SEC = 2 * 60 * 60;

/**
 * Ceiling on the video's own duration, in seconds.
 *
 * Not a byte limit — Stream bills and reasons in minutes, and a chapter video is
 * a chapter video. A three-hour file reaching this endpoint is a mistaken
 * selection, and refusing it at intent time costs the editor nothing, whereas
 * discovering it after a long upload costs them the upload.
 */
export const VIDEO_MAX_DURATION_SEC = 2 * 60 * 60;

/**
 * What the ingest side of the provider can tell us, normalized.
 *
 * `AWAITING_UPLOAD` is ours, not Cloudflare's: the provider reports a freshly
 * allocated video as `pendingupload`, `inprogress` or `queued` depending on how
 * far it got, and an editor does not benefit from that distinction.
 */
export type StreamIngestState =
  | "AWAITING_UPLOAD"
  | "PROCESSING"
  | "READY"
  | "ERROR";

export interface StreamDirectUpload {
  videoUid: string;
  /** One-time, credential-free, short-lived. Safe to hand to a browser. */
  uploadUrl: string;
  expiresAt: string;
}

export interface StreamIngestStatus {
  state: StreamIngestState;
  /** Provider-measured, and therefore trustworthy in a way a form field is not. */
  durationSec: number | null;
}

interface StreamCredentials {
  accountId: string;
  apiToken: string;
}

@Injectable()
export class CloudflareStreamUploadService {
  private readonly logger = new Logger(CloudflareStreamUploadService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Upload needs only the account pair; the customer code is a playback fact. */
  isConfigured(): boolean {
    return this.credentials() !== null;
  }

  /**
   * Can this account actually take an upload right now?
   *
   * Credentials are necessary and NOT sufficient: an account with no allocated
   * capacity authenticates cleanly and then refuses every allocation. Since the
   * provider will not answer that question without being asked to allocate
   * something, the answer is an explicit operational statement rather than an
   * inference — see `CLOUDFLARE_STREAM_UPLOADS_ENABLED`.
   *
   * Callers use this to decide whether to OFFER the capability. Nothing here
   * reaches the network, so it is safe on a page load.
   */
  uploadsAvailable(): boolean {
    if (!this.isConfigured()) return false;
    return (
      this.config.get("CLOUDFLARE_STREAM_UPLOADS_ENABLED", { infer: true }) ===
      "true"
    );
  }

  /**
   * Allocate a video and get a one-time URL to put bytes at.
   *
   * `maxDurationSeconds` is sent so the provider refuses an over-long file
   * itself, at its edge, instead of accepting the whole upload and leaving us to
   * discover the problem afterwards.
   */
  async createDirectUpload(input: {
    /** Editorial name, so a human can find the asset in the Stream dashboard. */
    name: string;
  }): Promise<StreamDirectUpload> {
    const creds = this.requireCredentials();

    const body = await this.call(
      `${CLOUDFLARE_API_BASE}/accounts/${creds.accountId}/stream/direct_upload`,
      creds,
      {
        method: "POST",
        body: JSON.stringify({
          maxDurationSeconds: VIDEO_MAX_DURATION_SEC,
          expiry: new Date(
            Date.now() + UPLOAD_URL_TTL_SEC * 1000,
          ).toISOString(),
          requireSignedURLs: true,
          meta: { name: input.name },
        }),
      },
    );

    const parsed = readDirectUpload(body);
    if (parsed === null) throw this.unavailable("unexpected_body");

    return {
      videoUid: parsed.uid,
      uploadUrl: parsed.uploadURL,
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SEC * 1000).toISOString(),
    };
  }

  /**
   * Has the upload landed and finished encoding?
   *
   * A video that was allocated and never filled stays `AWAITING_UPLOAD`
   * indefinitely, which is a real state an editor can be in and needs to see —
   * not an error.
   */
  async getStatus(videoUid: string): Promise<StreamIngestStatus> {
    const creds = this.requireCredentials();
    const body = await this.call(
      `${CLOUDFLARE_API_BASE}/accounts/${creds.accountId}/stream/${videoUid}`,
      creds,
      { method: "GET" },
    );
    const parsed = readStatus(body);
    if (parsed === null) throw this.unavailable("unexpected_body");
    return parsed;
  }

  /**
   * Discard an allocated video.
   *
   * Only ever called for an asset this server allocated and then failed to
   * record — the same rule the R2 upload path follows. A video anyone might be
   * watching is never deleted from here.
   */
  async deleteVideo(videoUid: string): Promise<void> {
    const creds = this.credentials();
    if (!creds) return;
    try {
      await fetch(
        `${CLOUDFLARE_API_BASE}/accounts/${creds.accountId}/stream/${videoUid}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${creds.apiToken}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      // Best effort. An unreferenced Stream asset costs storage, not
      // correctness, and throwing here would mask the failure we are cleaning
      // up after.
      this.logger.error("orphaned Stream asset could not be removed");
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async call(
    url: string,
    creds: StreamCredentials,
    init: { method: string; body?: string },
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method,
        headers: {
          // Server-side only. This header never leaves the API process.
          Authorization: `Bearer ${creds.apiToken}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // The caught error is deliberately not inspected: its message can carry
      // the URL, and the URL carries the account id.
      throw this.unavailable("network");
    }

    if (!response.ok) {
      // Status only — never the body, which echoes the request back.
      throw this.unavailable(`status_${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw this.unavailable("unparseable_body");
    }
  }

  private requireCredentials(): StreamCredentials {
    const creds = this.credentials();
    if (!creds) {
      // Value-free: which of the two is missing is not a client's business, and
      // naming it in a log invites pasting the other one next to it.
      this.logger.warn(
        "Stream ingest requested while the provider is not configured",
      );
      throw new ServiceUnavailableException("MEDIA_PROVIDER_UNAVAILABLE");
    }
    return creds;
  }

  private credentials(): StreamCredentials | null {
    const accountId = this.config.get("CLOUDFLARE_STREAM_ACCOUNT_ID", {
      infer: true,
    });
    const apiToken = this.config.get("CLOUDFLARE_STREAM_API_TOKEN", {
      infer: true,
    });
    if (!accountId || !apiToken) return null;
    return { accountId, apiToken };
  }

  private unavailable(reason: string): ServiceUnavailableException {
    this.logger.warn(`Stream ingest request failed · reason=${reason}`);
    return new ServiceUnavailableException("MEDIA_PROVIDER_UNAVAILABLE");
  }
}

/**
 * Exact read of `{ success: true, result: { uid, uploadURL } }`.
 *
 * The UID must satisfy the catalog's own grammar here rather than at write time:
 * a UID we cannot store is a video we have allocated and immediately lost track
 * of, and finding that out one layer later means the cleanup no longer knows
 * what to delete. Exported for the spec.
 */
export function readDirectUpload(
  body: unknown,
): { uid: string; uploadURL: string } | null {
  const result = successResult(body);
  if (result === null) return null;
  const uid = result.uid;
  const uploadURL = result.uploadURL;
  if (typeof uid !== "string" || !/^[a-z0-9]{16,64}$/.test(uid)) return null;
  if (typeof uploadURL !== "string" || !/^https:\/\//.test(uploadURL)) {
    return null;
  }
  return { uid, uploadURL };
}

/**
 * Exact read of a video's status envelope, normalized to our vocabulary.
 *
 * Unknown provider states resolve to `PROCESSING`, never to `READY`: the only
 * consequence of guessing "still working" is that the editor polls again, while
 * guessing "ready" would let an unplayable video be published. Exported for the
 * spec.
 */
export function readStatus(body: unknown): StreamIngestStatus | null {
  const result = successResult(body);
  if (result === null) return null;

  const status = result.status;
  const state =
    typeof status === "object" && status !== null
      ? (status as Record<string, unknown>).state
      : undefined;

  const durationRaw = result.duration;
  // Stream reports `-1` for a duration it does not know yet.
  const durationSec =
    typeof durationRaw === "number" &&
    Number.isFinite(durationRaw) &&
    durationRaw > 0
      ? Math.round(durationRaw)
      : null;

  if (typeof state !== "string") return null;

  switch (state) {
    case "ready":
      return { state: "READY", durationSec };
    case "error":
      return { state: "ERROR", durationSec: null };
    case "pendingupload":
      return { state: "AWAITING_UPLOAD", durationSec: null };
    default:
      return { state: "PROCESSING", durationSec };
  }
}

function successResult(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null) return null;
  const envelope = body as Record<string, unknown>;
  if (envelope.success !== true) return null;
  const result = envelope.result;
  if (typeof result !== "object" || result === null) return null;
  return result as Record<string, unknown>;
}
