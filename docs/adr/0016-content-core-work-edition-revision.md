# ADR 0016 — Content Core: Work / Edition / Revision-manifest + stable block identity

**Status:** Accepted (direction)
**Date:** 2026-07-16
**Design:** [docs/architecture/content-core.md](../architecture/content-core.md)

## Context

Content lives as `ChapterBlock` rows keyed by `@@unique([chapterId, order])` with
a cuid `id` that is **regenerated on every re-ingest**. `Highlight.blockId` and
`Annotation.blockId` are `onDelete: Cascade` FKs to that id, so re-ingesting a
chapter destroys every user highlight/annotation on it. The session log has worked
around this for months by refusing to re-ingest.

Three further gaps: no revision history (one mutable live copy); concepts are
string literals in code (`Resonance.conceptKey` from `CHAPTER_CONCEPTS`, no
referential integrity); and learning signals sit close to the Emotional Map, which
the V2 program (Fases A–H) spent eight PRs decoupling — Content Core must not
re-entangle them.

## Decision

Separate **editorial identity** from **stored content** from **stable block
identity** from **learning events**:

1. **Work → Edition → Revision.** A `Revision` is an immutable **manifest**:
   `RevisionUnit` rows select exactly one `ContentUnitVersion` per `ContentUnit`
   and carry that unit's `order`/`partNumber`/`partTitle`. A new revision **copies
   the previous manifest and swaps only the units that changed** — so a revision is
   always a complete snapshot, never "just one unit." Cross-edition association is
   blocked by CHECK constraints; `Edition.publishedRevision` must belong to the
   same edition.
2. **ContentUnit → ContentUnitVersion (immutable) → BlockVersion.** Versions are
   immutable and not tied to a revision (the manifest references them).
3. **Block identity is its own entity.** `ContentBlock { blockKey @unique, unitId,
legacyBlockId? }` is stable; `BlockVersion` (one per `ContentBlock` per
   `ContentUnitVersion`) holds the per-revision `order/kind/content/hash/meta`.
   `Highlight`/`Annotation`/`ConceptLink` FK the **stable `ContentBlock`**
   (`onDelete: Restrict`) — never a version, never a soft `blockKey` string.
   `blockKey` is backfilled deterministically as
   `uuidv5(CONTENT_CORE_NAMESPACE_UUID, legacyChapterBlockId)` — anchored to the
   legacy row id (a stable handle to _this_ block), **not** to `editionKey`,
   `order`, or `contentHash`, so identity does not change when a block is reordered
   or edited.
4. **Concept + ConceptLink** replace the string catalog. `ConceptLink` is **XOR**
   (unit vs. block) enforced by a CHECK + two partial-unique indexes — no nullable
   triple `@@unique`.
5. **LearningEvent** is append-only with a **server-owned discriminated payload**:
   the client submits a typed intent (kind + refs), the server validates and
   constructs the stored payload (numbers/enums only). No free-text `meta`.

**Invariant:** `LearningEvent`, reading, progress, `GuideSession`, `Highlight`,
`Annotation`, and `Resonance` never modify a map axis. Enforced by a build-failing
ratchet **plus a behavioral test that compares a semantic `mapProjection`** (axis
values + provenance) before/after a full learning sweep — not raw-JSON
byte-equality (an incidental timestamp must not fail it; a moved axis must).
`Resonance` stays **qualitative**: `conceptId` + provenance snapshot, feeding
Conexión/Propósito only as counts of distinct confirmed/important concepts.

Delivery is additive-first and reversible: new tables backfilled from the old ones
(no `DELETE`), a dual-read window for anchors (`contentBlockId` → legacy `blockId`)
before any column is dropped, a non-destructive revision-minting ingest replacing
the destructive script. Sequenced as CC-1..CC-9 (design §G); CC-1 is pure libs +
tests, no schema.

### Closed decisions

- `Work` + `Edition` modeled separately from v1.
- **No fuzzy 0.8.** Auto-match only on exact `contentHash`/`blockKey`; fuzzy ≥ 0.95
  accepted **only** with a unique candidate, else tombstone.
- No tombstone GC in v1.
- `Resonance` never moves a map axis.

## Consequences

- **The data-loss bug is unrepresentable.** Marks FK a stable `ContentBlock` with
  `onDelete: Restrict`; no content write can cascade-delete them. A removed block
  becomes a tombstone (the persistent `ContentBlock` with no live `BlockVersion`),
  never a deletion.
- **Content is editable, versionable, roll-back-able** without disturbing marks; a
  revision is a full manifest snapshot.
- **+ tables, + one dual-read window.** Old + new content models coexist through
  CC-4..CC-8 — the price of a reversible migration.
- **Concepts gain integrity + a graph.** `Resonance` anchors to a real `Concept`.
- **The learning/map firewall is structural** — server-owned payloads + a semantic
  projection test. Guide V1 inherits it (read-only on the map).

## Alternatives considered

- **`ContentUnitVersion.revisionId` (version tied to a revision).** Simpler, but a
  revision could then contain "just one unit," and shared/unchanged units get
  duplicated per revision. Rejected for the `RevisionUnit` manifest, which copies
  unchanged units by reference.
- **`blockKey` as a soft string on each per-revision block.** No FK target for
  anchors, no integrity, invites the exact drift we're removing. Rejected for
  `ContentBlock` as a first-class entity.
- **`blockKey = uuidv5(editionKey, order:contentHash)`.** Changes when a block is
  reordered or its text edited — i.e. on exactly the cases anchors must survive.
  Rejected for `uuidv5(namespace, legacyBlockId)`.
- **Fuzzy 0.8 auto-match.** Too eager; silently re-attaches marks to the wrong
  block. Rejected for exact-only + unique-≥0.95-or-tombstone.
- **Client-authored LearningEvent `meta`.** A hole through the firewall. Rejected
  for server-owned discriminated payloads.
- **Byte-identical raw-JSON firewall test.** Brittle (incidental fields) and
  imprecise. Rejected for a semantic `mapProjection` comparison.
