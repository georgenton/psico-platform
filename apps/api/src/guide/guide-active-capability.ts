import type { Prisma } from "@prisma/client";

/**
 * C.0A — which ACTIVE-session invariant the DATABASE is currently enforcing,
 * and the lock keys that make a rolling deploy safe while that answer changes.
 *
 * ADR 0022 replaced "one ACTIVE session per user" with "one ACTIVE session per
 * `(userId, guideKey)`". That transition cannot be a single release: for a
 * while the old index, the new index, the old binary and the new binary all
 * exist at once. This module is what lets ONE binary behave correctly in every
 * one of those states.
 *
 * The authority is READ FROM THE SCHEMA, never from configuration. A flag can
 * be set to a value the database disagrees with; the partial unique index IS
 * the enforcement, so asking the catalog is asking the thing that actually
 * decides. That is also why nothing here is cached across transactions — a
 * cached answer is precisely a flag, re-invented.
 *
 * Privacy: nothing here logs, and no pg message, index name, SQL text or
 * predicate ever leaves. Callers get a closed value.
 */

/** The lock protocol this binary speaks. Surfaced at boot (see `main.ts`) so a
 * fleet can be PROVEN to be drained rather than inferred from a commit SHA. */
export const GUIDE_START_LOCK_PROTOCOL = "dual-v1" as const;

/**
 * The compatibility lock, shared with the pre-C.0A binary.
 *
 * Byte-for-byte the key V0 derives. Two versions only serialize against each
 * other if they hash the SAME string, so this is not a detail to tidy up: it
 * is the entire reason a mixed fleet is safe.
 */
export const globalStartLockKey = (userId: string): string =>
  `guide:start:${userId}`;

/**
 * The lineage lock, shared with the future C.0B3 binary.
 *
 * C.0A takes it even though it still obeys the global invariant, so that when
 * V2 ships — taking ONLY this one — the two versions already share a lock for
 * the same lineage. Canonical here so V2 cannot derive it differently.
 */
export const lineageStartLockKey = (userId: string, guideKey: string): string =>
  `guide:start:${userId}:${guideKey}`;

export type GuideActiveCapabilityHealth =
  | "HEALTHY"
  | "ABSENT"
  | "INVALID_OR_NOT_READY"
  | "MALFORMED";

export interface GuideActiveCapability {
  /** Which invariant to obey. `FAIL_CLOSED` means: write nothing. */
  effectiveMode: "GLOBAL" | "LINEAGE" | "FAIL_CLOSED";
  globalHealth: GuideActiveCapabilityHealth;
  lineageHealth: GuideActiveCapabilityHealth;
  /**
   * Something is off but service continues — an unhealthy non-authoritative
   * index, or a structural duplicate. Authority and health are separate on
   * purpose: a half-built lineage index must NOT take down START while the
   * global index is still enforcing the stricter rule.
   */
  degraded: boolean;
}

/** The approved key columns. `guideVersion` is deliberately absent: including
 * it would make `X@v1` and `X@v2` simultaneously ACTIVE, which ADR 0022 §2
 * forbids. A triple index therefore is not this capability at all. */
const GLOBAL_KEYS = ["userId"] as const;
const LINEAGE_KEYS = ["userId", "guideKey"] as const;

/**
 * The two renderings `pg_get_expr` can produce for the SAME predicate.
 *
 * Postgres qualifies a type name only when it is not reachable through the
 * session's `search_path`, so the enum comes back bare when `public` is on the
 * path and schema-qualified when it is not. Both describe one index; accepting
 * exactly these two is what makes the check independent of an ambient setting
 * without loosening it into a permissive pattern.
 */
const ACCEPTED_PREDICATES: readonly string[] = [
  `status = 'ACTIVE'::"GuideSessionStatus"`,
  `status = 'ACTIVE'::public."GuideSessionStatus"`,
];

/** Strip ONE balanced outer paren pair; nothing else is normalized. */
function normalizePredicate(raw: string | null): string {
  const s = (raw ?? "").trim();
  return s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1).trim() : s;
}

interface IndexRow {
  indisunique: boolean;
  indisvalid: boolean;
  indisready: boolean;
  indislive: boolean;
  indnatts: number;
  indnkeyatts: number;
  has_expressions: boolean;
  amname: string | null;
  cols: string[] | null;
  keys_not_null: boolean | null;
  predicate: string | null;
}

/**
 * Partial indexes on `GuideSession`, described structurally.
 *
 * The table is resolved by explicit OID rather than by name against
 * `current_schema()`: a changed `search_path` would otherwise silently point
 * the whole check at a different table.
 */
const CAPABILITY_SQL = `
SELECT
  i.indisunique, i.indisvalid, i.indisready, i.indislive,
  i.indnatts, i.indnkeyatts,
  (i.indexprs IS NOT NULL) AS has_expressions,
  am.amname,
  (SELECT array_agg(a.attname::text ORDER BY k.ord)
     FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS cols,
  (SELECT bool_and(a.attnotnull)
     FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS keys_not_null,
  pg_get_expr(i.indpred, i.indrelid) AS predicate
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_am am ON am.oid = ic.relam
WHERE i.indrelid = 'public."GuideSession"'::regclass
  AND i.indpred IS NOT NULL`;

type Shape = "GLOBAL" | "LINEAGE" | "NOT_OURS";

/**
 * Which approved shape a row is, ignoring health.
 *
 * Everything that is not EXACTLY one of the two approved shapes is `NOT_OURS`
 * — including the by-version triple, an index carrying INCLUDE columns, and an
 * index whose name looks right but whose columns do not. Nothing here reads a
 * name.
 */
function classifyShape(row: IndexRow): Shape {
  if (!row.indisunique) return "NOT_OURS";
  if (row.has_expressions) return "NOT_OURS";
  if (row.amname !== "btree") return "NOT_OURS";
  // INCLUDE columns make `indnatts` exceed the key count. The invariant needs
  // none, so a variant carrying them is not the approved shape.
  if (row.indnatts !== row.indnkeyatts) return "NOT_OURS";
  if (row.keys_not_null !== true) return "NOT_OURS";
  if (!ACCEPTED_PREDICATES.includes(normalizePredicate(row.predicate))) {
    return "NOT_OURS";
  }
  const cols = row.cols ?? [];
  if (cols.length !== row.indnkeyatts) return "NOT_OURS";
  const same = (want: readonly string[]) =>
    cols.length === want.length && want.every((c, i) => cols[i] === c);
  if (same(GLOBAL_KEYS)) return "GLOBAL";
  if (same(LINEAGE_KEYS)) return "LINEAGE";
  return "NOT_OURS";
}

const healthy = (row: IndexRow) =>
  row.indisvalid && row.indisready && row.indislive;

/**
 * Read the capability. Runs INSIDE the caller's transaction, every time.
 *
 * A storage failure is not swallowed into a permissive default: an unreadable
 * catalog is exactly the case where we do not know which invariant holds, and
 * guessing would let a global-mode autocancel run in a lineage world.
 */
export async function readGuideActiveCapability(
  tx: Prisma.TransactionClient,
): Promise<GuideActiveCapability> {
  const rows = (await tx.$queryRawUnsafe(CAPABILITY_SQL)) as IndexRow[];

  let globalHealth: GuideActiveCapabilityHealth = "ABSENT";
  let lineageHealth: GuideActiveCapabilityHealth = "ABSENT";
  let globalSeen = 0;
  let lineageSeen = 0;
  // A shape we do not recognise is only worth reporting when it looks like an
  // attempt at ours — a partial unique index on this table that we refuse.
  let malformedNearMiss = false;

  for (const row of rows) {
    const shape = classifyShape(row);
    if (shape === "NOT_OURS") {
      if (row.indisunique) malformedNearMiss = true;
      continue;
    }
    const ok = healthy(row);
    if (shape === "GLOBAL") {
      globalSeen += 1;
      if (ok) globalHealth = "HEALTHY";
      else if (globalHealth !== "HEALTHY")
        globalHealth = "INVALID_OR_NOT_READY";
    } else {
      lineageSeen += 1;
      if (ok) lineageHealth = "HEALTHY";
      else if (lineageHealth !== "HEALTHY") {
        lineageHealth = "INVALID_OR_NOT_READY";
      }
    }
  }

  if (malformedNearMiss) {
    if (globalHealth === "ABSENT") globalHealth = "MALFORMED";
    if (lineageHealth === "ABSENT") lineageHealth = "MALFORMED";
  }

  // The stricter invariant wins whenever it is actually being enforced: while
  // the global index exists it is impossible for a second lineage to be ACTIVE
  // anyway, so obeying it is both correct and the conservative choice.
  const effectiveMode =
    globalHealth === "HEALTHY"
      ? "GLOBAL"
      : lineageHealth === "HEALTHY"
        ? "LINEAGE"
        : "FAIL_CLOSED";

  const degraded =
    effectiveMode !== "FAIL_CLOSED" &&
    (globalHealth === "INVALID_OR_NOT_READY" ||
      lineageHealth === "INVALID_OR_NOT_READY" ||
      malformedNearMiss ||
      globalSeen > 1 ||
      lineageSeen > 1);

  return { effectiveMode, globalHealth, lineageHealth, degraded };
}
