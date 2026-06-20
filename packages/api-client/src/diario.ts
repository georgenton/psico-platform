import type {
  CreateDiaryEntryRequest,
  CreateDiaryEntryResponse,
  DeleteDiaryEntryResponse,
  DiaryDetailResponse,
  DiaryListResponse,
  DiaryPromptOfTheDay,
  DiaryRawCiphersResponse,
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
      ? `/reflexiones/entries?${qs.toString()}`
      : "/reflexiones/entries";
    return apiClient.get<DiaryListResponse>(path);
  },
  getDetail: (id: string) =>
    apiClient.get<DiaryDetailResponse>(`/reflexiones/entries/${id}`),
  create: (body: CreateDiaryEntryRequest) =>
    apiClient.post<CreateDiaryEntryResponse>("/reflexiones/entries", body),
  update: (id: string, body: UpdateDiaryEntryRequest) =>
    apiClient.patch<DiaryDetailResponse>(`/reflexiones/entries/${id}`, body),
  remove: (id: string) =>
    apiClient.delete<DeleteDiaryEntryResponse>(`/reflexiones/entries/${id}`),
  getPromptOfTheDay: () =>
    apiClient.get<DiaryPromptOfTheDay | null>("/reflexiones/prompt-of-the-day"),
  /**
   * Pull every entry's raw cipher payload — used by the password-change-
   * with-rekey flow. The server never sees plaintext: the client decrypts
   * with the OLD diary key, re-encrypts with the NEW one, and POSTs the
   * rekeyed bundle back.
   */
  listRawCiphers: () =>
    apiClient.get<DiaryRawCiphersResponse>("/reflexiones/entries/raw-ciphers"),
  share: (id: string, body: ShareDiaryEntryRequest) =>
    apiClient.post<ShareDiaryEntryResponse>(
      `/reflexiones/entries/${id}/share`,
      body,
    ),
};
