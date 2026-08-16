import { describe, expect, it, vi } from "vitest";

import {
  GUIDE_START_LOCK_PROTOCOL,
  globalStartLockKey,
  lineageStartLockKey,
  readGuideActiveCapability,
} from "./guide-active-capability";

/**
 * C.0A — reading which ACTIVE invariant the database is enforcing.
 *
 * The shapes here are the ones `pg_index` actually returns; the behaviour
 * against a live server is proved in `guide-active-capability.pg-spec.ts`.
 * What this file pins is the classification itself, including the cases that
 * must NOT be accepted — because every one of them, accepted, would let a
 * global-mode autocancel close a journey in a lineage world.
 */

const PRED = `(status = 'ACTIVE'::"GuideSessionStatus")`;

const index = (over: Record<string, unknown> = {}) => ({
  indisunique: true,
  indisvalid: true,
  indisready: true,
  indislive: true,
  indnatts: 1,
  indnkeyatts: 1,
  has_expressions: false,
  amname: "btree",
  cols: ["userId"],
  keys_not_null: true,
  predicate: PRED,
  ...over,
});

const LINEAGE = {
  indnatts: 2,
  indnkeyatts: 2,
  cols: ["userId", "guideKey"],
};

const TRIPLE = {
  indnatts: 3,
  indnkeyatts: 3,
  cols: ["userId", "guideKey", "guideVersion"],
};

const tx = (rows: unknown[]) =>
  ({ $queryRawUnsafe: vi.fn().mockResolvedValue(rows) }) as never;

describe("guide ACTIVE capability · authority", () => {
  it("no partial index at all fails closed", async () => {
    const cap = await readGuideActiveCapability(tx([]));
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
    expect(cap.globalHealth).toBe("ABSENT");
    expect(cap.lineageHealth).toBe("ABSENT");
  });

  it("global only is GLOBAL", async () => {
    const cap = await readGuideActiveCapability(tx([index()]));
    expect(cap.effectiveMode).toBe("GLOBAL");
    expect(cap.globalHealth).toBe("HEALTHY");
    expect(cap.degraded).toBe(false);
  });

  it("both present keeps GLOBAL — the stricter invariant wins", async () => {
    const cap = await readGuideActiveCapability(tx([index(), index(LINEAGE)]));
    expect(cap.effectiveMode).toBe("GLOBAL");
    expect(cap.lineageHealth).toBe("HEALTHY");
    expect(cap.degraded).toBe(false);
  });

  it("lineage only is LINEAGE", async () => {
    const cap = await readGuideActiveCapability(tx([index(LINEAGE)]));
    expect(cap.effectiveMode).toBe("LINEAGE");
    expect(cap.globalHealth).toBe("ABSENT");
  });
});

describe("guide ACTIVE capability · health without losing service", () => {
  it("a half-built lineage index keeps GLOBAL serving, degraded", async () => {
    // The C.0B1 window: `CREATE INDEX CONCURRENTLY` is still building while
    // the global index is enforcing. Refusing here would take START down for
    // every user during the build, and a failed build leaves the invalid
    // index behind — so the outage would persist until someone dropped it.
    const cap = await readGuideActiveCapability(
      tx([
        index(),
        index({ ...LINEAGE, indisvalid: false, indisready: false }),
      ]),
    );
    expect(cap.effectiveMode).toBe("GLOBAL");
    expect(cap.lineageHealth).toBe("INVALID_OR_NOT_READY");
    expect(cap.degraded).toBe(true);
  });

  it("an unhealthy lineage index with no global authority fails closed", async () => {
    const cap = await readGuideActiveCapability(
      tx([index({ ...LINEAGE, indislive: false })]),
    );
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
    expect(cap.lineageHealth).toBe("INVALID_OR_NOT_READY");
  });

  it("a structural duplicate still serves, and is observable", async () => {
    const cap = await readGuideActiveCapability(tx([index(), index()]));
    expect(cap.effectiveMode).toBe("GLOBAL");
    expect(cap.degraded).toBe(true);
  });
});

describe("guide ACTIVE capability · what is never LINEAGE", () => {
  it("the by-version triple is not lineage authority", async () => {
    // ADR 0022 §2: `(userId, guideKey, guideVersion)` would let X@v1 and X@v2
    // both be ACTIVE, which is the exclusivity the ADR forbids. It is not a
    // weaker version of the capability — it is a different one.
    const cap = await readGuideActiveCapability(tx([index(TRIPLE)]));
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
    expect(cap.lineageHealth).not.toBe("HEALTHY");
  });

  it("a triple alongside a healthy global does not unlock lineage mode", async () => {
    const cap = await readGuideActiveCapability(tx([index(), index(TRIPLE)]));
    expect(cap.effectiveMode).toBe("GLOBAL");
    expect(cap.lineageHealth).not.toBe("HEALTHY");
    expect(cap.degraded).toBe(true);
  });

  it("a non-unique index with the right columns is not authority", async () => {
    const cap = await readGuideActiveCapability(
      tx([index({ indisunique: false })]),
    );
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
  });

  it("INCLUDE columns are not the approved shape", async () => {
    const cap = await readGuideActiveCapability(
      tx([index({ indnatts: 2, indnkeyatts: 1 })]),
    );
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
  });

  it("an expression index is not the approved shape", async () => {
    const cap = await readGuideActiveCapability(
      tx([index({ has_expressions: true })]),
    );
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
  });

  it("a nullable key column is not the approved shape", async () => {
    const cap = await readGuideActiveCapability(
      tx([index({ keys_not_null: false })]),
    );
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
  });

  it("a non-btree access method is not the approved shape", async () => {
    const cap = await readGuideActiveCapability(
      tx([index({ amname: "hash" })]),
    );
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
  });

  it("column ORDER is part of the shape", async () => {
    const cap = await readGuideActiveCapability(
      tx([index({ ...LINEAGE, cols: ["guideKey", "userId"] })]),
    );
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
  });
});

describe("guide ACTIVE capability · the predicate", () => {
  it("accepts the schema-qualified rendering", async () => {
    // Postgres qualifies the enum when `public` is not on the search_path.
    // Both strings describe the same index; refusing one would make the whole
    // check depend on an ambient session setting.
    const cap = await readGuideActiveCapability(
      tx([
        index({
          predicate: `(status = 'ACTIVE'::public."GuideSessionStatus")`,
        }),
      ]),
    );
    expect(cap.effectiveMode).toBe("GLOBAL");
  });

  it("refuses a predicate that admits more than ACTIVE", async () => {
    const cap = await readGuideActiveCapability(
      tx([
        index({
          predicate: `(status <> 'CANCELLED'::"GuideSessionStatus")`,
        }),
      ]),
    );
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
  });

  it("refuses a predicate that merely CONTAINS the accepted one", async () => {
    const cap = await readGuideActiveCapability(
      tx([
        index({
          predicate: `((status = 'ACTIVE'::"GuideSessionStatus") AND ("userId" <> 'x'))`,
        }),
      ]),
    );
    expect(cap.effectiveMode).toBe("FAIL_CLOSED");
  });
});

describe("guide start lock derivation", () => {
  it("the global key is byte-for-byte the one the previous version derives", () => {
    // If this string drifts, a pre-C.0A instance and this one hash different
    // keys and stop serialising against each other — the mixed-fleet
    // guarantee disappears silently.
    expect(globalStartLockKey("u-1")).toBe("guide:start:u-1");
  });

  it("the lineage key is namespaced by guide", () => {
    expect(lineageStartLockKey("u-1", "eec-c1")).toBe("guide:start:u-1:eec-c1");
    expect(lineageStartLockKey("u-1", "pqp-c1")).not.toBe(
      lineageStartLockKey("u-1", "eec-c1"),
    );
  });

  it("states the dual-v1 protocol", () => {
    expect(GUIDE_START_LOCK_PROTOCOL).toBe("dual-v1");
  });
});
