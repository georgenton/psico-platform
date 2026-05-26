# BooksModule

Sprint S5 catalog surface. Replaces the legacy `ContentModule` URL space
(`/content/*` → `/books|chapters|progress`).

## Endpoints

| Method | Path                        | Auth     | Purpose                               |
| ------ | --------------------------- | -------- | ------------------------------------- |
| GET    | `/books`                    | optional | Paginated catalog with filters        |
| GET    | `/books/recos`              | required | Personalized recommendations (max 4)  |
| GET    | `/books/categories`         | none     | Public category catalog               |
| GET    | `/books/authors`            | none     | Public author catalog                 |
| GET    | `/books/:idOrSlug`          | optional | Full detail with chapters + reviews   |
| GET    | `/books/:idOrSlug/reviews`  | none     | Paginated reviews for a book          |
| POST   | `/books/:idOrSlug/reviews`  | required | Create review (gated: book completed) |
| POST   | `/books/:idOrSlug/favorite` | required | Toggle favorite                       |
| POST   | `/books/:idOrSlug/bookmark` | required | Toggle bookmark                       |
| POST   | `/books/:idOrSlug/start`    | required | Mark book as started                  |
| POST   | `/books`                    | ADMIN    | Create book (CMS)                     |
| PATCH  | `/books/:slug`              | ADMIN    | Update book (CMS)                     |

Endpoints marked **optional** auth read the JWT when present to hydrate
user-scoped fields (`isFavorite`, `isBookmarked`, `userProgress`). When the
JWT is absent these fields default to `false`/`null`.

## Design source

- `docs/design/handoff/03-biblioteca.md` (catalog list)
- `docs/design/handoff/04-detalle.md` (detail + reviews)

## Concepts

### Tier vs Plan

Backend stores `Book.plan` (FREE/PRO/ANNUAL/B2B) because billing uses it.
The design speaks in `tierRequired` (`free`|`pro`). We translate at the API
boundary — never let `Plan` leak to the public response. The mapping:

```
FREE        → "free"
PRO/ANNUAL  → "pro"
B2B         → "pro"
```

### id-or-slug path resolution

The design's canonical `:id` URL uses the cuid PK. The existing seed and
mobile/web links use slugs. The service accepts both; routes named
`:idOrSlug` resolve in this order: by `id` first, fall back to `slug`.

### Catalog gating policy

A book is **locked** for a user when the user's tier rank is below the
book's tier requirement. The frontend renders a padlock and links to
`/plan`. Detail responses include full metadata even when locked so the
user can see what they're missing — gating happens at the chapter level
(`ChaptersService.findOne`), not at the book metadata level.

### Review eligibility

A user can only post a review when **every published chapter is
completed** (`UserProgress.completedAt != null` for each). Enforced in
service, not in DB.

### Toggle endpoints

`favorite` and `bookmark` are POST-only and return `{ active: boolean }`.
This keeps the URL space narrow (no DELETE) and the response self-describing.

## Data model

```
BookAuthor   ─┐      BookCategory
              ├─ Book ─┬─ Chapter ─┬─ Audio
              │        │           └─ Exercise
              │        ├─ BookFavorite (per user)
              │        ├─ BookBookmark (per user)
              │        └─ BookReview   (per user)
              │
              └─ (many)
```

See `apps/api/prisma/schema.prisma` for the full schema.

## Editing the catalog

The seed (`apps/api/prisma/seed.ts`) is idempotent — re-running `prisma
db seed` updates books/authors/categories without duplicates. To add a new
book, append to the seed and re-run.

For categories/authors managed by the content team, prefer direct SQL
updates against the staging DB rather than committing seed edits for
every catalog tweak.
