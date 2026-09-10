import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Invitation and guest-session secrets (PR2 · spec §E).
 *
 * The rule this module exists to make structural: **a raw secret exists during
 * generation and during exchange, and nowhere else**. It is returned once to
 * the caller that minted it, and what reaches PostgreSQL is a SHA-256 hash.
 * Nothing here logs, nothing here puts a secret in an error, and the `Error`
 * types this file can produce carry a code and no value.
 *
 * Why SHA-256 and not bcrypt/argon2: these are 128-bit-plus RANDOM secrets, not
 * passwords. There is no dictionary to grind and no user-chosen entropy to
 * stretch, so a slow KDF would buy nothing and would cost a lookup index — and
 * the index is what lets the failure path do the same work as the success path.
 * The short human code is the one secret with less entropy, and it is protected
 * by the rate limit on the exchange route plus single use, which is the control
 * that actually applies to an online guess.
 */

/**
 * The code alphabet: 30 characters with every visually confusable pair removed
 * — no `0`/`O`, no `1`/`I`/`L`, no `U` (it reads as `V` in several common
 * faces, and its absence also keeps accidental words out of a code someone has
 * to read aloud over a phone).
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The floor the spec sets. Codes are generated longer; this is the boundary. */
export const CODE_MIN_LENGTH = 10;

/**
 * 12, not the minimum 10. 30^12 ≈ 2^59, and the two extra characters cost a
 * person nothing to read while removing a whole class of "how long until a
 * distributed guesser gets lucky" argument.
 */
export const CODE_LENGTH = 12;

/** 32 bytes → 43 base64url characters. */
const TOKEN_BYTES = 32;

/** The exact shape the SQL CHECK enforces on every stored hash column. */
export const HASH_RE = /^[0-9a-f]{64}$/;

/** A generated pair: the raw secret to hand back ONCE, and what gets stored. */
export interface MintedSecret {
  /** Never persisted, never logged. The caller returns it and forgets it. */
  readonly raw: string;
  readonly hash: string;
}

/** SHA-256, lowercase hex — the only form any column ever holds. */
export function hashSecret(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Constant-time hash comparison.
 *
 * Lookups happen on a unique index over the hash, so this is not what finds the
 * row — it is the check that the row found is the row meant, run in a way that
 * does not leak how many leading characters matched. Length is compared first
 * because `timingSafeEqual` throws on a mismatch; both operands here are
 * fixed-width hex, so that branch carries no secret.
 */
export function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** A cryptographically random link token. */
export function mintInvitationToken(): MintedSecret {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  return { raw, hash: hashSecret(raw) };
}

/**
 * A short human-readable code, drawn WITHOUT modulo bias.
 *
 * `randomBytes(n) % 30` would make the first 16 letters of the alphabet
 * slightly likelier than the last 14. Rejection sampling costs a few extra
 * bytes and keeps the distribution flat, which is the difference between "59
 * bits" being a description and being a claim.
 */
export function mintInvitationCode(length: number = CODE_LENGTH): MintedSecret {
  if (length < CODE_MIN_LENGTH) {
    throw new Error("CIRCLE_CODE_LENGTH_BELOW_MINIMUM");
  }
  const n = CODE_ALPHABET.length;
  // Largest multiple of `n` that fits in a byte; anything at or above is
  // rejected rather than folded.
  const limit = Math.floor(256 / n) * n;
  const out: string[] = [];
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= limit) continue;
      out.push(CODE_ALPHABET[byte % n]);
      if (out.length === length) break;
    }
  }
  const raw = out.join("");
  return { raw, hash: hashSecret(raw) };
}

/**
 * Normalize a code a human typed: uppercase, and drop spaces, dashes and dots.
 *
 * Deliberately NOT a confusable-character mapping. The alphabet already
 * excludes `0/O` and `1/I/L`, so there is no pair to reconcile — and inventing
 * one (`0` → `O`) would map two distinct inputs onto one code, which is a
 * collision introduced by the thing meant to prevent typos. Uppercasing is
 * injective over this alphabet, so it cannot merge two codes.
 *
 * A code containing anything outside the alphabet is returned as-is and fails
 * the same uniform way every other unusable value does — never with a distinct
 * "malformed" answer, which would confirm the shape of a real one.
 */
export function normalizeCode(input: string): string {
  return input.replace(/[\s.-]+/g, "").toUpperCase();
}

/**
 * Cheap upper bound on what the exchange route will even hash. Not a validity
 * check — a value that fails it takes exactly the same path, and produces
 * exactly the same response, as a well-formed value that does not exist.
 */
export const MAX_PRESENTED_SECRET_LENGTH = 512;
