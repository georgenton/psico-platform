// Backward-compat barrel — kept thin so existing imports keep building. Prefer
// `booksApi` from "./books" in new code.
//
// Sprint S5 renamed `/content/*` to `/books|chapters|progress`. The shape of
// what this barrel returns is also richer now (BookListResponse vs Book[]).
import type { BookDetailResponse, BookListResponse } from "@psico/types";
import { apiClient } from "./client";

/** @deprecated use `booksApi` instead. Kept for transition only. */
export const contentApi = {
  /** @deprecated use `booksApi.list()` */
  getBooks: () => apiClient.get<BookListResponse>("/books"),
  /** @deprecated use `booksApi.getDetail(idOrSlug)` */
  getBook: (idOrSlug: string) =>
    apiClient.get<BookDetailResponse>(`/books/${idOrSlug}`),
};
