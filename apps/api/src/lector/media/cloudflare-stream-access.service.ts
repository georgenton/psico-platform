import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config";

/**
 * GR-2 — private access to a Cloudflare Stream video. Small on purpose: this is
 * not a generic internal SDK, and there is no Cloudflare dependency — `fetch`
 * is enough for one POST.
 *
 * The flow, once per playback:
 *
 *   1. POST server-side to the official `/token` endpoint with the API token;
 *   2. ask for a short expiry (target 15 minutes);
 *   3. build the managed player's iframe URL around the signed token;
 *   4. hand the client the iframe URL and when it expires.
 *
 * Nothing here is logged: not the API token, not the account id, not the video
 * UID, not the signed token, not the raw provider response, not the built URL.
 * Every failure — missing configuration, non-2xx, malformed body, network
 * error, timeout — surfaces as the same value-free
 * `MEDIA_PROVIDER_UNAVAILABLE`, with no `cause` and no upstream message: an
 * error string is a log line waiting to happen.
 */

/** Target lifetime of a signed playback token. */
export const STREAM_TOKEN_TTL_SEC = 15 * 60;

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const TOKEN_REQUEST_TIMEOUT_MS = 5_000;

export interface StreamAccess {
  embedUrl: string;
  expiresAt: string;
  defaultTextTrack: string | null;
}

interface StreamCredentials {
  accountId: string;
  apiToken: string;
  customerCode: string;
}

@Injectable()
export class CloudflareStreamAccessService {
  private readonly logger = new Logger(CloudflareStreamAccessService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * True when the trio is present. Callers use it to decide whether a
   * Stream-backed item can be offered at all — the env schema already refuses
   * the half-set states, so "some credentials" never reaches here.
   */
  isConfigured(): boolean {
    return this.credentials() !== null;
  }

  /**
   * Mint a short-lived playback URL for one video.
   *
   * `captionLanguage` comes from the catalog, never from the client, and only
   * becomes `defaultTextTrack` — it never selects the video.
   */
  async createAccess(input: {
    videoUid: string;
    captionLanguage: string | null;
  }): Promise<StreamAccess> {
    const creds = this.credentials();
    if (!creds) {
      // Value-free: which of the three is missing is not a client's business,
      // and naming it in a log invites pasting the other two next to it.
      this.logger.warn(
        "Stream access requested while the provider is not configured",
      );
      throw new ServiceUnavailableException("MEDIA_PROVIDER_UNAVAILABLE");
    }

    const expiresAtMs = Date.now() + STREAM_TOKEN_TTL_SEC * 1000;
    const token = await this.requestSignedToken(creds, input.videoUid);

    return {
      embedUrl: this.buildEmbedUrl(creds, token, input.captionLanguage),
      expiresAt: new Date(expiresAtMs).toISOString(),
      defaultTextTrack: input.captionLanguage,
    };
  }

  private credentials(): StreamCredentials | null {
    const accountId = this.config.get("CLOUDFLARE_STREAM_ACCOUNT_ID", {
      infer: true,
    });
    const apiToken = this.config.get("CLOUDFLARE_STREAM_API_TOKEN", {
      infer: true,
    });
    const customerCode = this.config.get("CLOUDFLARE_STREAM_CUSTOMER_CODE", {
      infer: true,
    });
    if (!accountId || !apiToken || !customerCode) return null;
    const code = normalizeCustomerCode(customerCode);
    if (code === null) {
      // Configured, but not a value that can become a hostname. Treating it as
      // "not configured" is the honest outcome: the alternative is building
      // `customer-<garbage>.cloudflarestream.com`, handing it to a browser, and
      // turning a deployment mistake into a broken player nobody can diagnose.
      this.logger.warn(
        "Stream customer code is configured but is not a valid subdomain label",
      );
      return null;
    }
    return { accountId, apiToken, customerCode: code };
  }

  private async requestSignedToken(
    creds: StreamCredentials,
    videoUid: string,
  ): Promise<string> {
    const url = `${CLOUDFLARE_API_BASE}/accounts/${creds.accountId}/stream/${videoUid}/token`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          // Server-side only. This header never leaves the API process.
          Authorization: `Bearer ${creds.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          exp: Math.floor((Date.now() + STREAM_TOKEN_TTL_SEC * 1000) / 1000),
        }),
        signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
      });
    } catch {
      // Network error / timeout. The caught error is deliberately not inspected:
      // its message can carry the URL, and the URL carries the account id.
      throw this.unavailable("network");
    }

    if (!response.ok) {
      // Status only — never the body, which echoes the request.
      throw this.unavailable(`status_${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw this.unavailable("unparseable_body");
    }

    const token = readToken(body);
    if (token === null) throw this.unavailable("unexpected_body");
    return token;
  }

  /**
   * The managed player, via iframe + Player API. With a signed token the token
   * itself replaces the video UID in the path, so the UID never reaches the
   * browser.
   *
   * `autoplay` is deliberately ABSENT rather than set to `false`: a parameter
   * that is not there cannot be read as truthy by a future player version. The
   * ratchet asserts the built URL never mentions it.
   */
  private buildEmbedUrl(
    creds: StreamCredentials,
    signedToken: string,
    captionLanguage: string | null,
  ): string {
    const params = new URLSearchParams({ controls: "true" });
    if (captionLanguage) params.set("defaultTextTrack", captionLanguage);
    return `https://customer-${creds.customerCode}.cloudflarestream.com/${signedToken}/iframe?${params.toString()}`;
  }

  /**
   * One error shape for every provider failure. `reason` is a fixed token for
   * our own logs — it is never attached to the exception, so it cannot reach a
   * client, and there is no `cause` to serialize.
   */
  private unavailable(reason: string): ServiceUnavailableException {
    this.logger.warn(`Stream token request failed · reason=${reason}`);
    return new ServiceUnavailableException("MEDIA_PROVIDER_UNAVAILABLE");
  }
}

/**
 * Reduce whatever was pasted into the env var to the bare subdomain code.
 *
 * Cloudflare shows this value in several shapes depending on where it was
 * copied from — the bare code, `customer-<code>`, the player hostname, or a
 * whole embed URL — and all four are the same fact. Accepting them costs a
 * regex; rejecting them costs an operator an afternoon.
 *
 * What is NOT accepted is anything that cannot be a DNS label: uppercase, an
 * underscore, a dot. Those are not a formatting variation of the code, they are
 * a different value in the wrong variable. Returns `null` rather than repairing
 * it, because a repaired guess would point playback at somebody else's account.
 * Exported for the spec.
 */
export function normalizeCustomerCode(raw: string): string | null {
  let value = raw.trim();
  // A full embed URL, or just the hostname.
  value = value.replace(/^https?:\/\//i, "").split("/")[0] ?? "";
  value = value.replace(/\.cloudflarestream\.com$/i, "");
  value = value.replace(/^customer-/i, "");
  // Bounded by what a DNS label can hold: the host is `customer-<code>`, and a
  // label caps at 63 characters. A floor beyond "not empty" would be invented —
  // the character class is what actually distinguishes a code from a value that
  // landed in the wrong variable.
  return /^[a-z0-9]{1,54}$/.test(value) ? value : null;
}

/**
 * Exact read of the provider's success envelope: `{ success: true, result: {
 * token: string } }`. Anything else — `success: false`, a missing token, a
 * non-string token — is `null`, which the caller turns into the same value-free
 * error. Exported for the spec.
 */
export function readToken(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const envelope = body as Record<string, unknown>;
  if (envelope.success !== true) return null;
  const result = envelope.result;
  if (typeof result !== "object" || result === null) return null;
  const token = (result as Record<string, unknown>).token;
  return typeof token === "string" && token.length > 0 ? token : null;
}
