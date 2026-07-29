/**
 * Chapter media V1 — shared public contracts (GR-2).
 *
 * Source of truth: docs/product/guided-reading-v1.md §4 (media strategy), §7
 * (video), §8 (podcast) and §9 (data + privacy).
 *
 * A chapter offers the same content in several representations: the text, an
 * audiobook, a podcast and a full video explainer. This file describes ONLY
 * what a client is allowed to know about them.
 *
 * What is deliberately absent, and must stay absent:
 *
 *   - the storage location (R2 object key);
 *   - the video provider identity (Stream video UID, account id, customer code);
 *   - the API token or any signed token;
 *   - the access policy that gated the request;
 *   - the provider kind (`R2` vs `CLOUDFLARE_STREAM` vs the legacy chapter
 *     audio row) — the client branches on the media KIND, not on our hosting;
 *   - `userId`, `editionId`, `unitId` — the actor comes from the JWT and the
 *     editorial context is server-derived from `mediaKey`;
 *   - `correctOptionKey` — nothing in this file touches assessment.
 *
 * The signed URL is a temporary bearer. It appears in the ACCESS response and
 * nowhere else: never in the manifest, never in a log, never persisted, never
 * written into a document.
 */

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export type ChapterMediaKind = "AUDIOBOOK" | "PODCAST" | "VIDEO";

/**
 * `AVAILABLE` — published, with a real asset behind it; asking for access is
 * expected to succeed for an entitled person.
 *
 * `COMING_SOON` — the format is planned and announced, and there is no asset.
 * The client says so honestly ("En producción") instead of showing a player
 * that cannot play anything.
 */
export type ChapterMediaAvailability = "AVAILABLE" | "COMING_SOON";

// ─── Manifest (metadata only — signs nothing) ────────────────────────────────

export interface ChapterMediaChapterMark {
  startSec: number;
  label: string;
}

export interface ChapterMediaSummary {
  mediaKey: string;
  /** Positive integer. A new master is a NEW version, never an in-place edit. */
  mediaVersion: number;
  kind: ChapterMediaKind;
  title: string;
  description: string;
  /** Editorial duration, or null while the master does not exist yet. */
  durationSec: number | null;
  availability: ChapterMediaAvailability;
  hasTranscript: boolean;
  hasCaptions: boolean;
  chapters: ChapterMediaChapterMark[];
}

export interface ChapterMediaManifestResponse {
  bookSlug: string;
  chapterOrder: number;
  items: ChapterMediaSummary[];
}

// ─── Access (the only place a signed URL exists) ─────────────────────────────

/**
 * Discriminated on `kind`, because the two branches are genuinely different
 * shapes: audio is a URL the browser hands to `<audio>`, video is an embed URL
 * for the provider's managed player.
 *
 * `expiresAt` is an ISO-8601 instant. It tells the client when to ask again —
 * it is not a promise that the URL stays valid until then.
 */
export type ChapterMediaAccessResponse =
  | {
      kind: "AUDIOBOOK" | "PODCAST";
      mediaKey: string;
      mediaVersion: number;
      url: string;
      expiresAt: string;
      transcriptUrl: string | null;
      posterUrl: string | null;
    }
  | {
      kind: "VIDEO";
      mediaKey: string;
      mediaVersion: number;
      embedUrl: string;
      expiresAt: string;
      transcriptUrl: string | null;
      posterUrl: string | null;
      /** Text-track language to enable by default, when the master has one. */
      defaultTextTrack: string | null;
    };

// ─── Completion ──────────────────────────────────────────────────────────────

/**
 * The completion command carries NO body. Everything — the editorial context,
 * the media kind, the version, the idempotency key — is derived server-side
 * from `mediaKey` and the authenticated actor.
 *
 * The event means exactly one thing: the client reported that the player
 * reached its end. It does not mean the person understood, paid attention, or
 * felt anything (`EXPERIENCE_CAUSAL_INFERENCE=false`).
 */
export interface ChapterMediaCompleteRequestBody {
  // Intentionally empty: zero properties, `additionalProperties: false`.
}
