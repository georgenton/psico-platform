import type { Prisma } from "@prisma/client";
import { CHAPTER_CONCEPTS } from "@psico/types";

/**
 * Content Core — closed materialization of `Concept` + `ConceptLink` from the
 * shared editorial catalog (`CHAPTER_CONCEPTS`).
 *
 * Extracted from `backfill.ts` so the SAME code can run in two places:
 *   - the CC-3 backfill, for a Book whose Content Core rows are being created;
 *   - the learning activation, for a Book that ALREADY exists in production
 *     (bootstrapped without any learning targets).
 *
 * Fail-closed contract — the extraction deliberately tightens two behaviours the
 * inline version had:
 *
 *   - a concept whose stored label differs from the catalog no longer gets a
 *     silent `update`. Changing what a concept MEANS is an editorial act; the
 *     key is persisted on `Resonance` rows, so rewriting its label under a live
 *     key would retro-relabel confirmations the user already made. Drift throws;
 *   - a catalogued chapter with no canonical unit no longer `continue`s. The
 *     catalog is an approved production definition: a missing unit is an
 *     inconsistency, not an optional row.
 *
 * A book ABSENT from the catalog contributes zero rows — the only allowed no-op.
 *
 * Reruns are no-ops: identity is the catalog key (`Concept.conceptKey`) and a
 * derived link id, never a CUID. Nothing is ever deleted.
 *
 * Errors are value-free (a stable `code`, message === code): no slug, label or
 * received value ever appears in a thrown/loggable error.
 */

export type ConceptIngestErrorCode =
  | "CONCEPT_INGEST_UNIT_MISSING"
  | "CONCEPT_INGEST_DRIFT_DETECTED"
  | "CONCEPT_INGEST_CATALOG_INVALID";

/** Value-free ingestion failure — carries a stable code and nothing else. */
export class ConceptIngestError extends Error {
  readonly code: ConceptIngestErrorCode;
  constructor(code: ConceptIngestErrorCode) {
    super(code); // message === code — no editorial value ever embedded
    this.name = "ConceptIngestError";
    this.code = code;
  }
}

/** The transaction-client slice this ingestion touches. Narrow on purpose: it
 * cannot reach Book, Chapter, ContentUnit or any user-owned table. */
export type ConceptIngestDb = Pick<
  Prisma.TransactionClient,
  "concept" | "conceptLink"
>;

export interface ConceptIngestStats {
  conceptsCreated: number;
  conceptsVerified: number;
  conceptLinksCreated: number;
  conceptLinksVerified: number;
}

/**
 * The link's identity is derived from the concept key, so a rerun finds the
 * same row instead of minting a second link for the same concept.
 *
 * Preserved verbatim from the inline backfill version — existing production
 * rows carry these ids and must keep round-tripping.
 */
export function conceptLinkId(conceptKey: string): string {
  return `cl-${conceptKey}`;
}

/**
 * Validate the WHOLE shared catalog before touching the database — a malformed
 * entry for ANY book is a catalog bug, and finding it while ingesting a
 * different book is better than finding it in production later.
 *
 * Checks: chapter orders are positive integers; keys and labels are non-empty;
 * and `conceptKey` is unique ACROSS books (the column is globally unique, so a
 * collision would otherwise surface as a confusing drift error on whichever
 * book happened to run second).
 */
export function assertConceptCatalogValid(
  catalog: typeof CHAPTER_CONCEPTS = CHAPTER_CONCEPTS,
): void {
  const seenKeys = new Set<string>();
  for (const bookConcepts of Object.values(catalog)) {
    for (const [orderStr, concept] of Object.entries(bookConcepts)) {
      const order = Number(orderStr);
      const ok =
        Number.isInteger(order) &&
        order > 0 &&
        typeof concept?.key === "string" &&
        concept.key.trim().length > 0 &&
        typeof concept.label === "string" &&
        concept.label.trim().length > 0 &&
        !seenKeys.has(concept.key);
      if (!ok) throw new ConceptIngestError("CONCEPT_INGEST_CATALOG_INVALID");
      seenKeys.add(concept.key);
    }
  }
}

/**
 * Materialize the catalog's `Concept` + `ConceptLink` rows for one Book, using
 * the units already resolved by the caller. `tx` is the caller's transaction, so
 * any failure rolls the whole operation back.
 *
 * `Concept.description` is NOT catalog-owned: the catalog declares a key and a
 * label, so a human-authored description is left untouched and does not count
 * as drift.
 */
export async function ingestBookConcepts(
  tx: ConceptIngestDb,
  bookSlug: string,
  unitIdByOrder: ReadonlyMap<number, string>,
): Promise<ConceptIngestStats> {
  assertConceptCatalogValid(); // pure, before any DB touch

  const stats: ConceptIngestStats = {
    conceptsCreated: 0,
    conceptsVerified: 0,
    conceptLinksCreated: 0,
    conceptLinksVerified: 0,
  };

  const bookConcepts = CHAPTER_CONCEPTS[bookSlug];
  if (!bookConcepts) return stats; // book not catalogued → the ONLY allowed no-op

  for (const [orderStr, concept] of Object.entries(bookConcepts)) {
    const unitId = unitIdByOrder.get(Number(orderStr));
    // An approved definition whose unit is absent is an inconsistency — fail
    // closed rather than quietly dropping a chapter's concept.
    if (!unitId) throw new ConceptIngestError("CONCEPT_INGEST_UNIT_MISSING");

    const existing = await tx.concept.findUnique({
      where: { conceptKey: concept.key },
      select: { id: true, label: true },
    });

    let conceptId: string;
    if (!existing) {
      const created = await tx.concept.create({
        data: { conceptKey: concept.key, label: concept.label },
        select: { id: true },
      });
      conceptId = created.id;
      stats.conceptsCreated += 1;
    } else {
      // Same key, different meaning → never a silent relabel.
      if (existing.label !== concept.label) {
        throw new ConceptIngestError("CONCEPT_INGEST_DRIFT_DETECTED");
      }
      conceptId = existing.id;
      stats.conceptsVerified += 1;
    }

    const linkId = conceptLinkId(concept.key);
    const existingLink = await tx.conceptLink.findUnique({
      where: { id: linkId },
      select: {
        conceptId: true,
        unitId: true,
        contentBlockId: true,
        role: true,
      },
    });
    if (!existingLink) {
      await tx.conceptLink.create({
        data: { id: linkId, conceptId, unitId, role: "PRIMARY" },
      });
      stats.conceptLinksCreated += 1;
    } else {
      const identical =
        existingLink.conceptId === conceptId &&
        existingLink.unitId === unitId &&
        existingLink.contentBlockId === null &&
        existingLink.role === "PRIMARY";
      if (!identical) {
        throw new ConceptIngestError("CONCEPT_INGEST_DRIFT_DETECTED");
      }
      stats.conceptLinksVerified += 1;
    }
  }

  return stats;
}
