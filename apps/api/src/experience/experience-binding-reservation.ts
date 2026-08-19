import type { Prisma } from "@prisma/client";

import { validateExperienceDefinition } from "./experience-catalog";

/**
 * C.3A (#639) — reserving a guide lineage for an experience lineage, and the
 * three sources of truth that must agree while a bridge is running.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * Inside one stable chapter the binding is a partial bijection:
 *
 *   an experienceKey owns at most one guideKey    (reservation primary key)
 *   a guideKey belongs to at most one experienceKey   (reservation unique)
 *
 * Versions of the same experienceKey SHARE the reservation. That is the whole
 * point of the versioning model: publishing v2 re-reserves nothing, and
 * archiving v1 releases nothing v2 still needs.
 *
 * ── Why an authority mode instead of a boolean ──────────────────────────────
 *
 * During the bridge, three descriptions of the same fact coexist: the
 * `guidePin` inside `definitionJson` (the only one the previous binary writes),
 * the promoted columns, and the reservation table. A row written by the old
 * binary has the first and neither of the others. A row written by this one has
 * all three. Asking "is the table there?" would not distinguish those, so the
 * mode is read from the SCHEMA — the same way `readGuideActiveCapability` reads
 * `pg_index` rather than trusting a name — and it is read inside the
 * transaction, with no environment variable and nothing cached between
 * transactions.
 *
 * `BRIDGE` is deliberately not called DUAL: it does not require the two worlds
 * to agree everywhere, because before the backfill they cannot. It requires
 * that a row which HAS columns agrees with its reservation and with its JSON,
 * and it reads legacy rows by scanning. A row that half-agrees is not a
 * degraded read — it is a contradiction, and contradictions fail closed.
 */

export type ReservationAuthority =
  | "LEGACY_SCAN"
  | "BRIDGE"
  | "STRUCTURAL"
  | "FAIL_CLOSED";

export const EXPERIENCE_BINDING_CODES = {
  /** Another lineage already owns this guide in this chapter. */
  guideReserved: "EXPERIENCE_GUIDE_BINDING_RESERVED",
  /** This lineage already owns a different guide in this chapter. */
  lineageBound: "EXPERIENCE_LINEAGE_ALREADY_BOUND",
  /** Row, columns and reservation disagree. Nothing is written. */
  divergent: "EXPERIENCE_BINDING_DIVERGENT",
  /** The schema is in a shape this binary will not write against. */
  authorityUnavailable: "EXPERIENCE_BINDING_AUTHORITY_UNAVAILABLE",
} as const;

export class ExperienceBindingError extends Error {
  constructor(readonly code: string) {
    // Message IS the code: an editorial refusal carries no keys and no ids.
    super(code);
    this.name = "ExperienceBindingError";
  }
}

interface CapabilityRow {
  has_table: boolean;
  has_reservation_fk: boolean;
  has_guide_unique: boolean;
  has_final_check: boolean;
  final_check_validated: boolean;
}

/**
 * Which authority this schema supports, decided from its structure.
 *
 * Read inside the caller's transaction. Nothing is memoised: a cached answer
 * would survive the migration that changed it, and the one moment this must be
 * right is exactly the moment it changes.
 */
export async function readReservationAuthority(
  tx: Prisma.TransactionClient,
): Promise<ReservationAuthority> {
  const rows = await tx.$queryRaw<CapabilityRow[]>`
SELECT
  to_regclass('public."ExperienceGuideReservation"') IS NOT NULL AS has_table,
  EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = to_regclass('public."ChapterExperienceVersion"')
       AND c.contype = 'f'
       AND c.confrelid = to_regclass('public."ExperienceGuideReservation"')
       AND array_length(c.conkey, 1) = 3
  ) AS has_reservation_fk,
  EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indrelid = to_regclass('public."ExperienceGuideReservation"')
       AND i.indisunique AND i.indisvalid AND i.indisready
       AND i.indnkeyatts = 2
       AND (SELECT array_agg(a.attname::text ORDER BY k.ord)
              FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a
                ON a.attrelid = i.indrelid AND a.attnum = k.attnum)
           = ARRAY['contentUnitId','guideKey']
  ) AS has_guide_unique,
  EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = to_regclass('public."ChapterExperienceVersion"')
       AND c.contype = 'c'
       AND c.conname = 'ChapterExperienceVersion_binding_shape_check'
  ) AS has_final_check,
  COALESCE((
    SELECT c.convalidated FROM pg_constraint c
     WHERE c.conrelid = to_regclass('public."ChapterExperienceVersion"')
       AND c.contype = 'c'
       AND c.conname = 'ChapterExperienceVersion_binding_shape_check'
  ), false) AS final_check_validated`;

  const cap = rows[0];
  if (!cap) return "FAIL_CLOSED";
  if (!cap.has_table) {
    // No table anywhere. A CHECK without its table is not a partial rollout,
    // it is a shape nobody designed.
    return cap.has_final_check ? "FAIL_CLOSED" : "LEGACY_SCAN";
  }
  // The table alone is not enough: without the composite FK a row could name a
  // reservation that does not exist, and without the unique two lineages could
  // hold the same guide.
  if (!cap.has_reservation_fk || !cap.has_guide_unique) return "FAIL_CLOSED";
  if (!cap.has_final_check) return "BRIDGE";
  return cap.final_check_validated ? "STRUCTURAL" : "FAIL_CLOSED";
}

/** A row as the binding logic needs to see it. */
export interface BindingRow {
  id: string;
  experienceKey: string;
  experienceVersion: number;
  status: string;
  contentUnitId: string | null;
  guideKey: string | null;
  definitionJson: unknown;
}

/** The states in which a row holds its chapter's guide. */
export const RESERVING_STATUSES = ["DRAFT", "PUBLISHED"] as const;

export function isReserving(status: string): boolean {
  return (RESERVING_STATUSES as readonly string[]).includes(status);
}

/**
 * The guide lineage a stored row claims, read from its definition.
 *
 * The JSON is validated rather than indexed into: `definitionJson` is the only
 * description the previous binary wrote, so trusting a raw path would let a
 * malformed row decide a reservation. A row that does not validate has no claim
 * and stops whatever is reading it.
 */
export function guideKeyFromDefinition(json: unknown): string | null {
  try {
    return validateExperienceDefinition(json).guidePin.guideKey;
  } catch {
    return null;
  }
}

/**
 * Who owns what in this chapter, seen through BOTH worlds at once.
 *
 * The scan is what makes the bridge honest: before the backfill, most rows have
 * no columns and no reservation, and their only claim lives in JSON. Ignoring
 * them would let a new draft take a guide an existing published experience is
 * already using.
 */
export interface ChapterBindingView {
  /** experienceKey → guideKey, from materialised reservations. */
  reserved: Map<string, string>;
  /** guideKey → experienceKey, from materialised reservations. */
  reservedBy: Map<string, string>;
  /** experienceKey → guideKey, from legacy rows with no reservation yet. */
  scanned: Map<string, string>;
  /** guideKey → experienceKey, from those same legacy rows. */
  scannedBy: Map<string, string>;
}

type BindingDb = Pick<
  Prisma.TransactionClient,
  "chapterExperienceVersion" | "experienceGuideReservation"
>;

/**
 * Read the chapter's bindings under the lock the caller already holds.
 *
 * Legacy rows are matched by `(bookSlug, chapterOrder)` because that is the only
 * locator they carry; rows this binary wrote are matched by `contentUnitId`,
 * which is identity. Both sets are needed, and mixing them is the point: during
 * the bridge a chapter is described partly by each.
 */
export async function readChapterBindings(
  db: BindingDb,
  where: {
    contentUnitId: string;
    bookSlug: string;
    chapterOrder: number;
    /**
     * Definitions this build SHIPS for the chapter.
     *
     * They have no row and no reservation, and they still hold their guide:
     * the hybrid repository serves them to readers today. Leaving them out
     * would let a new draft take a guide a published, code-owned experience is
     * already using — the collision would appear only after a deploy replaced
     * the catalog, which is the worst possible moment to find it.
     *
     * They are never materialised into reservations: a reservation row nothing
     * references could never be released, because the foreign key that makes
     * release safe is the one that would block it forever.
     */
    codeOwned?: readonly { experienceKey: string; guideKey: string }[];
  },
): Promise<ChapterBindingView> {
  const [reservations, rows] = await Promise.all([
    db.experienceGuideReservation.findMany({
      where: { contentUnitId: where.contentUnitId },
      select: { experienceKey: true, guideKey: true },
    }),
    db.chapterExperienceVersion.findMany({
      where: {
        status: { in: [...RESERVING_STATUSES] },
        OR: [
          { contentUnitId: where.contentUnitId },
          { bookSlug: where.bookSlug, chapterOrder: where.chapterOrder },
        ],
      },
      select: {
        id: true,
        experienceKey: true,
        experienceVersion: true,
        status: true,
        contentUnitId: true,
        guideKey: true,
        definitionJson: true,
      },
    }),
  ]);

  const view: ChapterBindingView = {
    reserved: new Map(),
    reservedBy: new Map(),
    scanned: new Map(),
    scannedBy: new Map(),
  };
  for (const r of reservations) {
    view.reserved.set(r.experienceKey, r.guideKey);
    view.reservedBy.set(r.guideKey, r.experienceKey);
  }

  // Code-owned claims are read exactly like legacy rows: a claim with no
  // reservation behind it.
  for (const shipped of where.codeOwned ?? []) {
    const previous = view.scanned.get(shipped.experienceKey);
    if (previous !== undefined && previous !== shipped.guideKey) {
      throw new ExperienceBindingError(EXPERIENCE_BINDING_CODES.divergent);
    }
    view.scanned.set(shipped.experienceKey, shipped.guideKey);
    const owner = view.scannedBy.get(shipped.guideKey);
    if (owner !== undefined && owner !== shipped.experienceKey) {
      throw new ExperienceBindingError(EXPERIENCE_BINDING_CODES.divergent);
    }
    view.scannedBy.set(shipped.guideKey, shipped.experienceKey);
  }

  for (const row of rows) {
    const claimed = guideKeyFromDefinition(row.definitionJson);
    if (claimed === null) {
      // A stored row whose definition no longer validates cannot be reasoned
      // about. Refusing is the only honest answer: guessing its lineage is how
      // a reservation ends up naming the wrong owner.
      throw new ExperienceBindingError(EXPERIENCE_BINDING_CODES.divergent);
    }

    if (row.contentUnitId !== null || row.guideKey !== null) {
      // A materialised row must agree with itself, with its reservation and
      // with its JSON — completely. Half-materialised is a contradiction.
      const owner = view.reserved.get(row.experienceKey);
      const agrees =
        row.contentUnitId === where.contentUnitId &&
        row.guideKey === claimed &&
        owner === claimed;
      if (!agrees) {
        throw new ExperienceBindingError(EXPERIENCE_BINDING_CODES.divergent);
      }
      continue;
    }

    // A legacy row: its claim exists only in JSON.
    const previous = view.scanned.get(row.experienceKey);
    if (previous !== undefined && previous !== claimed) {
      // The same lineage claiming two guides in one chapter predates this work
      // and cannot be resolved automatically (LEGACY_COLLISION_POLICY).
      throw new ExperienceBindingError(EXPERIENCE_BINDING_CODES.divergent);
    }
    view.scanned.set(row.experienceKey, claimed);
    const owner = view.scannedBy.get(claimed);
    if (owner !== undefined && owner !== row.experienceKey) {
      throw new ExperienceBindingError(EXPERIENCE_BINDING_CODES.divergent);
    }
    view.scannedBy.set(claimed, row.experienceKey);
  }

  return view;
}

/**
 * May `experienceKey` hold `guideKey` in this chapter — and if so, is the
 * reservation already there?
 *
 * Both halves of the bijection are checked against both worlds. A guide held by
 * another lineage is `RESERVED`; a lineage already holding another guide is
 * `LINEAGE_BOUND`. Neither is reported with the other party's key: an editor
 * needs to know the guide is taken, not by whom.
 */
export function assertBindingAvailable(
  view: ChapterBindingView,
  input: { experienceKey: string; guideKey: string },
): void {
  const guideOwner =
    view.reservedBy.get(input.guideKey) ?? view.scannedBy.get(input.guideKey);
  if (guideOwner !== undefined && guideOwner !== input.experienceKey) {
    throw new ExperienceBindingError(EXPERIENCE_BINDING_CODES.guideReserved);
  }
  const held =
    view.reserved.get(input.experienceKey) ??
    view.scanned.get(input.experienceKey);
  if (held !== undefined && held !== input.guideKey) {
    throw new ExperienceBindingError(EXPERIENCE_BINDING_CODES.lineageBound);
  }
}

/**
 * Materialise the reservation for a write this binary is making.
 *
 * Idempotent by identity, never by suppression: an existing row is a replay
 * only when owner, chapter and guide match exactly. A conflicting row is an
 * error, because `ON CONFLICT DO NOTHING` over a different owner would hide the
 * one thing this table exists to catch.
 */
export async function ensureReservation(
  db: BindingDb,
  input: { contentUnitId: string; experienceKey: string; guideKey: string },
): Promise<void> {
  const existing = await db.experienceGuideReservation.findUnique({
    where: {
      contentUnitId_experienceKey: {
        contentUnitId: input.contentUnitId,
        experienceKey: input.experienceKey,
      },
    },
    select: { guideKey: true },
  });
  if (existing) {
    if (existing.guideKey !== input.guideKey) {
      throw new ExperienceBindingError(EXPERIENCE_BINDING_CODES.lineageBound);
    }
    return;
  }
  await db.experienceGuideReservation.create({ data: input });
}
