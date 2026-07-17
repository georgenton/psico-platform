import { createHash } from "node:crypto";

/**
 * Content Core — stable block identity (CC-1, pure).
 *
 * The stable `blockKey` of a block is derived deterministically from the LEGACY
 * `ChapterBlock.id` (a stable handle to *this* block), never from its content,
 * order, or edition — so identity does NOT change when a block is reordered or
 * its text is edited, which is exactly when user anchors must survive.
 *
 * See docs/architecture/content-core.md §C and ADR 0016.
 */

/** Fixed once, never changed — the RFC 4122 v5 namespace for Content Core. */
export const CONTENT_CORE_NAMESPACE_UUID =
  "5f1d7e2a-9c84-4b3e-8a17-6d2c0b9f4e31";

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error(`INVALID_UUID: ${uuid}`);
  }
  return Buffer.from(hex, "hex");
}

/**
 * RFC 4122 v5 (SHA-1, name-based). Pure + deterministic — no clock, no RNG, so a
 * backfill is reproducible and the tests are stable.
 */
export function uuidv5(
  name: string,
  namespace: string = CONTENT_CORE_NAMESPACE_UUID,
): string {
  const ns = uuidToBytes(namespace);
  const digest = createHash("sha1")
    .update(ns)
    .update(Buffer.from(name, "utf8"))
    .digest();
  const bytes = digest.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Stable Content Core block identity from a legacy `ChapterBlock.id`. */
export function blockKeyFromLegacyId(legacyBlockId: string): string {
  if (!legacyBlockId) throw new Error("EMPTY_LEGACY_BLOCK_ID");
  return uuidv5(legacyBlockId);
}

/**
 * Stable ContentUnit identity from a legacy `Chapter.id`. Anchored to the row id,
 * NOT to `Chapter.order` — a chapter's order is placement (lives on RevisionUnit)
 * and may change; its identity must not.
 */
export function unitKeyFromLegacyChapterId(legacyChapterId: string): string {
  if (!legacyChapterId) throw new Error("EMPTY_LEGACY_CHAPTER_ID");
  return uuidv5(legacyChapterId);
}
