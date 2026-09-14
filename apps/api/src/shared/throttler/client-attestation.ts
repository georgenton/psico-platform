import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Who the API is allowed to rate-limit a guest as, when the call arrives
 * through the Web BFF.
 *
 * ── The problem this exists for ────────────────────────────────────────────
 *
 * `trust proxy = 1` makes `req.ip` the address Railway's single hop saw, which
 * is correct for a browser talking to the API directly. The guest surface does
 * not: it goes browser → Web (Vercel) → API, so every guest on the planet
 * arrives from the BFF's egress address and shares ONE throttler bucket. The
 * first person to hit the limit closes inspection and acceptance for everybody.
 *
 * ── Why an attestation and not a header ────────────────────────────────────
 *
 * The obvious fix — have the BFF forward `X-Forwarded-For` and trust it — is
 * not a fix. Nothing stops a caller reaching the API directly with any
 * `X-Forwarded-For` it likes, which turns the rate limit into a way to spend
 * somebody ELSE's budget. `trust proxy = 1` exists precisely to stop that, and
 * widening it would undo the protection.
 *
 * So the BFF SIGNS its claim. The header carries the client identity, an
 * expiry and an HMAC over both, keyed by a secret only the two servers hold.
 * The browser never sees it and cannot mint one; a direct caller cannot forge
 * one; and a captured one stops working within seconds.
 *
 * ── What it can honestly claim ─────────────────────────────────────────────
 *
 * A NETWORK CLIENT, not a person. What the BFF observes is the address its own
 * platform reports, and several people behind one NAT share it while one person
 * on a phone changes it by walking down the street. Calling this "per person"
 * would be a promise the input cannot support, so the vocabulary throughout is
 * `client`.
 *
 * The identity is carried as a hash, never a raw address: what the limiter
 * needs is a stable bucket key, and an IP in a header is an IP in a log.
 */

/** `<clientIdHash>.<expiresAtMs>.<hmac>` — all base64url/decimal, no padding. */
const PART_COUNT = 3;

/** A minute is long enough for a slow request and short enough to be useless later. */
export const ATTESTATION_TTL_MS = 60_000;

export const CLIENT_ATTESTATION_HEADER = "x-client-attestation";

export interface AttestationResult {
  /** The bucket the limiter should use, or `null` when there is no valid claim. */
  readonly clientId: string | null;
  /**
   * Why a claim was refused. `null` when there was no claim at all, which is
   * the ordinary case for a direct API call and is not an error.
   */
  readonly rejected:
    | null
    | "malformed"
    | "expired"
    | "bad-signature"
    | "not-configured";
}

const NONE: AttestationResult = Object.freeze({
  clientId: null,
  rejected: null,
});

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Constant-time compare that never throws on a length mismatch. */
function sameSignature(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Build the header value. Used by tests and by anything server-side that needs
 * to speak to the API as the BFF does; the Web app mints its own with the same
 * grammar.
 */
export function mintClientAttestation(
  clientIdHash: string,
  secret: string,
  now: number = Date.now(),
): string {
  const expiresAt = now + ATTESTATION_TTL_MS;
  const payload = `${clientIdHash}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verify a presented attestation.
 *
 * Never throws, and never reports WHY to the caller's caller: a refusal is a
 * refusal, and the reason is for the server's own counters.
 */
export function verifyClientAttestation(
  presented: string | undefined | null,
  secret: string | undefined,
  now: number = Date.now(),
): AttestationResult {
  if (!presented) return NONE;
  if (!secret) {
    // A claim arrived but this deployment cannot check it. Refusing the CLAIM
    // (not the request) is the safe reading: the caller falls back to its
    // address, which is what it would have used anyway.
    return { clientId: null, rejected: "not-configured" };
  }

  const parts = presented.split(".");
  if (parts.length !== PART_COUNT) {
    return { clientId: null, rejected: "malformed" };
  }
  const [clientIdHash, expiresAtRaw, signature] = parts as [
    string,
    string,
    string,
  ];
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(clientIdHash)) {
    return { clientId: null, rejected: "malformed" };
  }
  if (!/^\d{10,16}$/.test(expiresAtRaw)) {
    return { clientId: null, rejected: "malformed" };
  }

  // Signature BEFORE expiry, so an attacker cannot use the difference between
  // "expired" and "forged" to learn whether they guessed the secret.
  const expected = sign(`${clientIdHash}.${expiresAtRaw}`, secret);
  if (!sameSignature(signature, expected)) {
    return { clientId: null, rejected: "bad-signature" };
  }

  if (Number(expiresAtRaw) <= now) {
    return { clientId: null, rejected: "expired" };
  }

  return { clientId: clientIdHash, rejected: null };
}
