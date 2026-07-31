/**
 * GR-2 — the completion command's body, parsed.
 *
 * The command carries NO fields. Everything it needs — the media kind, its
 * version, the editorial unit, the idempotency key — is derived server-side
 * from `mediaKey` and the authenticated actor. So the only two acceptable
 * bodies are "no body at all" and `{}`.
 *
 * A field the client sends is a claim about state the server owns. Accepting
 * and ignoring it would be worse than rejecting it: the client would keep
 * sending it, someone would eventually wire it up, and a `watchedSeconds` or a
 * `mediaVersion` from the player would quietly become authoritative. The
 * whitelist is empty, so anything at all — `userId`, `mediaKind`,
 * `mediaVersion`, `unitKey`, `watchedSeconds` — is rejected structurally
 * rather than by a keyword list.
 *
 * Pure: no IO, no clock, no logging, no Nest, no Prisma. It never echoes a
 * received value back, so the rejection cannot leak what was sent.
 */

export const MEDIA_INVALID_PAYLOAD = "MEDIA_INVALID_PAYLOAD" as const;

export type ChapterMediaBodyParseResult =
  | { ok: true }
  | { ok: false; code: typeof MEDIA_INVALID_PAYLOAD };

const REJECT: ChapterMediaBodyParseResult = {
  ok: false,
  code: MEDIA_INVALID_PAYLOAD,
};

/**
 * Accepts an absent body (`undefined`) and the empty object. Everything else —
 * a populated object, an array, a string, a number, `null` — is rejected.
 */
export function parseChapterMediaCompleteBody(
  body: unknown,
): ChapterMediaBodyParseResult {
  // Express gives `{}` for an absent body when the JSON parser is mounted;
  // `undefined` when nothing was sent at all. Both mean "no fields".
  if (body === undefined) return { ok: true };

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return REJECT;
  }

  // `Reflect.ownKeys` sees symbol keys too — an own symbol property is still a
  // property, and `Object.keys` would silently miss it.
  return Reflect.ownKeys(body).length === 0 ? { ok: true } : REJECT;
}
