import type {
  AuthorBookChapter,
  AuthorBookDetail,
  AuthorDashboardResponse,
  AuthorPublicationState,
  CreateAuthorBookRequest,
  CreateAuthorBookResponse,
  UpdateAuthorBookRequest,
  UpdateAuthorChapterRequest,
  UpdateAuthorStructureRequest,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * authorApi — Sprint S71 + S71-front.
 *
 * Wraps /api/autor/* endpoints. All calls require an AUTHOR-role JWT;
 * the backend RolesGuard returns 403 if the token doesn't carry it.
 */
export const authorApi = {
  getDashboard: () =>
    apiClient.get<AuthorDashboardResponse>("/autor/dashboard"),

  createBook: (body: CreateAuthorBookRequest) =>
    apiClient.post<CreateAuthorBookResponse>("/autor/libros", body),

  getBook: (id: string) =>
    apiClient.get<AuthorBookDetail>(`/autor/libros/${id}`),

  updateBook: (id: string, body: UpdateAuthorBookRequest) =>
    apiClient.patch<{ ok: true; updatedAt: Date }>(
      `/autor/libros/${id}`,
      body,
    ),

  archiveBook: (id: string) =>
    apiClient.delete<{ ok: true; alreadyArchived?: true }>(
      `/autor/libros/${id}`,
    ),

  getChapter: (bookId: string, n: number) =>
    apiClient.get<AuthorBookChapter>(
      `/autor/libros/${bookId}/capitulos/${n}`,
    ),

  updateChapter: (
    bookId: string,
    n: number,
    body: UpdateAuthorChapterRequest,
  ) =>
    apiClient.patch<{ ok: true; version: number }>(
      `/autor/libros/${bookId}/capitulos/${n}`,
      body,
    ),

  updateStructure: (bookId: string, body: UpdateAuthorStructureRequest) =>
    apiClient.patch<{ ok: true; count: number }>(
      `/autor/libros/${bookId}/estructura`,
      body,
    ),

  getPublicationState: (id: string) =>
    apiClient.get<AuthorPublicationState>(`/autor/libros/${id}/publicacion`),

  submitForReview: (id: string) =>
    apiClient.post<{ ok: true; submittedAt: Date }>(
      `/autor/libros/${id}/publicar`,
      {},
    ),

  unpublish: (id: string) =>
    apiClient.post<{ ok: true }>(`/autor/libros/${id}/despublicar`, {}),
};
