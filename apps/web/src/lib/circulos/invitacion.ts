/**
 * The two values the organiser's browser mints, and nothing else.
 *
 * ── Why the browser mints the invitation token ─────────────────────────────
 *
 * The server stores only a HASH of it. A one-shot secret cannot be handed back
 * twice, so if the server minted it, a retry whose response was lost would have
 * nothing recoverable to return — the organiser would be told "created" with no
 * link, and the only fix would be storing the secret in recoverable form, which
 * is the thing this design refuses. The browser holding the plaintext for the
 * life of one screen is what makes a replay return the same invitation without
 * anything recoverable ever existing server-side.
 *
 * The token is NOT identity and authorises nothing on its own. Creating a Dúo
 * is authorised by the session cookie; this only names the invitation that
 * creation mints.
 */

/** 256 bits, exactly as `CreateDuoDto` requires. */
const TOKEN_BYTES = 32;

/**
 * Base64url without padding, from real CSPRNG bytes.
 *
 * `crypto.getRandomValues` and nothing else. `Math.random` is a PRNG seeded
 * per page, is not uniform, and its output is predictable from prior draws —
 * for a value whose only protection is being unguessable, it is not a weaker
 * choice, it is no protection.
 *
 * 32 bytes encode to 44 base64 characters with one `=`; stripping the padding
 * leaves exactly 43, which is the length the API's grammar accepts. The length
 * is a CONSEQUENCE of the entropy, never the goal: 43 characters of anything
 * would satisfy a length check and none of them would be a secret.
 */
export function mintInvitationToken(
  source: Crypto = globalThis.crypto,
): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  source.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * A v4 UUID naming ONE intention.
 *
 * Minted once per logical attempt and reused across every retry of that
 * attempt. A fresh key per retry would turn "the same creation, tried again"
 * into "a second creation" — and the API, which reads a repeated key as a
 * replay and a new key on a settled seat as a conflict, would answer
 * `CIRCLE_IDEMPOTENCY_CONFLICT` to somebody whose connection simply dropped.
 */
export function mintIdempotencyKey(source: Crypto = globalThis.crypto): string {
  return source.randomUUID();
}

/**
 * The shareable link.
 *
 * The token goes in the FRAGMENT and only there. A fragment is never sent to
 * the server, never lands in an access log, never reaches a Referer header, and
 * is not part of what a proxy or an analytics beacon records. The same string
 * in a path or a query would be written down by every hop between the two
 * people.
 */
export function invitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/i#${token}`;
}
