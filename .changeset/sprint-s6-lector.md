---
"@psico/api-client": minor
"@psico/types": minor
---

Sprint S6 — LectorModule (reader backend complete).

**New endpoints (9):**

- `GET /api/lector/:bookId/:chapterOrder` — envolvente returning
  book + chapter + blocks + lessons + highlights + annotations +
  session + reader preferences in a single request.
- `GET /api/lector/:bookId/:chapterOrder/audio` — Pro-gated signed URL +
  transcript.
- `PATCH /api/lector/session` — heartbeat (cada 5 s) que actualiza
  `progressPct`, `timeSpentSec`, `lastBlockId`. Capa delta a 60 s y
  jamás decrementa progress.
- `POST /api/lector/:bookId/:chapterOrder/complete` — marca el capítulo
  completo en transacción atómica (ReadingSession + UserProgress).
- `POST /api/highlights` · `DELETE /api/highlights/:id` — subrayados con
  YELLOW/BLUE/PINK + nota opcional.
- `POST /api/annotations` · `PATCH /api/annotations/:id` ·
  `DELETE /api/annotations/:id` — notas plaintext ancladas a block.

**Schema (4 modelos):** `ChapterBlock`, `Highlight`, `Annotation`,
`ReadingSession`. Migración additive — no toca tablas existentes.

**Client:** `lectorApi`, `highlightsApi`, `annotationsApi` exported.

**Seed:** 30 ChapterBlocks reales (5 capítulos × 6 blocks) para los
2 libros ancla — el reader del front va a tener data desde día uno.

Decisions documented in `docs/informes/sprint-s6-lector.md`.
