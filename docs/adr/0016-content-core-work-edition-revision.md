# ADR 0016 — Content Core: Work / Edition / Revision + stable block identity

**Status:** Proposed
**Date:** 2026-07-16
**Design:** [docs/architecture/content-core.md](../architecture/content-core.md)

## Context

Content lives as `ChapterBlock` rows keyed by `@@unique([chapterId, order])` with
a cuid `id` that is **regenerated on every re-ingest**. `Highlight.blockId` and
`Annotation.blockId` are `onDelete: Cascade` FKs to that id, so re-ingesting a
chapter destroys every user highlight/annotation on it. The session log has worked
around this for months by refusing to re-ingest ("evita borrar highlights por
cascade").

Three further gaps: no revision history (one mutable live copy of the content);
concepts are string literals in code (`Resonance.conceptKey` sourced from the
`CHAPTER_CONCEPTS` catalog, no referential integrity); and learning signals sit
close to the Emotional Map, which the V2 program (Fases A–H) spent eight PRs
decoupling — Content Core must not re-entangle them.

## Decision

Separate **editorial identity** from **stored content** from **user anchors** from
**learning events**, via ten entities:

1. **Work** → 2. **Edition** → 3. **Revision** — editorial identity + immutable
   revision history. Publishing mints a new Revision; the old one is retained.
2. **ContentUnit** (stable, ≈ chapter) → 5. **ContentUnitVersion** (its content
   within one Revision) → 6. **Block** carrying a **stable `blockKey` UUID**
   distinct from its disposable per-version row `id`.
3. **Concept** + 8. **ConceptLink** — a first-class concept graph replacing the
   string catalog.
4. **Anchor/tombstone contract** — `Highlight`/`Annotation`/`Resonance` reference
   `(editionKey, unitKey, blockKey, offsets, quote)` with **no FK to a content
   row**; removed blocks that hold anchors become **tombstones**, never
   cascade-deletes.
5. **LearningEvent** — append-only log of learning interactions, **structurally
   firewalled** from the Emotional Map.

**Invariant:** `LearningEvent`, reading, progress, and `GuideSession` never modify
any Emotional Map axis. Enforced by a build-failing ratchet + a behavioral
byte-identical test, in the style of `emotional-map.v2-contract.spec.ts`.

Delivery is additive-first and reversible: new tables backfilled from the old ones
(no `DELETE`), a dual-read window for anchors (blockKey → legacy blockId fallback)
before any column is dropped, non-destructive revision-minting ingest replacing the
destructive script. Sequenced as small PRs CC-1..CC-9 (design §G).

`blockKey` for the first revision is derived deterministically
(`uuidv5(editionKey, unitKey:order:contentHash)`) so the backfill is reproducible;
subsequent revisions carry keys forward by diff so an edited paragraph keeps its
key.

## Consequences

- **The data-loss bug is closed at the schema level.** No content write can
  cascade-delete a user mark, because marks no longer FK a content row.
- **Content becomes editable and versionable** without disturbing user marks;
  editorial corrections and rollbacks become possible.
- **+ tables, + one dual-read window.** Short-term duplication (old + new content
  models coexist through CC-4..CC-8) is the price of a reversible migration.
- **Concepts gain integrity + a graph** — "everything that teaches X" becomes a
  query; `Resonance` anchors to a real `Concept`.
- **The learning/map firewall is structural**, not a convention — Guide V1 (next
  design) inherits it and may only _read_ the map, never write it.

## Alternatives considered

- **Keep `ChapterBlock`, make ingest a diff (no revisions).** Fixes the cascade
  bug but loses history and rollback, and still couples identity to a mutable row.
  Rejected: revisions are cheap and unlock editorial workflows + the Author B2B
  path.
- **Content-addressed blocks (id = contentHash).** Stable until text is edited —
  then the id changes and anchors break on exactly the case we care about (typo
  fixes). Rejected in favor of a carried-forward `blockKey`.
- **Collapse `Work` into `Edition` for v1.** Fewer tables now, but a painful
  reshape when the second edition/language ships. Deferred as open question §12.1;
  proposed to model both now.
