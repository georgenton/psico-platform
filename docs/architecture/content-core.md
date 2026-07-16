# Content Core — technical design (design only, no implementation)

**Status:** Proposed · **Date:** 2026-07-16 · **ADR:** [0016](../adr/0016-content-core-work-edition-revision.md)

This is a **design document**. Nothing here is implemented yet. The Prisma models,
TypeScript contracts and migration SQL below are _proposals_ to review before we
cut the first small PR (see §G). The current runtime model (`Book` · `Chapter` ·
`ChapterBlock` · `Highlight` · `Annotation` · `ReadingSession` · `Resonance`) stays
exactly as-is until a PR explicitly changes it.

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
   emotional axis. We want that firewall to be structural, not a convention.

Content Core solves all four by separating **editorial identity** (what a work is,
across editions and revisions) from **stored content** (the blocks of a given
revision) from **user anchors** (marks that must survive editing) from **learning
events** (an append-only log that is walled off from the map).

---

## 1. The ten entities (conceptual model)

```
Work ─1:N─ Edition ─1:N─ Revision            (editorial identity + history)
                    │
                    └─1:N─ ContentUnit ─1:N─ ContentUnitVersion ─1:N─ Block
                                                                        │ blockKey (stable)
Concept ─N:M(ConceptLink)─ {ContentUnit | Block}   (what teaches what)

UserAnchor {Highlight | Annotation | Resonance}  ── anchored by blockKey + quote
                                                    └─ tombstone contract on removal

LearningEvent (append-only)  ✕──────────  EmotionalMap axes   (hard firewall)
```

| #   | Entity                        | One-line role                                                                                                                                                          | Replaces / relates to                |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | **Work**                      | The abstract intellectual work ("Emociones en Construcción"), author- and edition-agnostic.                                                                            | new (above `Book`)                   |
| 2   | **Edition**                   | A concrete published edition of a Work (1st ed., revised ed., `es-419` ed.). The unit users "own"/read.                                                                | ≈ today's `Book`                     |
| 3   | **Revision**                  | An immutable editorial snapshot of an Edition's content. Publishing = mint a new Revision; the old one stays.                                                          | new (enables non-destructive ingest) |
| 4   | **ContentUnit**               | The stable editorial unit within an Edition (≈ a chapter), with an identity that persists across Revisions.                                                            | ≈ today's `Chapter`                  |
| 5   | **ContentUnitVersion**        | The content of one ContentUnit _within one Revision_. Holds the ordered blocks for that revision.                                                                      | new (versioned `Chapter` body)       |
| 6   | **Block.blockKey**            | A **stable editorial UUID** for a block, distinct from its per-version row `id`. Same paragraph across revisions ⇒ same `blockKey`.                                    | fixes `ChapterBlock.id` instability  |
| 7   | **Concept**                   | A first-class psychoeducational concept (`self-compassion`, `emotion-labeling`), curated, with a stable `conceptKey`.                                                  | formalizes `CHAPTER_CONCEPTS`        |
| 8   | **ConceptLink**               | An N:M edge "this unit/block teaches this concept", with a role (primary/supporting).                                                                                  | new (concept graph)                  |
| 9   | **Anchor/tombstone contract** | How `Highlight`/`Annotation`/`Resonance` attach by `blockKey` (+ quote fallback), and how a removed block becomes a preserved _tombstone_ instead of a cascade-delete. | fixes the data-loss bug              |
| 10  | **LearningEvent**             | Append-only log of learning interactions (unit viewed/completed, guide session, mark created). **Structurally firewalled from the Emotional Map.**                     | new (learning ≠ map)                 |

### Identity vs. content, the one idea to hold onto

- **Identity** is stable and lives on: `Work`, `Edition`, `ContentUnit`, and
  `Block.blockKey`. These never change when we re-ingest or correct text.
- **Content** is versioned and disposable-per-revision: `Revision`,
  `ContentUnitVersion`, and `Block` _rows_. A re-ingest writes new content rows
  under a new revision; it does **not** touch identity.
- **User anchors** point at **identity** (`blockKey`), never at a content row
  `id`. That is the whole reason highlights survive editing.

---

## 2. Deliverable A — proposed Prisma schema

Additive first (new tables alongside the old ones), with FK CASCADE only _inside_
the content tree, never from a user anchor. Prisma names in `PascalCase`, matching
the repo. **This is a proposal, not applied.**

```prisma
// ─── Editorial identity + history ────────────────────────────────────────────

model Work {
  id        String   @id @default(cuid())
  // Stable, human-readable identity for the intellectual work.
  workKey   String   @unique            // e.g. "emociones-en-construccion"
  title     String
  authorName String                     // denormalized until Author B2B owns it
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  editions  Edition[]
}

model Edition {
  id         String   @id @default(cuid())
  workId     String
  // Stable identity for this edition; also the public slug users read at.
  editionKey String   @unique           // e.g. "emociones-en-construccion-1e-es"
  slug       String   @unique           // routing; may equal editionKey
  label      String                     // "Primera edición"
  language   String   @default("es-419")
  // The revision currently served to readers. Null until first publish.
  publishedRevisionId String? @unique
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  work              Work        @relation(fields: [workId], references: [id], onDelete: Cascade)
  revisions         Revision[]
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
  id         String         @id @default(cuid())
  editionId  String
  // Monotonic per edition: 1, 2, 3…  (unique with editionId)
  number     Int
  status     RevisionStatus @default(DRAFT)
  note       String?                     // "corrige typo cap.3", ingest manifest ref
  createdAt  DateTime       @default(now())
  publishedAt DateTime?

  edition       Edition              @relation(fields: [editionId], references: [id], onDelete: Cascade)
  unitVersions  ContentUnitVersion[]
  publishedFor  Edition?             @relation("PublishedRevision")

  @@unique([editionId, number])
  @@index([editionId, status])
}

// ─── Stable units + versioned content ────────────────────────────────────────

model ContentUnit {
  id        String   @id @default(cuid())
  editionId String
  // Stable identity of the unit across revisions (≈ the chapter's soul).
  unitKey   String                       // unique within edition
  // Structural, revision-independent metadata (part grouping, canonical order).
  order       Int
  partNumber  Int?
  partTitle   String?
  createdAt DateTime @default(now())

  edition  Edition              @relation(fields: [editionId], references: [id], onDelete: Cascade)
  versions ContentUnitVersion[]

  @@unique([editionId, unitKey])
  @@unique([editionId, order])
  @@index([editionId])
}

model ContentUnitVersion {
  id         String   @id @default(cuid())
  unitId     String
  revisionId String
  // Title/summary can change between revisions → they live here, not on the unit.
  title       String
  summary     String?
  durationMinutes Int?
  createdAt  DateTime @default(now())

  unit     ContentUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)
  revision Revision    @relation(fields: [revisionId], references: [id], onDelete: Cascade)
  blocks   Block[]

  @@unique([unitId, revisionId])
  @@index([revisionId])
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

model Block {
  id        String   @id @default(cuid())   // per-version row id (disposable)
  versionId String
  // ── STABLE EDITORIAL IDENTITY ──
  // Same logical block across revisions carries the same blockKey. This is what
  // user anchors point at. Assigned once, carried forward by the diff on ingest.
  blockKey  String   @default(uuid())
  order     Int
  kind      BlockKind
  content   String                          // markdown/plain per kind
  meta      Json?                           // exerciseId, audioUrl, videoUrl, caption…
  // Normalized text used for quote-based re-anchoring + block-identity hashing.
  contentHash String                        // sha256(normalize(content))
  createdAt DateTime @default(now())

  version     ContentUnitVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  conceptLinks ConceptLink[]

  // blockKey is unique WITHIN a version (one row per key per revision), and the
  // (versionId, order) pair stays unique like today.
  @@unique([versionId, blockKey])
  @@unique([versionId, order])
  @@index([blockKey])                       // reattach anchors by identity
}

// ─── Concept graph ───────────────────────────────────────────────────────────

model Concept {
  id          String   @id @default(cuid())
  conceptKey  String   @unique              // "self-compassion", "emotion-labeling"
  label       String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  links       ConceptLink[]
  resonances  Resonance[]                   // FK added when Resonance.conceptId lands (§D)
}

enum ConceptRole {
  PRIMARY
  SUPPORTING
}

model ConceptLink {
  id        String      @id @default(cuid())
  conceptId String
  // A link targets EITHER a unit or a specific block (both nullable, exactly one set).
  unitId    String?
  blockKey  String?                          // by stable key, not row id
  role      ConceptRole @default(PRIMARY)
  createdAt DateTime    @default(now())

  concept Concept      @relation(fields: [conceptId], references: [id], onDelete: Cascade)
  unit    ContentUnit? @relation(fields: [unitId], references: [id], onDelete: Cascade)

  @@unique([conceptId, unitId, blockKey])
  @@index([conceptId])
  @@index([unitId])
  @@index([blockKey])
}

// ─── Learning event log (FIREWALLED from the Emotional Map — see §10 / ADR) ───

enum LearningEventKind {
  UNIT_OPENED
  UNIT_COMPLETED
  BLOCK_DWELL          // block became "read" (dwell/heartbeat)
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
  blockKey  String?
  // Small numeric/categorical payload ONLY (durations, counts, order). Never
  // free text, never anything that could carry diary/eco plaintext.
  meta      Json?
  createdAt DateTime          @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, kind])
}
```

Notes:

- **No user anchor FKs to a content row.** `Highlight`/`Annotation`/`Resonance`
  will reference `editionId + unitKey + blockKey` (§D), never `Block.id`. That is
  what removes the cascade-delete bug at the schema level.
- `ContentChunk` (RAG/pgvector) is **unchanged** by this design; it re-embeds per
  published revision on its own cadence. It already carries `chunkHash` for
  idempotent upsert.
- Partial-unique on `ConceptLink` (exactly one of `unitId`/`blockKey`) is enforced
  in the service + a CHECK constraint in the migration (Prisma can't express XOR).

---

## 3. Deliverable B — TypeScript contracts (`@psico/types`)

Read-side shapes the API returns and clients consume. Additive; the existing
`Book*`/`Chapter*`/`Lector*` types stay until §G cuts them over.

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

export interface ContentBlock {
  /** Stable editorial identity. Anchors point here. */
  blockKey: string;
  order: number;
  kind: BlockKind;
  content: string;
  meta?: Record<string, unknown> | null;
}

export interface ContentUnitView {
  unitKey: string;
  order: number;
  partNumber: number | null;
  partTitle: string | null;
  title: string;
  summary: string | null;
  /** Which revision produced this payload — clients echo it back on writes. */
  revisionNumber: number;
  blocks: ContentBlock[];
}

export interface EditionSummary {
  editionKey: string;
  slug: string;
  workKey: string;
  title: string;
  authorName: string;
  language: string;
  publishedRevisionNumber: number | null;
}

/** Concepts a unit/block teaches (formalized CHAPTER_CONCEPTS). */
export interface ConceptRef {
  conceptKey: string;
  label: string;
  role: "primary" | "supporting";
}

// ── Anchors (user marks) resolve against stable identity ──
export interface AnchorTarget {
  editionKey: string;
  unitKey: string;
  blockKey: string;
  /** UTF-16 offsets within the block content, as today. */
  startOffset: number;
  endOffset: number;
  /** The exact quoted text at creation time — the re-anchor fallback. */
  quote: string;
}

export type AnchorStatus = "attached" | "shifted" | "tombstoned";

export interface ResolvedHighlight extends AnchorTarget {
  id: string;
  color: "yellow" | "blue" | "pink";
  note: string | null;
  status: AnchorStatus; // tombstoned ⇒ block gone in current revision
}

// ── Learning events: numeric/categorical only, never text ──
export type LearningEventKind =
  | "unit_opened"
  | "unit_completed"
  | "block_dwell"
  | "guide_session_started"
  | "guide_session_completed"
  | "highlight_created"
  | "annotation_created"
  | "resonance_confirmed";

export interface LearningEventInput {
  kind: LearningEventKind;
  editionKey?: string;
  unitKey?: string;
  blockKey?: string;
  meta?: Record<string, number | string | boolean>;
}
```

The `AnchorStatus` on the read side is the visible half of the tombstone contract
(§9): the client renders a `shifted`/`tombstoned` mark differently and never just
drops it.

---

## 4. Deliverable C — migration from `Book` / `Chapter` / `ChapterBlock`

**Principle: backfill, don't move.** The new tables are populated _from_ the old
ones in a data migration; the old tables keep serving reads until §G flips the
readers. No content is deleted.

| Old                               | New                                           | Mapping                                                                                                                                                     |
| --------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Book`                            | `Work` + `Edition`                            | One `Work` per distinct intellectual work; one `Edition` per `Book` row. `Edition.slug = Book.slug`. `workKey`/`editionKey` derived from slug.              |
| `Book` (content snapshot)         | `Revision` #1 (PUBLISHED)                     | Each edition gets an initial published `Revision` number 1 capturing today's live content.                                                                  |
| `Chapter`                         | `ContentUnit` + `ContentUnitVersion`          | `ContentUnit.unitKey = "u-" + Chapter.order` (stable); title/summary/duration → the version under revision 1. `partNumber`/`partTitle` → unit (structural). |
| `ChapterBlock`                    | `Block` under revision-1 version              | Row copied 1:1; **`blockKey` backfilled deterministically** (below); `contentHash = sha256(normalize(content))`.                                            |
| `CHAPTER_CONCEPTS` (code catalog) | `Concept` + `ConceptLink`                     | Seed `Concept` rows from the catalog; one `ConceptLink(unitId, role=PRIMARY)` per `(bookSlug, chapterOrder)` entry.                                         |
| `Resonance.conceptKey` (string)   | keep string **+** add nullable `conceptId` FK | Backfill `conceptId` by matching `conceptKey`. String stays for one release (dual-read), FK becomes source of truth in §G.                                  |

### blockKey backfill — deterministic, stable, reproducible

The first revision's `blockKey` for each block is derived so that **re-running the
backfill yields identical keys** and so the same content ingested twice lands on
the same key:

```
blockKey = uuidv5(namespace = editionKey,
                  name = unitKey + ":" + order + ":" + contentHash)
```

`uuidv5` is a pure function of its inputs → deterministic, no clock, no RNG (this
also keeps the migration test reproducible, and dodges the `Date.now()`/random
constraints). After revision 1, new revisions _carry keys forward_ by diff (§E),
not by recomputation — because content edits change `contentHash`, and we want an
edited paragraph to keep its old key, not get a new one.

The migration ships as a **Prisma migration with an embedded data step**
(`prisma migrate` SQL + a follow-on idempotent Node backfill invoked by
`preDeployCommand`, guarded to run once). It never issues `DELETE`.

---

## 5. Deliverable D — strategy for preserving highlights (and annotations, resonances)

This is the payoff. Two moves:

**D1 — Re-point anchors at stable identity.** `Highlight`/`Annotation` stop
referencing `Block.id`. Their new shape:

```prisma
// PROPOSED shape (highlights; annotations analogous)
model Highlight {
  id          String   @id @default(cuid())
  userId      String
  editionId   String
  unitKey     String                 // stable
  blockKey    String                 // stable — no FK to a content row
  startOffset Int
  endOffset   Int
  quote       String                 // exact text at creation → re-anchor fallback
  color       HighlightColor @default(YELLOW)
  note        String?
  // Tombstone bookkeeping (§9). Null while attached.
  tombstonedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, editionId, unitKey])
  @@index([blockKey])
}
```

Note `blockKey` has **no** `@relation` — it is a soft reference resolved at read
time against the _current published revision's_ blocks. A missing block does not
cascade-delete the highlight; it flips it to `tombstoned` (§9).

**D2 — Backfill the anchor columns before the FK is dropped.** For every existing
`Highlight`/`Annotation`, populate `editionId`, `unitKey`, `blockKey`, `quote`
from the block it currently points at (via the revision-1 backfill map), _then_
drop `blockId`. Order matters and is enforced as separate PRs (§G) so a failed
step is reversible:

```
1. add nullable editionId/unitKey/blockKey/quote     (additive, no behavior change)
2. backfill them from existing blockId                (data migration, idempotent)
3. dual-read: resolver prefers blockKey, falls back to blockId   (safety net)
4. make blockKey NOT NULL, drop blockId + its FK      (cutover, reversible via 3)
```

During step 3 the reader resolves a highlight by `blockKey` against the live
revision; if not found (pre-backfill rows), it falls back to the legacy `blockId`.
Once step 2 is verified complete, step 4 removes the legacy path.

**Resonance** already keys by `conceptKey` (concept-level, not block-level), so it
never had the cascade bug — but it gains the nullable `conceptId` FK (§C) for
integrity and keeps its string key through the dual-read window.

---

## 6. Deliverable E — non-destructive ingest

The new ingest never deletes a block that could carry a user mark. It **mints a
revision and diffs**:

```
ingest(editionKey, unitKey, newBlocks[]):
  prev := latest revision's blocks for this unit   (or ∅ on first ingest)
  rev  := new Revision(edition, number = prev.number + 1, status = DRAFT)
  ver  := new ContentUnitVersion(unit, rev)

  for each newBlock in order:
     match := findMatch(newBlock, prev)      // by contentHash, else by fuzzy quote
     newBlock.blockKey := match ? match.blockKey : uuidv5(...)   // carry key or mint
     write Block(ver, blockKey, order, kind, content, contentHash)

  # blocks in `prev` with NO match in `newBlocks` are "removed":
  removed := prev.blocks \ matched
  for each r in removed:
     anchors := userAnchors(editionKey, unitKey, r.blockKey)
     if anchors nonempty:
        # DO NOT drop. Carry a tombstone block into the new version so the
        # anchor still resolves, flagged as tombstoned (§9).
        write Block(ver, r.blockKey, order=∞, kind=TOMBSTONE-marked meta, content="")
     # else: simply absent in the new revision (no user data at stake)

  publish(edition, rev)    # atomic: set Edition.publishedRevisionId = rev.id
```

Key properties:

- **Idempotent.** Re-ingesting identical content matches every block by
  `contentHash` → same `blockKey`s → the diff is empty → new revision is
  content-identical (we can even skip minting if the diff is empty).
- **Edit-tolerant.** A typo fix changes one block's `contentHash`; fuzzy-quote
  match still binds it to the prior `blockKey`, so a highlight on that paragraph
  survives with `status: "shifted"` (offsets re-validated against `quote`).
- **Reorder-tolerant.** Order lives on the row, identity on the key; reordering
  paragraphs keeps every key.
- **Never destructive.** Removed blocks that hold anchors become tombstones; the
  old revision is retained untouched regardless.

The current `ingest-chapter-md.mjs` (destructive replace) is **frozen** and
replaced by `ingest-v2` in the ingest PR (§G). Until then, nothing re-ingests.

---

## 7. Deliverable F — identity & re-anchor tests (the spec we commit first)

These tests are written against the pure diff/anchor functions (no DB), so they
run fast and deterministically. They are the acceptance criteria for the ingest
and anchor PRs.

**Identity**

- `blockKey` backfill is deterministic: same inputs ⇒ same key across runs.
- Re-ingesting byte-identical content produces the same `blockKey` for every
  block (empty diff).
- Two different editions with identical text get different keys (namespace =
  `editionKey`).

**Re-anchoring**

- A highlight on block B survives a revision that **reorders** B's neighbors
  (same key, `status: "attached"`).
- A highlight survives a revision that **edits B's text**: matched by quote,
  offsets re-validated, `status: "shifted"` when offsets no longer align exactly.
- A highlight survives a revision that **inserts a new block above B** (B keeps
  its key; the new block gets a fresh key).

**Tombstone**

- Removing a block that has a highlight ⇒ a tombstone block is carried into the
  new revision, the highlight resolves with `status: "tombstoned"`, and it is
  **never deleted**.
- Removing a block with **no** user anchor ⇒ it is simply absent (no tombstone
  bloat), old revision still intact.

**Firewall (the invariant, as an executable ratchet)**

- A test walks `apps/api/src/content-core/**` and `learning/**` and asserts no
  code path imports/writes `EmotionalMapSnapshot`, the map cache key, or any
  scoring input. Mirrors the existing `emotional-map.v2-contract.spec.ts` style.
- A behavioral test: emitting every `LearningEventKind` for a user leaves
  `GET /api/emotional-map` byte-identical (deep-equal before/after).

**Migration**

- The data backfill run twice is idempotent (second run is a no-op).
- Every existing `Highlight`/`Annotation` resolves to a block after backfill
  (zero orphans introduced by the migration itself).

---

## 8. Deliverable G — plan of small PRs

Each PR is independently shippable, reversible, and green in CI. No PR both adds a
column and drops one. The Emotional Map, epochs, OU, and authRevision are untouched
throughout.

| PR              | Scope                                                                                                                                                                                            | Risk | Reversible by                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------- |
| **CC-0** (this) | Design doc + ADR 0016. No code.                                                                                                                                                                  | none | —                                     |
| **CC-1**        | Pure libs + tests: `blockKey` (uuidv5), `normalize`/`contentHash`, the diff + anchor-resolver functions, all §F tests. No schema.                                                                | none | delete files                          |
| **CC-2**        | Additive schema: `Work`/`Edition`/`Revision`/`ContentUnit`/`ContentUnitVersion`/`Block`/`Concept`/`ConceptLink`/`LearningEvent`. No reads switch. Migration is pure `CREATE`.                    | low  | drop tables (unused)                  |
| **CC-3**        | Backfill job: populate new tables from `Book`/`Chapter`/`ChapterBlock` + seed `Concept`/`ConceptLink` from the catalog. Idempotent. Reads still old.                                             | low  | truncate new tables                   |
| **CC-4**        | Anchor columns: add nullable `editionId/unitKey/blockKey/quote` to `Highlight`/`Annotation`; add nullable `Resonance.conceptId`. Backfill. **Dual-read resolver** (blockKey → blockId fallback). | med  | keep `blockId`; disable resolver flag |
| **CC-5**        | `ingest-v2` (non-destructive, revision-minting) behind a script flag; freeze the old script. Content Core read endpoints (`/api/content/editions/:key/units/:unitKey`) added _alongside_ Lector. | med  | keep `/api/lector/*`; don't call v2   |
| **CC-6**        | Flip clients (web + mobile) to Content Core read endpoints. Lector endpoints marked `@deprecated`, dual-served.                                                                                  | med  | revert client import                  |
| **CC-7**        | LearningEvent emit points (open/complete/dwell/guide/mark) + the firewall ratchet. Read-only w.r.t. the map.                                                                                     | low  | stop emitting                         |
| **CC-8**        | Cutover: `Highlight/Annotation` drop `blockId` + FK; `Resonance` string key retired in favor of `conceptId`. Remove dual-read.                                                                   | med  | restore from CC-4 window              |
| **CC-9**        | Cleanup: retire `Book`/`Chapter`/`ChapterBlock` reads, remove `CHAPTER_CONCEPTS` literals, delete deprecated Lector endpoints after their sunset.                                                | low  | —                                     |

Sequencing rule (learned from the incident sync work): **never** let a PR's tree
carry an add _and_ a drop of the same column; the dual-read window (CC-4 → CC-8)
is exactly so a drop is always preceded by a verified backfill.

---

## 9. The Anchor / tombstone contract (entity #9, in full)

A **user anchor** is any mark a person makes on content: `Highlight`,
`Annotation`, and (concept-level) `Resonance`. The contract:

1. **Anchors reference identity, never a content row.** Storage key is
   `(editionKey, unitKey, blockKey [, offsets, quote])`. There is no FK to
   `Block.id`, so no content write can cascade-delete a mark.
2. **Resolution is against the current published revision.** At read time the
   resolver looks up `blockKey` in the live revision:
   - found, offsets valid against `quote` ⇒ `status: "attached"`.
   - found, text changed so offsets drifted ⇒ re-locate `quote`; `status: "shifted"`.
   - **not found** ⇒ `status: "tombstoned"`.
3. **Tombstone, never delete.** When ingest removes a block that has anchors, it
   writes a _tombstone block_ (same `blockKey`, empty content, `meta.tombstoned =
true`) into the new revision so the anchor still resolves. The UI shows a
   tombstoned highlight as "from an earlier version of this chapter" with its
   preserved `quote`, and offers to dismiss — an explicit user action, never an
   automatic purge.
4. **Only the user removes their mark.** Deleting a highlight/annotation is a user
   action (`DELETE /api/…`). Editorial changes can _tombstone_ but can **never**
   delete a user's mark.
5. **Quote is the durable fallback.** `quote` (exact selected text at creation) is
   stored so a mark can be re-located even if offsets and neighbors move; it is
   also what we render for a tombstoned mark whose block is gone.

Privacy note: `Annotation.quote`/`Highlight.quote` are excerpts of **public,
licensed book content**, not Diario/Eco plaintext — storing them is consistent
with ADR 0007 (the E2E firewall is around the user's _own_ writing, which lives in
`DiaryEntry` ciphertext and never here).

---

## 10. The invariant — learning never moves the Emotional Map

> **`LearningEvent`, reading, progress, and `GuideSession` never modify any axis
> of the Emotional Map.**

This is the same principle the V2 program enforced (engagement removed from axes;
map fed only by self-report + confirmed resonances). Content Core keeps it
**structural**, not aspirational:

- **No shared write path.** Content Core / Learning modules do not import
  `EmotionalMapService` write methods, `EmotionalMapSnapshot`, or the map cache
  key. The only thing that already crosses into the map is **`Resonance`**, and
  that is by _explicit user confirmation_ (the ARC cycle), not by reading or
  completing anything — unchanged by this design.
- **Executable ratchet.** A spec (§F "Firewall") fails the build if a Content
  Core / Learning file references map scoring inputs, and a behavioral test
  asserts the map is byte-identical after a full sweep of `LearningEvent`s.
- **Guide V1 inherits it.** The per-concept Guide (built _after_ this design)
  emits `GUIDE_SESSION_*` learning events and may _read_ the map to adapt tone
  (like Eco suggestions do, read-only), but writes nothing back to it.

Learning tells us **what a person did with the content**. The map reflects **what
a person told us about how they feel**. Those two stay in different tables, behind
different modules, joined only by the person — never by a score.

---

## 11. What this design explicitly does NOT do

- It does not touch the Emotional Map, `CACHE_EPOCH`/`FACTS_EPOCH`, OU, or
  authRevision.
- It does not implement anything — CC-1..CC-9 are separate future PRs.
- It does not change `ContentChunk`/RAG, Eco, Diario crypto, or billing.
- It does not build Guide V1. Guide V1 is the _next_ design, and depends on
  `Concept` + `LearningEvent` existing (CC-2/CC-7).

## 12. Open questions for review

1. **Work vs. Edition granularity for v1.** We have one work, one edition. Do we
   model `Work` now (cleaner Author B2B later) or collapse `Work`+`Edition` until
   a second edition exists? (Proposed: model both now; the tables are cheap and
   the backfill is one-time.)
2. **Fuzzy-quote matcher.** Threshold + algorithm for `findMatch` on edited blocks
   (proposed: normalized-Levenshtein ≥ 0.8 over `quote`, fall back to `contentHash`
   exact). Tune against the Parte I re-ingest.
3. **Tombstone GC.** Do tombstone blocks accumulate across many revisions?
   (Proposed: a tombstone is dropped once _no_ user anchors reference its
   `blockKey` — checked at ingest.)
4. **Resonance concept identity.** Keep `(bookSlug, chapterOrder)` provenance on
   `Resonance` for display, or resolve everything through `ConceptLink`? (Proposed:
   keep provenance columns, add `conceptId` as the integrity anchor.)
