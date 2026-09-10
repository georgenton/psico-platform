import {
  createDecipheriv,
  createCipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Application-layer encryption for what two people deliberately share (PR3).
 *
 * ── This is NOT end-to-end encryption ──────────────────────────────────────
 *
 * The API holds the key. It has to: the same snapshot must be readable from the
 * other person's device, and later by Eco Facilitador with consent. Anything
 * that called this E2E would be describing a different system, and a ratchet in
 * `circles-docs.spec.ts` fails the build if any document does.
 *
 * What IS true, and is the reason this file exists at all: the private
 * preparation never reaches the server. What is encrypted here is the snapshot
 * a person previewed and confirmed — never a draft, never a keystroke.
 *
 * ── Why AES-256-GCM and not the Diario's XChaCha20 ─────────────────────────
 *
 * The Diario's stack is client-side (`@psico/crypto`, WASM-free, browser and
 * React Native). This runs on the server, where Node's own AEAD is available
 * without a dependency, is FIPS-blessed where that matters, and — the reason
 * that actually decided it — takes ADDITIONAL AUTHENTICATED DATA natively.
 *
 * The AAD is the point. It binds the ciphertext to WHERE it belongs: circle,
 * activity, participant, template pin, sharing mode and the exact field keys.
 * Move a row between activities, swap two participants' envelopes, or edit
 * `fieldKeys` after the fact, and decryption fails — not because a check
 * noticed, but because the tag no longer verifies. An attacker with database
 * write access still cannot make one person's snapshot decrypt as another's.
 *
 * ── payloadHash is keyed, deliberately ─────────────────────────────────────
 *
 * A bare SHA-256 of an intimate answer is a lookup key: hash the guesses, match
 * the column. The corpus here is small and predictable — "sí", "no", a date, a
 * name — so an unkeyed digest of it is closer to plaintext than to a hash.
 * `payloadHash` is therefore an HMAC under a separate derived key, which makes
 * it useless to anyone without the key and still exactly as good for the one
 * thing it is for: detecting a replayed or altered confirmation.
 */

/** The one key the deployment supplies. Everything else is derived from it. */
export const CIRCLES_KEY_ENV = "CIRCLES_SHARED_DATA_KEY_V1";

/** Current key version. Written into every envelope so rotation stays possible. */
export const CIRCLES_KEY_VERSION = 1;

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Domain separation, so the AEAD key and the MAC key can never be the same. */
const AEAD_INFO = "feelverse.circles.v1.aead";
const MAC_INFO = "feelverse.circles.v1.payload-mac";

export type CirclesCryptoErrorCode =
  | "CIRCLES_KEY_MISSING"
  | "CIRCLES_KEY_INVALID"
  | "CIRCLES_ENVELOPE_UNREADABLE";

/** Value-free by construction: the message is the code and nothing else. */
export class CirclesCryptoError extends Error {
  constructor(readonly code: CirclesCryptoErrorCode) {
    super(code);
    this.name = "CirclesCryptoError";
  }
}

/**
 * Everything the AAD binds. Not a subset chosen for convenience: each field is
 * something that, if it could be changed after the fact, would change what the
 * snapshot MEANS.
 */
export interface CircleEnvelopeContext {
  readonly circleId: string;
  readonly activityId: string;
  readonly participantId: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly sharingMode: string;
  /** Sorted by the caller-independent helper below, never as supplied. */
  readonly fieldKeys: readonly string[];
}

export interface CircleEnvelope {
  readonly ciphertext: string;
  readonly nonce: string;
  readonly keyVersion: number;
  readonly payloadHash: string;
}

/**
 * The AAD, canonically. Field order and separators are fixed here so two
 * callers cannot produce different bytes for the same meaning — which would
 * make a legitimate envelope undecryptable, the worst kind of bug because it
 * only appears once real data exists.
 */
export function buildAad(context: CircleEnvelopeContext): Buffer {
  const keys = [...context.fieldKeys].sort();
  return Buffer.from(
    [
      "feelverse.circles.v1",
      context.circleId,
      context.activityId,
      context.participantId,
      context.templateKey,
      String(context.templateVersion),
      context.sharingMode,
      keys.join(","),
    ].join(""),
    "utf8",
  );
}

/** A 32-byte key from the environment value, or a value-free refusal. */
export function parseCirclesKey(raw: string | undefined): Buffer {
  if (raw === undefined || raw.trim() === "") {
    throw new CirclesCryptoError("CIRCLES_KEY_MISSING");
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw.trim(), "base64");
  } catch {
    throw new CirclesCryptoError("CIRCLES_KEY_INVALID");
  }
  if (decoded.length !== KEY_BYTES) {
    throw new CirclesCryptoError("CIRCLES_KEY_INVALID");
  }
  return decoded;
}

/** HKDF, so the AEAD key and the MAC key are independent of each other. */
function subKey(root: Buffer, info: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", root, Buffer.alloc(0), Buffer.from(info, "utf8"), 32),
  );
}

/**
 * The sealing/opening pair, built once per process from the configured key.
 *
 * Constructing this is what fails when the key is absent — which is why the
 * module that provides it must not construct it under `off`. See
 * `circles-crypto.provider.ts`.
 */
export class CirclesCipher {
  private readonly aeadKey: Buffer;
  private readonly macKey: Buffer;

  constructor(root: Buffer) {
    if (root.length !== KEY_BYTES) {
      throw new CirclesCryptoError("CIRCLES_KEY_INVALID");
    }
    this.aeadKey = subKey(root, AEAD_INFO);
    this.macKey = subKey(root, MAC_INFO);
  }

  /**
   * Encrypt a confirmed snapshot.
   *
   * `plaintext` is the canonical JSON of the confirmed selection. It is never
   * logged, never echoed and never stored — the return value is the only thing
   * that leaves.
   */
  seal(plaintext: string, context: CircleEnvelopeContext): CircleEnvelope {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.aeadKey, nonce);
    cipher.setAAD(buildAad(context));
    const body = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Object.freeze({
      ciphertext: Buffer.concat([body, tag]).toString("base64"),
      nonce: nonce.toString("base64"),
      keyVersion: CIRCLES_KEY_VERSION,
      payloadHash: this.macOf(plaintext, context),
    });
  }

  /**
   * Decrypt, or refuse.
   *
   * Every failure — wrong key, wrong version, tampered ciphertext, an AAD that
   * does not match the row it was read from — leaves through the same
   * `CIRCLES_ENVELOPE_UNREADABLE`. There is nothing to learn from which.
   */
  open(envelope: CircleEnvelope, context: CircleEnvelopeContext): string {
    if (envelope.keyVersion !== CIRCLES_KEY_VERSION) {
      throw new CirclesCryptoError("CIRCLES_ENVELOPE_UNREADABLE");
    }
    try {
      const raw = Buffer.from(envelope.ciphertext, "base64");
      if (raw.length <= TAG_BYTES) {
        throw new CirclesCryptoError("CIRCLES_ENVELOPE_UNREADABLE");
      }
      const body = raw.subarray(0, raw.length - TAG_BYTES);
      const tag = raw.subarray(raw.length - TAG_BYTES);
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.aeadKey,
        Buffer.from(envelope.nonce, "base64"),
      );
      decipher.setAAD(buildAad(context));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString(
        "utf8",
      );
    } catch {
      throw new CirclesCryptoError("CIRCLES_ENVELOPE_UNREADABLE");
    }
  }

  /** Keyed digest of the confirmed payload, bound to the same context. */
  macOf(plaintext: string, context: CircleEnvelopeContext): string {
    return createHmac("sha256", this.macKey)
      .update(buildAad(context))
      .update("")
      .update(plaintext, "utf8")
      .digest("hex");
  }

  /** Constant-time comparison of two payload hashes. */
  macMatches(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  }
}

/** DI token for the cipher, which is `null` exactly when Círculos is `off`. */
export const CIRCLES_CIPHER = Symbol("CIRCLES_CIPHER");

/** `null` means "no key configured, and none is needed" — see below. */
export type CirclesCipherRef = CirclesCipher | null;

/**
 * Resolve the cipher for a rollout posture, at boot, once.
 *
 * Two behaviours, and the asymmetry is deliberate:
 *
 *   · `off`   — never throws. A deployment with Círculos closed must boot
 *               whether or not somebody has configured a key it will not use,
 *               and returning `null` is honest about that. Every route is
 *               already refused by the rollout guard before anything would
 *               reach for the cipher.
 *   · `pilot`
 *     / `on`  — a missing or malformed key fails the BOOT. Not the first
 *               request, and certainly not silently: a surface that is
 *               supposed to encrypt what two people share must not come up at
 *               all if it cannot. There is no ephemeral fallback key here and
 *               no write to the environment; generating one would produce
 *               ciphertext nobody can read after a restart, which is data loss
 *               wearing the costume of resilience.
 */
export function resolveCirclesCipher(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  mode: "off" | "pilot" | "on",
): CirclesCipherRef {
  const raw = env[CIRCLES_KEY_ENV];
  if (mode === "off") {
    try {
      return new CirclesCipher(parseCirclesKey(raw));
    } catch {
      return null;
    }
  }
  return new CirclesCipher(parseCirclesKey(raw));
}
