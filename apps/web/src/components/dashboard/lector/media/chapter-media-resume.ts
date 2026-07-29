/**
 * GR-2 — local playback resume for chapter media.
 *
 * Three numbers and two keys, in `localStorage`, and nothing else:
 *
 *     { mediaKey, mediaVersion, positionSeconds }
 *
 * Never stored: the signed URL (a temporary bearer), the provider token, the
 * user id, or anything about how the person felt. There is no server sync and
 * no cross-device continuity — `MEDIA_PLAYBACK_RESUME=LOCAL_ONLY` in the spec.
 *
 * The record is NOT partitioned by actor. The reader page does not resolve an
 * opaque actor scope today, and GR-2 does not invent a second identity system
 * to get one — the spec says to reuse a partition only if one is already
 * available without a broad refactor. What a shared browser can therefore leak
 * is one number: how far into a published book chapter someone got. A stale or
 * foreign record is also self-limiting: it is discarded unless BOTH the media
 * key and the version match.
 */

const STORAGE_KEY = "psico.lector.media-resume.v1";

/** Below this, resuming is more annoying than starting over. */
const MIN_RESUME_SECONDS = 15;

export interface MediaResumeRecord {
  mediaKey: string;
  mediaVersion: number;
  positionSeconds: number;
}

/** Reads the stored position for exactly this media at exactly this version. */
export function readMediaResume(
  mediaKey: string,
  mediaVersion: number,
): number | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage disabled (private mode, blocked cookies) — resume is optional.
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  if (record.mediaKey !== mediaKey) return null;
  if (record.mediaVersion !== mediaVersion) return null;

  const position = record.positionSeconds;
  if (typeof position !== "number" || !Number.isFinite(position)) return null;
  if (position < MIN_RESUME_SECONDS) return null;
  return position;
}

/** Overwrites the single slot. One position at a time is enough for V1. */
export function writeMediaResume(record: MediaResumeRecord): void {
  if (!Number.isFinite(record.positionSeconds)) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mediaKey: record.mediaKey,
        mediaVersion: record.mediaVersion,
        positionSeconds: Math.max(0, Math.floor(record.positionSeconds)),
      }),
    );
  } catch {
    // Never break playback over a storage failure.
  }
}

/** Called when a media finishes: there is nothing left to resume. */
export function clearMediaResume(mediaKey: string): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.mediaKey !== mediaKey) return;
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same reason.
  }
}

export const MEDIA_RESUME_STORAGE_KEY = STORAGE_KEY;
