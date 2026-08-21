import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { GuideDefinition, GuidePin } from "@psico/types";

import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { productionGuideRegistry } from "./guide-catalog";

/**
 * C.3R (#639) — does this guide belong to the chapter the reader is on?
 *
 * ── Why the server has to answer it ─────────────────────────────────────────
 *
 * Until now the browser answered, by comparing the anchor's
 * `(bookSlug, chapterOrder)` with the chapter on screen. That is placement, not
 * identity: after an editorial reorder the guide followed the NUMBER, so it
 * appeared on whichever unit inherited it and vanished from the unit it is
 * actually about.
 *
 * The obvious fix — ship a stable unit identity inside the anchor — was
 * measured and ruled out. `ContentUnit.unitKey` is `uuidv5(Chapter.id)` over a
 * random cuid, so two ingestions of the SAME canonical book produce different
 * keys (`guide-reader-applicability.pg-spec.ts` proves it with two databases).
 * `editionKey` is stable but names the BOOK. There is no portable chapter
 * identity to put in a package, so the authority has to be resolved per
 * environment — which means server-side.
 *
 * ── The decision ────────────────────────────────────────────────────────────
 *
 *   currentReaderContentUnitId === guideTargetContentUnitId
 *
 * Both resolved HERE, from the database, inside the caller's transaction. The
 * client never sends either one and never receives either one; it receives a
 * closed verdict bound to the exact pin it asked about.
 *
 * Navigation is not identity: `(bookSlug, chapterOrder)` is how we LOCATE the
 * unit the reader is visiting, exactly as the reader's own URL does. It is
 * never compared against anything a guide carries.
 *
 * ── Why the resolution is batched, and how it stays honest ──────────────────
 *
 * `GuideTargetContextService.resolve` is the authority for one definition, and
 * it costs several queries per guide — fine for a session start, O(N) for a
 * chapter's worth of cards. This service resolves the same fact for up to 25
 * pins in a FIXED number of queries by collecting every target key first.
 *
 * Two implementations of one rule is how they drift, so `equivalence` is not
 * assumed: a pg-spec asserts, for EVERY pin in the production registry, that
 * this batch answer equals `GuideTargetContextService.resolve(...).unitId`.
 * That is a complete argument rather than a sample, because the only pins this
 * service ever evaluates are the ones `getExact` will return — anything else is
 * inert before a query runs.
 */

/** The closed verdict the client receives. Nothing internal leaks through it. */
export type GuideApplicabilityVerdict = "APPLIES" | "UNAVAILABLE";

/**
 * Where the reader is, as the client can honestly describe it.
 *
 * `unitKey` is a STALENESS TOKEN, never an identity: the server resolves the
 * unit from the navigation pair and then requires the token to match what it
 * resolved. A token from a previous render — a chapter the user has navigated
 * away from, a response that raced a reorder — fails closed instead of being
 * adopted.
 */
export interface ReaderUnitContext {
  bookSlug: string;
  chapterOrder: number;
  unitKey: string;
}

export const GUIDE_APPLICABILITY_STALE = "GUIDE_READER_CONTEXT_STALE";

/** The reader's context could not be trusted. The batch fails, nothing is inert. */
export class GuideReaderContextStaleError extends Error {
  readonly code = GUIDE_APPLICABILITY_STALE;
  constructor() {
    // The message IS the code: a refusal carries no ids and no editorial text.
    super(GUIDE_APPLICABILITY_STALE);
    this.name = "GuideReaderContextStaleError";
  }
}

type Db = Prisma.TransactionClient;

const pinKey = (p: GuidePin): string => `${p.guideKey}@${p.guideVersion}`;

/** Every editorial target a definition names, by kind. `null` when it names none. */
function targetsOf(def: GuideDefinition): {
  conceptKeys: string[];
  exerciseKeys: string[];
  itemKeys: string[];
} {
  const conceptKeys: string[] = [];
  const exerciseKeys: string[] = [];
  const itemKeys: string[] = [];
  for (const step of def.steps) {
    switch (step.kind) {
      case "CONCEPT_EXPLORATION":
        conceptKeys.push(step.conceptKey);
        break;
      case "CATALOG_PRACTICE":
        exerciseKeys.push(step.exerciseKey);
        break;
      case "ACTIVE_RECALL":
        itemKeys.push(step.itemKey);
        break;
      // EXPLICIT_CONFIRMATION carries no editorial anchor, exactly as
      // `GuideTargetContextService` treats it.
      default:
        break;
    }
  }
  return { conceptKeys, exerciseKeys, itemKeys };
}

@Injectable()
export class GuideReaderApplicabilityService {
  /**
   * The reader's own unit, resolved from the published manifest.
   *
   * One query. Returns the internal `contentUnitId` — which never leaves this
   * process — and verifies the client's staleness token against it.
   */
  private async resolveReaderUnit(
    db: Db,
    reader: ReaderUnitContext,
  ): Promise<string> {
    const rows = await db.$queryRaw<Array<{ id: string; unitKey: string }>>`
      SELECT u."id", u."unitKey"
        FROM "ContentUnit" u
        JOIN "Edition" e ON e."id" = u."editionId"
        JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
       WHERE ru."revisionId" = e."publishedRevisionId"
         AND e."slug" = ${reader.bookSlug}
         AND ru."order" = ${reader.chapterOrder}`;
    const unit = rows[0];
    // No unit at that place, or the token names a different one: the client is
    // describing a chapter this server cannot confirm it is on.
    if (!unit || rows.length !== 1) throw new GuideReaderContextStaleError();
    if (unit.unitKey !== reader.unitKey)
      throw new GuideReaderContextStaleError();
    return unit.id;
  }

  /**
   * Every requested pin's target unit, in a fixed number of queries.
   *
   * A pin that cannot be resolved — unknown to the registry, targets missing,
   * targets disagreeing — is simply absent from the map. The caller reads that
   * as `UNAVAILABLE`: inert, not an error, because an editorial gap is not an
   * infrastructure fault.
   */
  async resolveTargetUnits(
    db: Db,
    pins: readonly GuidePin[],
  ): Promise<Map<string, string>> {
    const defs = new Map<string, GuideDefinition>();
    for (const pin of pins) {
      const key = pinKey(pin);
      if (defs.has(key)) continue;
      try {
        defs.set(
          key,
          productionGuideRegistry.getExact(pin.guideKey, pin.guideVersion),
        );
      } catch {
        // Unknown or retired pin: inert, and it costs no query.
      }
    }
    if (defs.size === 0) return new Map();

    const conceptKeys = new Set<string>();
    const exerciseIds = new Set<string>();
    for (const def of defs.values()) {
      const t = targetsOf(def);
      t.conceptKeys.forEach((k) => conceptKeys.add(k));
      t.exerciseKeys.forEach((k) => exerciseIds.add(k));
      t.itemKeys.forEach((k) => exerciseIds.add(k));
    }

    // ── query 1: concepts → owning unit id ──────────────────────────────────
    const conceptUnit = new Map<string, string>();
    if (conceptKeys.size > 0) {
      const rows = await db.concept.findMany({
        where: { conceptKey: { in: [...conceptKeys] } },
        select: {
          conceptKey: true,
          links: { where: { unitId: { not: null } }, select: { unitId: true } },
        },
      });
      for (const c of rows) {
        const ids = [...new Set(c.links.map((l) => l.unitId as string))];
        // Exactly one owning unit, never a "first match" — the same discipline
        // `resolveConcept` applies.
        if (ids.length === 1) conceptUnit.set(c.conceptKey, ids[0] as string);
      }
    }

    // ── query 2: exercises and recall items → legacy chapter → unit key ─────
    const exerciseUnitKey = new Map<string, string>();
    const itemUnitKey = new Map<string, string>();
    if (exerciseIds.size > 0) {
      const rows = await db.exercise.findMany({
        where: { id: { in: [...exerciseIds] } },
        select: { id: true, type: true, chapterId: true },
      });
      for (const e of rows) {
        const key = unitKeyFromLegacyChapterId(e.chapterId);
        // A QUIZ is a recall item, never a completable practice — and the
        // reverse. Mapping them apart is what stops a step resolving through
        // the wrong kind.
        if (e.type === "QUIZ") itemUnitKey.set(e.id, key);
        else exerciseUnitKey.set(e.id, key);
      }
    }

    // ── query 3: unit keys and unit ids → the real units ────────────────────
    const wantedKeys = new Set<string>([
      ...exerciseUnitKey.values(),
      ...itemUnitKey.values(),
    ]);
    const wantedIds = new Set<string>(conceptUnit.values());
    const units =
      wantedKeys.size + wantedIds.size === 0
        ? []
        : await db.contentUnit.findMany({
            where: {
              OR: [
                ...(wantedIds.size ? [{ id: { in: [...wantedIds] } }] : []),
                ...(wantedKeys.size
                  ? [{ unitKey: { in: [...wantedKeys] } }]
                  : []),
              ],
            },
            select: {
              id: true,
              unitKey: true,
              edition: { select: { publishedRevisionId: true } },
            },
          });
    const byKey = new Map<
      string,
      { id: string; revisionId: string | null }[]
    >();
    const byId = new Map<string, { id: string; revisionId: string | null }>();
    for (const u of units) {
      const entry = { id: u.id, revisionId: u.edition.publishedRevisionId };
      byId.set(u.id, entry);
      byKey.set(u.unitKey, [...(byKey.get(u.unitKey) ?? []), entry]);
    }

    // ── query 4: only units inside their edition's PUBLISHED manifest count ──
    const candidateIds = [...new Set(units.map((u) => u.id))];
    const published = new Set<string>();
    if (candidateIds.length > 0) {
      const rows = await db.$queryRaw<Array<{ unitId: string }>>`
        SELECT ru."unitId"
          FROM "RevisionUnit" ru
          JOIN "ContentUnit" u ON u."id" = ru."unitId"
          JOIN "Edition" e ON e."id" = u."editionId"
         WHERE ru."revisionId" = e."publishedRevisionId"
           AND ru."unitId" IN (${Prisma.join(candidateIds)})`;
      for (const r of rows) published.add(r.unitId);
    }

    /** One target → the published unit it belongs to, or null. */
    const unitForKey = (key: string): string | null => {
      const found = byKey.get(key) ?? [];
      // The same unitKey in more than one edition is ambiguous, never guessed.
      if (found.length !== 1) return null;
      const id = (found[0] as { id: string }).id;
      return published.has(id) ? id : null;
    };
    const unitForId = (id: string): string | null => {
      if (!byId.has(id)) return null;
      return published.has(id) ? id : null;
    };

    const out = new Map<string, string>();
    for (const [key, def] of defs) {
      const t = targetsOf(def);
      const resolved: (string | null)[] = [
        ...t.conceptKeys.map((k) => {
          const id = conceptUnit.get(k);
          return id === undefined ? null : unitForId(id);
        }),
        ...t.exerciseKeys.map((k) => {
          const uk = exerciseUnitKey.get(k);
          return uk === undefined ? null : unitForKey(uk);
        }),
        ...t.itemKeys.map((k) => {
          const uk = itemUnitKey.get(k);
          return uk === undefined ? null : unitForKey(uk);
        }),
      ];
      // A definition with no editorial target at all has no derivable context.
      if (resolved.length === 0) continue;
      // Any unresolved target, or any disagreement, and the pin is inert —
      // the same two failure modes `GuideTargetContextService` refuses on.
      if (resolved.some((r) => r === null)) continue;
      const distinct = new Set(resolved as string[]);
      if (distinct.size !== 1) continue;
      out.set(key, [...distinct][0] as string);
    }
    return out;
  }

  /**
   * The verdicts, positionally aligned with `pins`.
   *
   * Duplicates are answered once and repeated, so the caller can zip the answer
   * to its question without matching on content.
   */
  async verdicts(
    db: Db,
    reader: ReaderUnitContext,
    pins: readonly GuidePin[],
  ): Promise<GuideApplicabilityVerdict[]> {
    if (pins.length === 0) return [];
    const readerUnitId = await this.resolveReaderUnit(db, reader);
    const targets = await this.resolveTargetUnits(db, pins);
    return pins.map((p) =>
      targets.get(pinKey(p)) === readerUnitId ? "APPLIES" : "UNAVAILABLE",
    );
  }
}
