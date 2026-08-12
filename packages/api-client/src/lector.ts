import type {
  ChapterMediaAccessResponse,
  ChapterMediaCommandResponse,
  ChapterMediaManifestResponse,
  CreateAnnotationRequest,
  CreateAnnotationResponse,
  CreateHighlightRequest,
  CreateHighlightResponse,
  LectorAudioResponse,
  LectorChapterResponse,
  LectorLocatorResponse,
  ReaderChapterRef,
  LectorCompleteResponse,
  LectorSessionHeartbeatRequest,
  LectorSessionHeartbeatResponse,
  UpdateAnnotationRequest,
  UpdateAnnotationResponse,
} from "@psico/types";
import { READER_REF_SEGMENT } from "@psico/types";
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

  /**
   * A chapter by its STABLE identity (Phase B.A).
   *
   * `getChapter` above still works and still takes a position — old installed
   * clients navigate that way, and the audio/media endpoints are position-based
   * too. What changes is that NEW navigation never needs the round trip through
   * a number that a restructure can reassign.
   */
  getChapterByRef: (bookIdOrSlug: string, ref: ReaderChapterRef) =>
    apiClient.get<LectorChapterResponse>(
      `/lector/${encodeURIComponent(bookIdOrSlug)}/ref/${
        READER_REF_SEGMENT[ref.kind]
      }/${encodeURIComponent(ref.id)}`,
    ),

  /**
   * What identity currently sits at a position — and nothing else.
   *
   * For turning an old positional link into a canonical one. It writes no
   * session, no preferences and no progress, which is why the full reader must
   * not be used for this: passing through a chapter would look, in the user's
   * own history, exactly like having read it.
   */
  getLocator: (bookIdOrSlug: string, chapterOrder: number) =>
    apiClient.get<LectorLocatorResponse>(
      `/lector/${encodeURIComponent(bookIdOrSlug)}/locator/${chapterOrder}`,
    ),

  getAudio: (bookId: string, chapterOrder: number) =>
    apiClient.get<LectorAudioResponse>(
      `/lector/${encodeURIComponent(bookId)}/${chapterOrder}/audio`,
    ),

  heartbeat: (payload: LectorSessionHeartbeatRequest) =>
    apiClient.patch<LectorSessionHeartbeatResponse>("/lector/session", payload),

  /**
   * `contentUnitId` is the chapter the reader actually opened. The route still
   * carries the position, but a structural publish can move a chapter while a
   * page is open — completing by position would mark the wrong one.
   */
  complete: (bookId: string, chapterOrder: number, contentUnitId?: string) =>
    apiClient.post<LectorCompleteResponse>(
      `/lector/${encodeURIComponent(bookId)}/${chapterOrder}/complete`,
      contentUnitId ? { contentUnitId } : {},
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
    // `{}` is the whole contract: the body is closed and empty, so any property
    // added here would be rejected with `MEDIA_INVALID_PAYLOAD`.
    apiClient.post<ChapterMediaCommandResponse>(
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
