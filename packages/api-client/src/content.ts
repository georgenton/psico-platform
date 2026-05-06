import type { Book, BookWithChapters } from "@psico/types";
import { apiClient } from "./client";

export const contentApi = {
  getBooks: () => apiClient.get<Book[]>("/content/books"),
  getBook: (slug: string) =>
    apiClient.get<BookWithChapters>(`/content/books/${slug}`),
};
