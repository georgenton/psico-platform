import type {
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
