import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { GuidePin } from "@psico/types";

import { GuideTargetContextService } from "./guide-target-context.service";

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
 * keys. `editionKey` is stable but names the BOOK. There is no portable chapter
 * identity to put in a package, so the authority is resolved per environment —
 * which means server-side.
 *
 * ── What this service is, and deliberately is not ───────────────────────────
 *
 * It is a comparator. It does four things:
 *
 *   1. resolves the unit the reader is on, the way the CONTENT was resolved;
 *   2. asks `GuideTargetContextService.resolveMany` where each pin lives;
 *   3. compares the two internal `contentUnitId`s;
 *   4. returns a closed verdict bound to the exact pin it was asked about.
 *
 * It owns no rule about targets and issues no catalog SQL. An earlier version
 * did — it carried its own batch — and that copy silently dropped the recall
 * item's internal concept binding, so a pin whose own catalog contradicts
 * itself would have read as applicable while `resolve` refused it. One
 * authority, or the fast answer and the correct answer eventually differ.
 *
 * Neither `contentUnitId` ever crosses the wire, in either direction.
 */

/** The closed verdict the client receives. Nothing internal leaks through it. */
export type GuideApplicabilityVerdict = "APPLIES" | "UNAVAILABLE";

/**
 * Where the reader is, as the client can honestly describe it.
 *
 * `unitKey` is an ENVIRONMENT-LOCAL locator, never a canonical identity and
 * never proof of anything: the server looks the unit up by it inside the
 * published revision and then requires the navigation the client claims to be
 * where that unit actually sits. A mixed context — one chapter's book and
 * order with another chapter's key — describes no real place and is refused.
 */
export interface ReaderUnitContext {
  bookSlug: string;
  chapterOrder: number;
  unitKey: string;
}

export const GUIDE_APPLICABILITY_STALE = "GUIDE_READER_CONTEXT_STALE";

/**
 * The reader's context could not be confirmed.
 *
 * Deliberately an ERROR and not a verdict: "I cannot tell where you are" is not
 * the same fact as "this guide is not for here", and collapsing them would show
 * a chapter's worth of cards as inapplicable because a render went stale.
 */
export class GuideReaderContextStaleError extends Error {
  readonly code = GUIDE_APPLICABILITY_STALE;
  constructor() {
    // The message IS the code: a refusal carries no ids and no editorial text.
    super(GUIDE_APPLICABILITY_STALE);
    this.name = "GuideReaderContextStaleError";
  }
}

type Db = Prisma.TransactionClient;

@Injectable()
export class GuideReaderApplicabilityService {
  constructor(private readonly targetContext: GuideTargetContextService) {}

  /**
   * The reader's own unit, resolved the way the CONTENT was resolved.
   *
   * `ContentUnitRead` is served by selecting the unit BY KEY inside the
   * edition's published revision — `content-read.ts` refuses to select by
   * order. This resolves the same way, so applicability is decided about the
   * very unit whose text is on screen rather than about a second, parallel
   * notion of "the current chapter".
   *
   * `chapterOrder` stays what it is everywhere else: routing and presentation.
   * It is cross-checked here so a mixed context cannot pass, never consulted to
   * choose the unit.
   */
  private async resolveReaderUnit(
    db: Db,
    reader: ReaderUnitContext,
  ): Promise<string> {
    const rows = await db.$queryRaw<Array<{ id: string; order: number }>>`
      SELECT u."id", ru."order"
        FROM "ContentUnit" u
        JOIN "Edition" e ON e."id" = u."editionId"
        JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
       WHERE ru."revisionId" = e."publishedRevisionId"
         AND e."slug" = ${reader.bookSlug}
         AND u."unitKey" = ${reader.unitKey}`;
    const unit = rows[0];
    // Not in this book's published revision, or ambiguous.
    if (!unit || rows.length !== 1) throw new GuideReaderContextStaleError();
    // The navigation the client claims must be where that unit actually sits.
    if (unit.order !== reader.chapterOrder) {
      throw new GuideReaderContextStaleError();
    }
    return unit.id;
  }

  /**
   * The unit at a navigation position, from the PUBLISHED manifest.
   *
   * For surfaces whose request is itself a position — discovery is a
   * `GET /:bookSlug/:chapterOrder` — and which therefore carry no staleness
   * token to check. Same source as `content-read.ts`: `RevisionUnit` on the
   * edition's published revision, never the legacy `Chapter` table.
   *
   * `null` when the position names no published unit. That is an editorial
   * answer, not an error: there is simply nothing there.
   */
  async resolveUnitByNavigation(
    db: Db,
    where: { bookSlug: string; chapterOrder: number },
  ): Promise<string | null> {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT u."id"
        FROM "ContentUnit" u
        JOIN "Edition" e ON e."id" = u."editionId"
        JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
       WHERE ru."revisionId" = e."publishedRevisionId"
         AND e."slug" = ${where.bookSlug}
         AND ru."order" = ${where.chapterOrder}`;
    // More than one unit at one position is a manifest contradiction; the
    // manifest's own uniqueness makes it unreachable, and guessing would be
    // the wrong response if it ever were.
    if (rows.length !== 1) return null;
    return (rows[0] as { id: string }).id;
  }

  /**
   * The verdicts, positionally aligned with `pins`.
   *
   * Duplicates are answered in place, so a caller can zip the answer to its
   * question without matching on content.
   */
  async verdicts(
    db: Db,
    reader: ReaderUnitContext,
    pins: readonly GuidePin[],
  ): Promise<GuideApplicabilityVerdict[]> {
    if (pins.length === 0) return [];
    const readerUnitId = await this.resolveReaderUnit(db, reader);
    // The ONE authority. Nothing here re-derives what a pin targets, so there
    // is nothing that can drift from what `resolve` would say about it.
    const results = await this.targetContext.resolveMany(pins, db);
    return results.map((r) =>
      r.ok && r.context.unitId === readerUnitId ? "APPLIES" : "UNAVAILABLE",
    );
  }
}
