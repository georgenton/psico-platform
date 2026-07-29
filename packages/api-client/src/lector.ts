import type {
  ChapterMediaAccessResponse,
  ChapterMediaManifestResponse,
  CreateAnnotationRequest,
  CreateAnnotationResponse,
  CreateHighlightRequest,
  CreateHighlightResponse,
  LectorAudioResponse,
  LectorChapterResponse,
  LectorCompleteResponse,
  LectorSessionHeartbeatRequest,
  LectorSessionHeartbeatResponse,
  UpdateAnnotationRequest,
  UpdateAnnotationResponse,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * lectorApi — Sprint S6 reader client.
 *
 * Mirrors the design in 05-lector.md:
 *   - `getChapter` aggregates everything needed to render a chapter
 *   - `heartbeat` is fire-and-forget (the reader keeps scrolling regardless)
 *   - `complete` is called once at the end of the chapter
 *   - `getAudio` is PRO-only — the client should gate the audio toggle by
 *     `chapter.audioAvailable` from the chapter payload before calling.
 */
export const lectorApi = {
  getChapter: (bookId: string, chapterOrder: number) =>
    apiClient.get<LectorChapterResponse>(
      `/lector/${encodeURIComponent(bookId)}/${chapterOrder}`,
    ),

  getAudio: (bookId: string, chapterOrder: number) =>
    apiClient.get<LectorAudioResponse>(
      `/lector/${encodeURIComponent(bookId)}/${chapterOrder}/audio`,
    ),

  heartbeat: (payload: LectorSessionHeartbeatRequest) =>
    apiClient.patch<LectorSessionHeartbeatResponse>("/lector/session", payload),

  complete: (bookId: string, chapterOrder: number) =>
    apiClient.post<LectorCompleteResponse>(
      `/lector/${encodeURIComponent(bookId)}/${chapterOrder}/complete`,
      {},
    ),

  // ─── GR-2 · chapter media ─────────────────────────────────────────────────
  //
  // Three methods, and `getAudio` above stays exactly as it was: the audiobook
  // reuses that endpoint, so nothing that already works had to move.
  //
  // None of the three sends editorial context or a userId. The actor is the
  // JWT; the kind, the version and the unit are derived server-side from
  // `mediaKey`.

  /** Formats + availability for a chapter. Never carries a signed URL. */
  getChapterMediaManifest: (bookIdOrSlug: string, chapterOrder: number) =>
    apiClient.get<ChapterMediaManifestResponse>(
      `/lector/${encodeURIComponent(bookIdOrSlug)}/${chapterOrder}/media`,
    ),

  /**
   * The short-lived playback URL. Call it after the person picks a format —
   * never during server rendering, and never cache the result.
   */
  getChapterMediaAccess: (mediaKey: string) =>
    apiClient.get<ChapterMediaAccessResponse>(
      `/lector/media/${encodeURIComponent(mediaKey)}/access`,
    ),

  /**
   * Report that the player reached its end. No body: everything is derived
   * server-side. Safe to retry — the server derives the idempotency key, so a
   * replay returns 200 and never writes a second row.
   */
  completeChapterMedia: (mediaKey: string) =>
    apiClient.post<{ created: boolean; replayed: boolean }>(
      `/lector/media/${encodeURIComponent(mediaKey)}/complete`,
      {},
    ),
};

/**
 * highlightsApi — Sprint S6.
 *
 * Highlights are scoped per (user, block). The server validates that
 * (startOffset, endOffset) fall inside the block content before creating.
 */
export const highlightsApi = {
  create: (payload: CreateHighlightRequest) =>
    apiClient.post<CreateHighlightResponse>("/highlights", payload),

  delete: (id: string) =>
    apiClient.delete<void>(`/highlights/${encodeURIComponent(id)}`),
};

/**
 * annotationsApi — Sprint S6.
 *
 * Annotations are plain text (NOT E2E-encrypted) because the design treats
 * them as margin notes against a public book, not personal diary content.
 */
export const annotationsApi = {
  create: (payload: CreateAnnotationRequest) =>
    apiClient.post<CreateAnnotationResponse>("/annotations", payload),

  update: (id: string, payload: UpdateAnnotationRequest) =>
    apiClient.patch<UpdateAnnotationResponse>(
      `/annotations/${encodeURIComponent(id)}`,
      payload,
    ),

  delete: (id: string) =>
    apiClient.delete<void>(`/annotations/${encodeURIComponent(id)}`),
};
