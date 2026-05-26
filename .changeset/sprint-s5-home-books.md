---
"@psico/types": minor
"@psico/api-client": minor
---

Sprint S5 — BooksModule expandido + HomeModule.

`@psico/types`:

- Books catalog: `BookCategory`, `BookAuthorSummary`, `BookAuthorDetail`,
  `BookListItem`, `BookListResponse`, `Pagination`, `BookRecosResponse`,
  `BookCategoriesResponse`, `BookAuthorsResponse`, `BookToggleResponse`.
- Book detail: `BookDetail`, `BookDetailResponse`, `ChapterListItem`,
  `BookRating`, `BookRatingBreakdown`, `BookReviewSummary`,
  `BookReviewsResponse`, `CreateBookReviewRequest`,
  `CreateBookReviewResponse`, `StartBookResponse`,
  `BookUserProgressSummary`.
- Home dashboard: `HomeResponse`, `HomeUser`, `HomeGreeting`,
  `HomeContinueBook`, `HomeEcoMoment`, `HomeReco`, `HomeStats`,
  `HomeReflectionPrompt`, `HomeShortcut`, `UpdateUserMoodRequest`,
  `UpdateUserMoodResponse`, `DismissReflectionPromptResponse`.
- Enums: `CoverToken`, `BookListSort`, `BookListView`, `RecoKind`,
  `ShortcutId`.

`@psico/api-client`:

- New `booksApi` with 10 methods covering list, recos, categories,
  authors, detail, reviews list/create, favorite/bookmark toggles, and
  start-book.
- Legacy `contentApi` kept as deprecated thin shim — now returns
  `BookListResponse`/`BookDetailResponse` shape against the new `/books`
  routes.
- `generated.ts` regenerated from the new OpenAPI surface (30.8 KB → 53.0 KB).
