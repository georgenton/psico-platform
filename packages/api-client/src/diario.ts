import type {
  CreateDiaryEntryRequest,
  CreateDiaryEntryResponse,
  DeleteDiaryEntryResponse,
  DiaryDetailResponse,
  DiaryListResponse,
  DiaryPromptOfTheDay,
  ShareDiaryEntryRequest,
  ShareDiaryEntryResponse,
  UpdateDiaryEntryRequest,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * diarioApi — Sprint S6 client surface.
 *
 * IMPORTANT: this client passes ciphertext through unchanged. The encryption
 * happens upstream (in the app's crypto module). Never inline-encrypt here
 * or you tie the wire format to the client wrapper.
 *
 * The server requires `Authorization: Bearer <token>` on every endpoint
 * (apiClient picks the token up from the configured TokenStore).
 */
export const diarioApi = {
  list: (
    query: {
      from?: string;
      to?: string;
      mood?: string;
      tag?: string;
      page?: number;
      perPage?: number;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const path = qs.toString()
      ? `/diario/entries?${qs.toString()}`
      : "/diario/entries";
    return apiClient.get<DiaryListResponse>(path);
  },
  getDetail: (id: string) =>
    apiClient.get<DiaryDetailResponse>(`/diario/entries/${id}`),
  create: (body: CreateDiaryEntryRequest) =>
    apiClient.post<CreateDiaryEntryResponse>("/diario/entries", body),
  update: (id: string, body: UpdateDiaryEntryRequest) =>
    apiClient.patch<DiaryDetailResponse>(`/diario/entries/${id}`, body),
  remove: (id: string) =>
    apiClient.delete<DeleteDiaryEntryResponse>(`/diario/entries/${id}`),
  getPromptOfTheDay: () =>
    apiClient.get<DiaryPromptOfTheDay | null>("/diario/prompt-of-the-day"),
  share: (id: string, body: ShareDiaryEntryRequest) =>
    apiClient.post<ShareDiaryEntryResponse>(
      `/diario/entries/${id}/share`,
      body,
    ),
};
