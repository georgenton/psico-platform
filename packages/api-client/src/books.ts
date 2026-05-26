import type {
  BookAuthorsResponse,
  BookCategoriesResponse,
  BookDetailResponse,
  BookListResponse,
  BookListSort,
  BookListView,
  BookRecosResponse,
  BookReviewsResponse,
  BookToggleResponse,
  CreateBookReviewRequest,
  CreateBookReviewResponse,
  StartBookResponse,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * booksApi — Sprint S5 catalog surface.
 *
 * Mirrors the endpoints in docs/design/handoff/03-biblioteca.md and 04-detalle.md.
 * The apiClient picks up the access token from the configured TokenStore.
 * Catalog reads work without auth — the response just has null/false on the
 * user-scoped fields.
 */
export const booksApi = {
  list: (
    query: {
      view?: BookListView;
      categoryId?: string;
      authorId?: string;
      sort?: BookListSort;
      q?: string;
      page?: number;
      perPage?: number;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const path = qs.toString() ? `/books?${qs.toString()}` : "/books";
    return apiClient.get<BookListResponse>(path);
  },
  getRecos: () => apiClient.get<BookRecosResponse>("/books/recos"),
  getCategories: () =>
    apiClient.get<BookCategoriesResponse>("/books/categories"),
  getAuthors: () => apiClient.get<BookAuthorsResponse>("/books/authors"),
  getDetail: (idOrSlug: string) =>
    apiClient.get<BookDetailResponse>(`/books/${idOrSlug}`),
  listReviews: (
    idOrSlug: string,
    query: { page?: number; perPage?: number } = {},
  ) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const path = qs.toString()
      ? `/books/${idOrSlug}/reviews?${qs.toString()}`
      : `/books/${idOrSlug}/reviews`;
    return apiClient.get<BookReviewsResponse>(path);
  },
  createReview: (idOrSlug: string, body: CreateBookReviewRequest) =>
    apiClient.post<CreateBookReviewResponse>(
      `/books/${idOrSlug}/reviews`,
      body,
    ),
  toggleFavorite: (idOrSlug: string) =>
    apiClient.post<BookToggleResponse>(`/books/${idOrSlug}/favorite`),
  toggleBookmark: (idOrSlug: string) =>
    apiClient.post<BookToggleResponse>(`/books/${idOrSlug}/bookmark`),
  start: (idOrSlug: string) =>
    apiClient.post<StartBookResponse>(`/books/${idOrSlug}/start`),
};
