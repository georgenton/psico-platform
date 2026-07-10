# Book content — manuscript ingestion

Real chapters for the anchor books live here as Markdown/plain-prose files,
ingested into `Chapter` + `ChapterBlock` rows by
[`scripts/ingest-chapter-md.mjs`](../scripts/ingest-chapter-md.mjs) so they're
readable, highlightable and annotatable in the Lector.

## Layout

```
content/<book-slug>/
  titles.json          # { "1": "Título del capítulo 1", ... } (order → title)
  parts.json           # { "1": { "number": 1, "title": "Parte I …" }, ... }
  capitulo-01.md
  capitulo-02.md
  ...
```

`titles.json` supplies the chapter title when a file opens with a narrative
paragraph instead of a short title line (e.g. chapter 3). `parts.json` maps
each chapter's order to its book part (`number` + `title`) — the reader and
the book's table of contents render "Parte I · <title>" headings from it.
The filename's number sets the chapter order.

Both modes work with ingested chapters: **Modo Libro** shows the blocks;
**Modo Guía** shows the same blocks with an "Audio en producción" placeholder
until the chapter's narration is embedded + uploaded (no audio row → the
placeholder is the honest state).

## How the parser reads a manuscript

- **First short line** (≤120 chars, no final period) → chapter title. A long
  narrative opening is kept as the first paragraph and the title comes from
  `titles.json`.
- **Short lines without terminal punctuation** → section `HEADING`.
- **`# / ## / ###`, `> quote`** → HEADING / QUOTE (real Markdown, optional).
- Everything else → `PARAGRAPH`. **Prose stays prose** — we never convert whole
  sections to exercises.
- A heading that looks like an activity ("Actividades", "…exploración
  guiada…", "ejercicio") gets **one interactive `✍️` mock card** right after it,
  marking where the real guided activity will land. The author's text below
  stays readable.
- **Mocks** so every block kind is visible before videos/activities are built:
  one `PAUSE` (~45% through, if none present) and one `🎬` video card
  (`EXERCISE`) before the references. Fenced `:::pausa / :::ejercicio / :::video`
  blocks are also supported for future curated Markdown.

## Running

```bash
cd apps/api
# preview parsing without touching the DB:
node scripts/ingest-chapter-md.mjs --dir content/emociones-en-construccion --dry-run

# ingest all chapters (Railway shell, DATABASE_URL set):
node scripts/ingest-chapter-md.mjs --dir content/emociones-en-construccion

# a single chapter:
node scripts/ingest-chapter-md.mjs --file content/emociones-en-construccion/capitulo-01.md --order 1
```

Options: `--book <slug>` (default `emociones-en-construccion`), `--title "…"`
(override for a single `--file`), `--dry-run`.

## ⚠️ Idempotency & marks

Re-running **replaces** a chapter's blocks (upsert chapter by `(bookId, order)`,
then delete + recreate blocks). Because highlights/annotations anchor to block
ids, re-ingesting a chapter **cascade-deletes any marks on it**. That's fine
while iterating on the manuscript; don't re-ingest chapters real users have
already marked up. Run this **after** `prisma db seed` (the seed also creates
placeholder blocks for the anchor books; ingestion overwrites them with the
real manuscript).
