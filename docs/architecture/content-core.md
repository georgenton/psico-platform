# Content Core — technical design (design only, no implementation)

**Status:** Approved (direction) · **Date:** 2026-07-16 · **ADR:** [0016](../adr/0016-content-core-work-edition-revision.md)

This is a **design document**. Nothing here is implemented yet. The Prisma models,
TypeScript contracts and migration SQL below are _proposals_ to review before we
cut the first small PR (see §G). The current runtime model (`Book` · `Chapter` ·
`ChapterBlock` · `Highlight` · `Annotation` · `ReadingSession` · `Resonance`) stays
exactly as-is until a PR explicitly changes it.

**Closed decisions** (do not re-open): `Work` + `Edition` separate from v1 · fuzzy
0.8 rejected · auto-match only on exact hash/key · fuzzy ≥ 0.95 **only** with a
unique candidate, else tombstone · no tombstone GC in v1 · `Resonance` never moves
a map axis.

---

## 0. Why this exists (the problem, stated concretely)

Today a chapter's content is `ChapterBlock` rows keyed by `@@unique([chapterId, order])`
with a **cuid `id` that is regenerated on every re-ingest**. Our ingest script
(`ingest-chapter-md.mjs`) is destructive-by-replacement: it deletes a chapter's
blocks and recreates them. Because `Highlight.blockId` and `Annotation.blockId`
are `onDelete: Cascade` FKs to `ChapterBlock.id`, **every re-ingest silently
destroys every user highlight and annotation on that chapter.** The CLAUDE.md
session log flags this repeatedly ("⚠️ cascade sobre highlights/annotations",
"No re-ingesta — evita borrar highlights por cascade").

Three more structural gaps compound it:

1. **No revision history.** There is one live copy of the content. We cannot ship
   an editorial correction without mutating the thing users' marks point at, and
   we cannot A/B or roll back content.
2. **Concepts are string literals in code.** `Resonance.conceptKey` is a free
   string sourced from the `CHAPTER_CONCEPTS` catalog in `@psico/types`. There is
   no referential integrity, no place to attach a concept to more than one
   passage, no way to query "everything that teaches self-compassion."
3. **Learning signals and the Emotional Map are entangled at the source.** The
   V2 program (Fases A–H) spent eight PRs surgically _removing_ engagement from
   the map's axes. Content Core must not re-introduce that coupling: reading,
   progress, and guided sessions are **learning**, and learning must never move an
   emotional axis. That firewall must be structural, not a convention.

Content Core solves all four by separating **editorial identity** (what a work is,
across editions and revisions) from **stored content** (the block versions of a
revision) from **stable block identity** (a first-class entity marks attach to)
from **learning events** (an append-only log, server-owned, walled off from the
map).

---

## 1. The model (conceptual)

```
Work ─1:N─ Edition ─1:N─ Revision ─1:N─ RevisionUnit ─┐   (manifest: which version of each unit)
                    │                                  │
                    └─1:N─ ContentUnit ─1:N─ ContentUnitVersion ─1:N─ BlockVersion
                                     │                                      │
                                     └─1:N─ ContentBlock ────(1:N versions)─┘
                                              │ stable blockKey (its own entity)
Concept ─N:M(ConceptLink · XOR)─ {ContentUnit | ContentBlock}

UserAnchor {Highlight | Annotation | Resonance}  ── FK → ContentBlock (stable) / Concept
LearningEvent (append-only, server-owned payload)   ✕──── EmotionalMap axes  (firewall)
```

The one idea: **identity is stable and disposable content hangs off it.**

- **Identity, stable, never rewritten on ingest:** `Work`, `Edition`,
  `ContentUnit`, and — new — **`ContentBlock`** (its own row, carrying the stable
  `blockKey`). User anchors FK these.
- **Content, versioned + immutable per version:** `ContentUnitVersion` and its
  `BlockVersion` rows. A version, once written, is never mutated.
- **Assembly, per revision:** a `Revision` is a **manifest** (`RevisionUnit` rows)
  choosing exactly one `ContentUnitVersion` for each `ContentUnit`, plus that
  unit's placement (`order`/`partNumber`/`partTitle`). A new revision **copies the
  previous manifest and swaps only the units that changed**.

| Entity                 | Role                                                                                                         | Stability            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| **Work**               | Abstract intellectual work, edition-agnostic.                                                                | identity             |
| **Edition**            | A concrete published edition; the unit users read. `publishedRevisionId` (same-edition).                     | identity             |
| **Revision**           | An immutable snapshot **manifest** of an edition; publishing mints a new one.                                | identity (immutable) |
| **RevisionUnit**       | Manifest row: a Revision → the chosen `ContentUnitVersion` of one `ContentUnit`. Holds `order`/`part*`.      | per-revision         |
| **ContentUnit**        | Stable editorial unit (≈ chapter) within an Edition.                                                         | identity             |
| **ContentUnitVersion** | Immutable version of a unit (title/summary + its block versions). Not tied to a revision.                    | content (immutable)  |
| **ContentBlock**       | **Stable block identity** — its own entity: `blockKey @unique`, `unitId`, `legacyBlockId?`. Anchors FK here. | identity             |
| **BlockVersion**       | One row per `ContentBlock` per `ContentUnitVersion`: `order/kind/content/hash/meta`.                         | content              |
| **Concept**            | First-class psychoeducational concept (formalizes `CHAPTER_CONCEPTS`).                                       | identity             |
| **ConceptLink**        | N:M "teaches", **XOR** unit vs. block, CHECK + partial-unique indexes.                                       | editorial            |
| **LearningEvent**      | Append-only learning log, **server-owned discriminated payload**, firewalled from the map.                   | log                  |

`RevisionUnit` and `BlockVersion` are the mechanisms that make "a revision is a
complete snapshot" and "block identity is an entity" true; the ten concepts from
the original brief all survive, just placed correctly.

---

## 2. Deliverable A — proposed Prisma schema

Additive first (new tables alongside the old ones). FK CASCADE only _downward
inside the content tree_ (revision → its manifest, version → its block versions);
**never** from a user anchor, and **never** onto a `ContentBlock` that could hold
anchors. XOR / cross-edition / same-edition constraints that Prisma can't express
are `CHECK`s in the migration SQL. **This is a proposal, not applied.**

```prisma
// ─── Editorial identity + history ────────────────────────────────────────────

model Work {
  id         String   @id @default(cuid())
  workKey    String   @unique            // "emociones-en-construccion"
  title      String
  authorName String                      // denormalized until Author B2B owns it
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  editions   Edition[]
}

model Edition {
  id                  String   @id @default(cuid())
  workId              String
  editionKey          String   @unique   // "emociones-en-construccion-1e-es"
  slug                String   @unique    // routing; may equal editionKey
  label               String              // "Primera edición"
  language            String   @default("es-419")
  publishedRevisionId String?  @unique    // CHECK: publishedRevision.editionId = id
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  work              Work        @relation(fields: [workId], references: [id], onDelete: Cascade)
  revisions         Revision[]  @relation("EditionRevisions")
  units             ContentUnit[]
  publishedRevision Revision?   @relation("PublishedRevision", fields: [publishedRevisionId], references: [id])

  @@index([workId])
}

enum RevisionStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model Revision {
  id          String         @id @default(cuid())
  editionId   String
  number      Int                          // monotonic per edition
  status      RevisionStatus @default(DRAFT)
  note        String?                       // "corrige typo cap.3", ingest manifest ref
  createdAt   DateTime       @default(now())
  publishedAt DateTime?

  edition      Edition        @relation("EditionRevisions", fields: [editionId], references: [id], onDelete: Cascade)
  units        RevisionUnit[]               // the manifest
  publishedFor Edition?       @relation("PublishedRevision")

  @@unique([editionId, number])
  @@index([editionId, status])
}

// The manifest: a revision selects exactly one version of each unit, and places it.
model RevisionUnit {
  id            String @id @default(cuid())
  revisionId    String
  unitId        String
  unitVersionId String
  order         Int
  partNumber    Int?
  partTitle     String?

  revision    Revision           @relation(fields: [revisionId], references: [id], onDelete: Cascade)
  unit        ContentUnit        @relation(fields: [unitId], references: [id], onDelete: Restrict)
  unitVersion ContentUnitVersion @relation(fields: [unitVersionId], references: [id], onDelete: Restrict)

  @@unique([revisionId, unitId])            // one version per unit per revision
  @@unique([revisionId, order])             // stable ordering within a revision
  @@index([unitVersionId])
  // CHECK (migration): unit.editionId = revision.editionId
  // CHECK (migration): unitVersion.unitId = unitId
}

// ─── Stable units + immutable versions ───────────────────────────────────────

model ContentUnit {
  id        String   @id @default(cuid())
  editionId String
  unitKey   String                          // stable identity within edition
  createdAt DateTime @default(now())

  edition         Edition              @relation(fields: [editionId], references: [id], onDelete: Cascade)
  versions        ContentUnitVersion[]
  blocks          ContentBlock[]
  manifestEntries RevisionUnit[]

  @@unique([editionId, unitKey])
  @@index([editionId])
}

model ContentUnitVersion {
  id              String   @id @default(cuid())
  unitId          String
  title           String                     // title/summary can change → live on the version
  summary         String?
  durationMinutes Int?
  createdAt       DateTime @default(now())

  unit            ContentUnit    @relation(fields: [unitId], references: [id], onDelete: Cascade)
  blockVersions   BlockVersion[]
  manifestEntries RevisionUnit[]

  @@index([unitId])
  // No revisionId: a version is NOT tied to a revision. Revisions reference
  // versions through RevisionUnit.
}

// ─── Stable block identity (its OWN entity) + versioned content ──────────────

model ContentBlock {
  id            String   @id @default(cuid())
  // STABLE editorial identity. Deterministic backfill (see §C):
  //   blockKey = uuidv5(CONTENT_CORE_NAMESPACE_UUID, legacyChapterBlockId)
  blockKey      String   @unique
  unitId        String
  // Old ChapterBlock.id this block came from — the dual-read bridge (§D). Null for
  // blocks minted after the migration.
  legacyBlockId String?  @unique
  createdAt     DateTime @default(now())

  // Restrict, never Cascade: a unit cannot be deleted out from under a block that
  // may carry user anchors. ContentBlocks are stable; only BlockVersions churn.
  unit         ContentUnit  @relation(fields: [unitId], references: [id], onDelete: Restrict)
  versions     BlockVersion[]
  highlights   Highlight[]
  annotations  Annotation[]
  conceptLinks ConceptLink[]

  @@index([unitId])
}

enum BlockKind {
  PARAGRAPH
  HEADING
  QUOTE
  EXERCISE
  AUDIO
  IMAGE
  PAUSE
  VIDEO
}

model BlockVersion {
  id             String    @id @default(cuid())
  contentBlockId String
  unitVersionId  String
  order          Int
  kind           BlockKind
  content        String
  contentHash    String                       // sha256(normalize(content)) — exact-match key
  meta           Json?
  createdAt      DateTime  @default(now())

  contentBlock ContentBlock       @relation(fields: [contentBlockId], references: [id], onDelete: Cascade)
  unitVersion  ContentUnitVersion @relation(fields: [unitVersionId], references: [id], onDelete: Cascade)

  @@unique([unitVersionId, contentBlockId])    // one row per block per version
  @@unique([unitVersionId, order])
  @@index([contentBlockId])
  @@index([contentHash])
}

// ─── Concept graph ───────────────────────────────────────────────────────────

model Concept {
  id          String   @id @default(cuid())
  conceptKey  String   @unique               // "self-compassion", "emotion-labeling"
  label       String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  links       ConceptLink[]
  resonances  Resonance[]                     // FK added when Resonance.conceptId lands (§D)
}

enum ConceptRole {
  PRIMARY
  SUPPORTING
}

// XOR target: EXACTLY ONE of (unitId, contentBlockId) is set. Enforced by a CHECK
// + two PARTIAL UNIQUE indexes in the migration (Prisma cannot express either):
//   CHECK ((unitId IS NULL) <> (contentBlockId IS NULL))
//   UNIQUE (conceptId, unitId)        WHERE contentBlockId IS NULL
//   UNIQUE (conceptId, contentBlockId) WHERE unitId IS NULL
model ConceptLink {
  id             String      @id @default(cuid())
  conceptId      String
  unitId         String?
  contentBlockId String?
  role           ConceptRole @default(PRIMARY)
  createdAt      DateTime    @default(now())

  concept      Concept       @relation(fields: [conceptId], references: [id], onDelete: Cascade)
  unit         ContentUnit?  @relation(fields: [unitId], references: [id], onDelete: Cascade)
  contentBlock ContentBlock? @relation(fields: [contentBlockId], references: [id], onDelete: Restrict)

  @@index([conceptId])
  @@index([unitId])
  @@index([contentBlockId])
}

// ─── Learning event log (FIREWALLED — server-owned payload, see §10 / ADR) ────

enum LearningEventKind {
  UNIT_OPENED
  UNIT_COMPLETED
  BLOCK_DWELL
  GUIDE_SESSION_STARTED
  GUIDE_SESSION_COMPLETED
  HIGHLIGHT_CREATED
  ANNOTATION_CREATED
  RESONANCE_CONFIRMED
}

model LearningEvent {
  id        String            @id @default(cuid())
  userId    String
  kind      LearningEventKind
  editionId String?
  unitId    String?
  // Stable block identity, when the event is about a block.
  blockKey  String?
  // SERVER-OWNED discriminated payload (numbers/enums only). The client never
  // sends this map; the server constructs it per kind from validated refs (§10).
  payload   Json?
  createdAt DateTime          @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, kind])
}
```

---

## 3. Deliverable B — TypeScript contracts (`@psico/types`)

Additive; existing `Book*`/`Chapter*`/`Lector*` types stay until §G.

```ts
// packages/types/src/content-core.ts  (PROPOSED)

export type BlockKind =
  | "paragraph"
  | "heading"
  | "quote"
  | "exercise"
  | "audio"
  | "image"
  | "pause"
  | "video";

/** Stable block identity — anchors point here. */
export interface ContentBlockRef {
  blockKey: string;
  unitKey: string;
  editionKey: string;
}

export interface RenderedBlock {
  blockKey: string; // stable identity
  order: number; // from the block version in the published revision
  kind: BlockKind;
  content: string;
  meta?: Record<string, unknown> | null;
}

export interface ContentUnitView {
  unitKey: string;
  order: number; // from RevisionUnit (the manifest)
  partNumber: number | null;
  partTitle: string | null;
  title: string; // from the chosen ContentUnitVersion
  summary: string | null;
  revisionNumber: number; // which revision produced this payload
  blocks: RenderedBlock[];
}

export interface ConceptRef {
  conceptKey: string;
  label: string;
  role: "primary" | "supporting";
}

// ── Anchors resolve against STABLE ContentBlock identity ──
export type AnchorStatus = "attached" | "shifted" | "tombstoned";

export interface ResolvedHighlight {
  id: string;
  blockKey: string; // FK target is the stable ContentBlock
  unitKey: string;
  editionKey: string;
  startOffset: number;
  endOffset: number;
  quote: string; // exact text at creation — re-anchor + tombstone display
  color: "yellow" | "blue" | "pink";
  note: string | null;
  status: AnchorStatus; // "tombstoned" ⇒ block has no version in the current revision
}

// ── Resonance stays QUALITATIVE: conceptId + a provenance snapshot ──
export interface ConfirmedResonance {
  conceptKey: string;
  conceptLabel: string; // snapshot at confirm time
  editionKey: string;
  unitKey: string;
  source: "highlight" | "eco" | "exercise";
  important: boolean;
  confirmedAt: string;
}

// ── LearningEvent: server-owned DISCRIMINATED payloads. The client sends only a
//    typed INTENT (kind + refs); the server derives + owns `payload`. ──
export type LearningEventIntent =
  | { kind: "unit_opened"; editionKey: string; unitKey: string }
  | { kind: "unit_completed"; editionKey: string; unitKey: string }
  | {
      kind: "block_dwell";
      editionKey: string;
      unitKey: string;
      blockKey: string;
    }
  | {
      kind: "guide_session_started";
      editionKey: string;
      unitKey: string;
      conceptKey: string;
    }
  | {
      kind: "guide_session_completed";
      editionKey: string;
      unitKey: string;
      conceptKey: string;
    }
  | {
      kind: "highlight_created";
      editionKey: string;
      unitKey: string;
      blockKey: string;
    }
  | {
      kind: "annotation_created";
      editionKey: string;
      unitKey: string;
      blockKey: string;
    }
  | { kind: "resonance_confirmed"; conceptKey: string };

// Server-constructed, stored payloads (numbers/enums only — never free text):
export type LearningEventPayload =
  | { kind: "unit_opened" }
  | { kind: "unit_completed"; blocksTotal: number }
  | { kind: "block_dwell"; dwellMs: number; order: number }
  | { kind: "guide_session_started" }
  | { kind: "guide_session_completed"; durationSec: number }
  | { kind: "highlight_created" }
  | { kind: "annotation_created" }
  | { kind: "resonance_confirmed"; source: "highlight" | "eco" | "exercise" };
```

The client never authors `LearningEventPayload`; it submits a
`LearningEventIntent`, the server validates the refs and constructs the payload it
stores. No path exists to smuggle free text (or map-moving numbers) into the log.

---

## 4. Deliverable C — migration from `Book` / `Chapter` / `ChapterBlock`

**Principle: backfill, don't move.** New tables are populated _from_ the old ones;
the old tables keep serving reads until §G. No content is deleted.

| Old                             | New                                        | Mapping                                                                                                                  |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `Book`                          | `Work` + `Edition`                         | One `Work` per intellectual work; one `Edition` per `Book`. `Edition.slug = Book.slug`.                                  |
| `Book` (snapshot)               | `Revision` #1 (PUBLISHED) + `RevisionUnit` | Each edition gets revision 1; a `RevisionUnit` per chapter pointing at that chapter's initial version.                   |
| `Chapter`                       | `ContentUnit` + `ContentUnitVersion`       | `ContentUnit.unitKey = "u-" + Chapter.order` (stable); title/summary/duration → version. `order/part*` → `RevisionUnit`. |
| `ChapterBlock`                  | `ContentBlock` + `BlockVersion`            | One `ContentBlock` per legacy block (identity), one `BlockVersion` under revision-1's version.                           |
| `CHAPTER_CONCEPTS` (code)       | `Concept` + `ConceptLink`                  | Seed `Concept` rows; one `ConceptLink(unitId, PRIMARY)` per `(bookSlug, chapterOrder)`.                                  |
| `Resonance.conceptKey` (string) | keep string **+** add `conceptId` FK       | Backfill `conceptId` by matching `conceptKey`; provenance snapshot columns stay.                                         |

### blockKey backfill — anchored to the legacy row id

The stable identity is derived from the **existing `ChapterBlock.id`**, so existing
`Highlight`/`Annotation` (which point at that id) map deterministically onto the
new `ContentBlock`:

```
CONTENT_CORE_NAMESPACE_UUID = "5f1d7e2a-9c84-4b3e-8a17-6d2c0b9f4e31"   // fixed, once

ContentBlock.legacyBlockId = ChapterBlock.id
ContentBlock.blockKey      = uuidv5(CONTENT_CORE_NAMESPACE_UUID, ChapterBlock.id)
```

`uuidv5` is a pure function of its inputs → the backfill is reproducible and
idempotent. **Not** derived from `editionKey`, `order`, or `contentHash` — identity
must not change when a block is reordered or its text is edited; only the legacy
row id (a stable handle to _this_ block) defines it. Blocks minted _after_ the
migration get a fresh `uuid` at creation and carry it forward by the ingest diff
(§E); `legacyBlockId` is null for them.

Ships as a Prisma migration (`CREATE`s only) + an idempotent Node backfill invoked
once by `preDeployCommand`. It never issues `DELETE`.

---

## 5. Deliverable D — preserving highlights (and annotations, resonances)

**D1 — Anchors FK the stable `ContentBlock`, never a version or a soft key.**

```prisma
// PROPOSED (highlights; annotations analogous)
model Highlight {
  id             String   @id @default(cuid())
  userId         String
  contentBlockId String                    // FK → ContentBlock (STABLE identity)
  startOffset    Int
  endOffset      Int
  quote          String                    // exact text at creation → re-anchor fallback
  color          HighlightColor @default(YELLOW)
  note           String?
  tombstonedAt   DateTime?                  // set when the block has no version in the live revision
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  // Restrict: you cannot delete a ContentBlock that still carries a highlight.
  contentBlock ContentBlock @relation(fields: [contentBlockId], references: [id], onDelete: Restrict)

  @@index([userId, contentBlockId])
  @@index([contentBlockId])
}
```

Because `ContentBlock` is stable and `onDelete: Restrict`, **no content write can
cascade-delete a mark** — the schema makes the original bug unrepresentable.

**D2 — Backfill then drop, never both at once.** Sequenced as separate PRs (§G):

```
1. add ContentBlock.legacyBlockId + Highlight.contentBlockId (nullable)   (additive)
2. backfill: Highlight.contentBlockId = ContentBlock where legacyBlockId = Highlight.blockId
3. dual-read: resolver prefers contentBlockId, falls back to legacy blockId  (safety net)
4. make contentBlockId NOT NULL, drop Highlight.blockId + its FK           (cutover, reversible via 3)
```

**Resonance** already keys by concept, so it never had the cascade bug; it gains a
nullable `conceptId` FK (integrity) and keeps its provenance snapshot columns
(`bookSlug`, `chapterOrder`, `conceptLabel`) through the dual-read window and after.

---

## 6. Deliverable E — non-destructive ingest (revision-minting, manifest-copy)

Ingest never deletes a block. It mints a revision, **copies the manifest forward**,
and rewrites only the changed unit. Matching is **conservative** (no fuzzy 0.8):

```
ingest(edition, unitKey, newBlocks[]):
  prevRev  := edition.publishedRevision                 # or ∅ on first ingest
  newRev   := Revision(edition, number = prevRev.number + 1, status = DRAFT)

  # 1. copy the manifest: every OTHER unit keeps its exact same version
  for ru in prevRev.units where ru.unit.unitKey != unitKey:
      RevisionUnit(newRev, ru.unit, ru.unitVersion, ru.order, ru.partNumber, ru.partTitle)

  # 2. build a NEW immutable version for the changed unit
  unit    := ContentUnit(edition, unitKey)              # stable, exists
  newVer  := ContentUnitVersion(unit)                   # immutable
  prevVer := prevRev.units[unitKey]?.unitVersion        # ∅ on first ingest
  prev    := prevVer.blockVersions ⋈ their ContentBlock

  for nb in newBlocks in order:
     cb := matchExact(nb, prev)                          # (a) contentHash exact, else (b) blockKey exact
     if cb is ∅:
        cand := fuzzyCandidates(nb, prev, >= 0.95)       # normalized quote similarity
        cb := (cand.length == 1) ? cand[0].contentBlock : ∅   # UNIQUE candidate only
     if cb is ∅:
        cb := ContentBlock(unit, blockKey = uuid())      # net-new identity
     BlockVersion(newVer, cb, order, kind, content, contentHash, meta)

  # 3. ContentBlocks in prevVer with NO BlockVersion in newVer are TOMBSTONED
  #    automatically: the stable ContentBlock persists, its anchors resolve
  #    "tombstoned". No empty rows, no GC in v1.

  # 4. replace only the changed unit's manifest entry, then publish
  RevisionUnit(newRev, unit, newVer, order, partNumber, partTitle)
  publish(edition, newRev)     # atomic: Edition.publishedRevisionId = newRev.id
```

Matching policy (closed decisions):

- **Auto-match only on exact `contentHash` or exact `blockKey`.**
- **Fuzzy ≥ 0.95 accepted only when it yields a single candidate.** Two or more
  ≥ 0.95 candidates ⇒ ambiguous ⇒ the block is treated as net-new and the old
  block **tombstones** (never a coin-flip re-attach). No 0.8 tier exists.
- A tombstoned `ContentBlock` is retained forever in v1 (no GC), so its anchors
  keep resolving; the old revision stays fully intact regardless.

Properties: **idempotent** (identical content → every block matches by hash →
empty diff, mint of a content-identical version can be skipped); **edit-tolerant
only when unambiguous**; **reorder-tolerant** (order is on the manifest/version,
identity on `ContentBlock`); **never destructive**.

The current `ingest-chapter-md.mjs` is **frozen** and replaced by `ingest-v2` in
the ingest PR (§G). Until then, nothing re-ingests.

---

## 7. Deliverable F — identity, re-anchor, tombstone & firewall tests

Written against pure functions (no DB) → fast + deterministic. Acceptance criteria
for CC-1.

**Identity**

- `blockKey` backfill deterministic: `uuidv5(NAMESPACE, legacyId)` stable across runs.
- Re-ingesting byte-identical content ⇒ every block matches by hash ⇒ empty diff.
- Distinct legacy ids ⇒ distinct keys; same legacy id ⇒ same key.

**RevisionManifest algorithm**

- Ingesting one unit copies every _other_ unit's `RevisionUnit` unchanged (same
  `unitVersionId`, same order/part).
- The changed unit gets a new `ContentUnitVersion` + a replaced manifest entry.
- `order`/`partNumber`/`partTitle` are read from `RevisionUnit`, not the version.

**Re-anchoring (conservative)**

- Highlight survives a revision that **reorders** neighbors (same `ContentBlock`,
  `status: "attached"`).
- Highlight survives an **exact-hash** or **unique ≥ 0.95** edit (`status:
"shifted"` when offsets drift, re-located by `quote`).
- **Ambiguous ≥ 0.95** (two candidates) ⇒ the block tombstones, highlight
  `status: "tombstoned"`, never silently re-attached to the wrong block.
- Inserting a block above B keeps B's key; the new block gets a fresh key.

**Tombstone**

- Removing a block that has an anchor ⇒ the `ContentBlock` persists with no
  `BlockVersion` in the new revision; the highlight resolves `tombstoned` and is
  **never deleted**. (No GC in v1.)
- Removing a block with no anchor ⇒ likewise retained (no GC), old revision intact.

**Firewall (semantic projection, not raw JSON)**

- Define `projectMap(mapResult)` → the semantic axis projection (axis values +
  provenance + evidence ids), stripped of incidental fields (timestamps, cache
  keys, ordering). A ratchet walks `content-core/**` + `learning/**` and asserts
  no write path touches `EmotionalMapSnapshot`, the map cache key, or a scoring
  input.
- Behavioral: emit every `LearningEventKind` (+ reading/progress/guide/highlight/
  annotation) for a user, then assert `projectMap(before)` **deep-equals**
  `projectMap(after)`. (Semantic equality — a new incidental timestamp must not
  fail it, a moved axis must.)

**Migration**

- Backfill run twice is a no-op the second time.
- Every existing `Highlight`/`Annotation` resolves to a `ContentBlock` after
  backfill (zero orphans introduced).

---

## 8. Deliverable G — plan of small PRs

Each PR independently shippable, reversible, green. No PR adds _and_ drops the same
column. The Emotional Map, epochs, OU, authRevision are untouched throughout.

| PR       | Scope                                                                                                                                                                                   | Reversible by            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **CC-0** | Design doc + ADR 0016. No code.                                                                                                                                                         | —                        |
| **CC-1** | Pure libs + tests: `blockKey` (uuidv5), `normalize`/`contentHash`, the **RevisionManifest** algorithm, exact/≥0.95 matcher, anchor resolver, `projectMap`, all §F tests. **No schema.** | delete files             |
| **CC-2** | Additive schema: all 11 models. Pure `CREATE` + the CHECK/partial-unique SQL for `RevisionUnit` (cross-edition) & `ConceptLink` (XOR).                                                  | drop tables (unused)     |
| **CC-3** | Backfill job: populate new tables from `Book`/`Chapter`/`ChapterBlock`; seed `Concept`/`ConceptLink`. Idempotent. Reads still old.                                                      | truncate new tables      |
| **CC-4** | Anchor columns: `Highlight/Annotation.contentBlockId` (nullable) + `ContentBlock.legacyBlockId` + `Resonance.conceptId`. Backfill. **Dual-read** resolver.                              | keep `blockId`; flag off |
| **CC-5** | `ingest-v2` (revision-minting, manifest-copy) behind a flag; freeze the old script. Content Core read endpoints alongside Lector.                                                       | don't call v2            |
| **CC-6** | Flip clients (web + mobile) to Content Core reads. Lector endpoints `@deprecated`, dual-served.                                                                                         | revert client import     |
| **CC-7** | LearningEvent emit points (server-owned payloads) + the firewall projection ratchet. Read-only w.r.t. the map.                                                                          | stop emitting            |
| **CC-8** | Cutover: drop `Highlight/Annotation.blockId` + FK; retire `Resonance` string key in favor of `conceptId`. Remove dual-read.                                                             | restore from CC-4 window |
| **CC-9** | Cleanup: retire `Book`/`Chapter`/`ChapterBlock` reads, remove `CHAPTER_CONCEPTS` literals, delete deprecated Lector endpoints.                                                          | —                        |

Sequencing rule (from the incident sync work): **never** let a PR's tree carry an
add _and_ a drop of the same column; the dual-read window (CC-4 → CC-8) is exactly
so a drop is always preceded by a verified backfill.

---

## 9. The Anchor / tombstone contract (in full)

A **user anchor** is any mark a person makes on content: `Highlight`, `Annotation`,
and (concept-level) `Resonance`. The contract:

1. **Anchors reference stable identity.** `Highlight`/`Annotation` FK
   `ContentBlock` (`onDelete: Restrict`); `Resonance` FKs `Concept`. There is no FK
   to a `BlockVersion` and no soft `blockKey` string without a FK, so no content
   write can cascade-delete a mark.
2. **Resolution is against the current published revision's manifest.** The
   resolver finds the block's `BlockVersion` under the published `ContentUnitVersion`:
   - found, offsets valid vs. `quote` ⇒ `attached`.
   - found, text drifted ⇒ re-locate `quote`; `shifted`.
   - **no `BlockVersion` in the live revision** ⇒ `tombstoned`.
3. **Tombstone = the stable `ContentBlock` with no live version.** No empty rows
   are written; the persistent `ContentBlock` _is_ the tombstone. The UI shows a
   tombstoned mark as "from an earlier version of this chapter" with its preserved
   `quote`, and offers to dismiss — an explicit user action, never an auto-purge.
   **No tombstone GC in v1.**
4. **Only the user removes their mark.** Deleting a highlight/annotation is a user
   action. Editorial changes can _tombstone_ but can **never** delete a user's mark.
5. **Quote is the durable fallback.** Exact selected text at creation; used to
   re-locate a `shifted` mark and to render a `tombstoned` one.

Privacy: `quote` excerpts are **public, licensed book content**, not Diario/Eco
plaintext — consistent with ADR 0007 (the E2E firewall protects the user's own
writing in `DiaryEntry` ciphertext, which never lives here).

---

## 10. The invariant — learning never moves the Emotional Map

> **`LearningEvent`, reading, progress, `GuideSession`, `Highlight`, `Annotation`,
> and `Resonance` never modify any axis of the Emotional Map.**

Kept structural, not aspirational:

- **No shared write path.** Content Core / Learning modules never import
  `EmotionalMapService` write methods, `EmotionalMapSnapshot`, or the map cache
  key.
- **LearningEvent payloads are server-owned + discriminated.** The client submits a
  typed `LearningEventIntent` (kind + refs); the server validates the refs and
  constructs the stored `payload` (numbers/enums only). There is no free-text
  `meta` and no client-authored numeric field, so nothing can be smuggled toward a
  score.
- **`Resonance` stays qualitative.** It carries `conceptId` + a provenance snapshot
  and feeds Conexión/Propósito **only** as _counts of distinct confirmed / distinct
  important concepts_ (the ARC cycle) — a presence signal from an explicit user
  tap, never a magnitude that moves an axis.
- **Executable ratchet + semantic projection test.** A spec fails the build if a
  Content Core / Learning file references a map scoring input; a behavioral test
  asserts `projectMap(map)` is **semantically identical** before/after a full
  sweep of learning signals (raw-JSON byte-equality is explicitly _not_ used — an
  incidental new timestamp must not fail the test, a moved axis must).
- **Guide V1 inherits it.** The per-concept Guide (next design) emits
  `GUIDE_SESSION_*` events and may _read_ the map to adapt tone (like Eco
  suggestions, read-only), but writes nothing back.

Learning tells us **what a person did with the content**. The map reflects **what a
person told us about how they feel**. Different tables, different modules, joined
only by the person — never by a score.

---

## 11. What this design explicitly does NOT do

- Does not touch the Emotional Map, `CACHE_EPOCH`/`FACTS_EPOCH`, OU, or authRevision.
- Does not implement anything — CC-1..CC-9 are separate future PRs.
- Does not change `ContentChunk`/RAG, Eco, Diario crypto, or billing.
- Does not build Guide V1 — that is the _next_ design, depending on `Concept` +
  `LearningEvent` (CC-2/CC-7).

## 12. Closed decisions (were open questions)

1. **Work vs. Edition** — modeled **separately from v1**. The tables are cheap and
   the backfill is one-time; a second edition/language later reshapes nothing.
2. **Matcher** — **no fuzzy 0.8.** Auto-match only on exact `contentHash`/`blockKey`;
   fuzzy ≥ 0.95 accepted **only** with a single candidate, else tombstone.
3. **Tombstone GC** — **none in v1.** Tombstoned `ContentBlock`s are retained so
   anchors keep resolving; revisit only if volume ever demands it.
4. **Resonance identity** — keep the provenance snapshot columns for display **and**
   add `conceptId` as the integrity anchor. `Resonance` remains qualitative and
   **never moves an axis**.
