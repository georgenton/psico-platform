import { createHash } from "node:crypto";

/**
 * GR-2 §10 — server-derived idempotency for a media completion.
 *
 * The client never chooses the key. It is derived deterministically from the
 * completion's identity:
 *
 *     chapter-media-completed + mediaKey + mediaVersion
 *
 * Combined with the existing `(userId, idempotencyKey)` uniqueness, the same
 * person finishing the same media at the same version produces exactly ONE row
 * — after a reload, after a double `ended` event, from a second device, after a
 * network retry. No client-side storage is involved, so nothing to lose or
 * tamper with.
 *
 * A NEW `mediaVersion` derives a DIFFERENT key on purpose: a re-recorded master
 * is a new thing to have finished, not a duplicate of the old one.
 *
 * Implementation: RFC 4122 name-based UUIDv5 (SHA-1) under a namespace reserved
 * for this one purpose. Name-based means reproducible across processes and
 * deploys; a dedicated namespace means these keys can never collide with
 * another feature's derived keys, whatever names it hashes.
 */

/**
 * The GR-2 media-completion namespace. Fixed forever: changing it would make
 * every past completion look new and duplicate the whole activity log.
 */
export const CHAPTER_MEDIA_IDEMPOTENCY_NAMESPACE =
  "7f3d9c26-9f1a-4a5b-9c2e-8d4b1e6a0c31";

const NAME_PREFIX = "chapter-media-completed";

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

/**
 * The derived key for one (media, version) pair. Pure: same inputs, same
 * output, no clock, no randomness, no IO.
 */
export function chapterMediaCompletionIdempotencyKey(
  mediaKey: string,
  mediaVersion: number,
): string {
  const name = `${NAME_PREFIX}:${mediaKey}:${mediaVersion}`;
  const hash = createHash("sha1")
    .update(uuidToBytes(CHAPTER_MEDIA_IDEMPOTENCY_NAMESPACE))
    .update(Buffer.from(name, "utf8"))
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  // RFC 4122: version 5 in the high nibble of byte 6, variant 10x in byte 8.
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
