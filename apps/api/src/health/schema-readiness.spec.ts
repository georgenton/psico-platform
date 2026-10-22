import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HealthController } from "./health.controller";
import {
  type AppliedMigrationRow,
  diffMigrations,
  unreadable,
} from "./schema-readiness";
import {
  SchemaReadinessService,
  readShippedMigrations,
} from "./schema-readiness.service";

/**
 * The probe that exists because two different deploys shipped a stale schema
 * behind a green light.
 *
 * 2026-10-01: a first deploy skipped its migration (Coolify has no container
 * to exec into) and the API answered /health 200 against an empty database.
 * 2026-10-22: the pre-deployment hook exec'd into the OUTGOING container, read
 * that commit's 69 migrations, found them all applied and reported success —
 * while the 70th, shipped by the image being deployed, never ran.
 *
 * Both are the same defect wearing different clothes, so the tests are written
 * against both shapes rather than against the second one only.
 */

const ok = (name: string): AppliedMigrationRow => ({
  migration_name: name,
  finished_at: new Date("2026-10-01T00:00:00Z"),
  rolled_back_at: null,
});

/** The real inventory, abbreviated: 70 shipped, 69 applied. */
const SHIPPED_70 = Array.from(
  { length: 70 },
  (_, i) => `2026${String(i).padStart(4, "0")}_m${i}`,
);
const APPLIED_69 = SHIPPED_70.slice(0, 69).map(ok);

describe("diffMigrations", () => {
  it("is ready when every shipped migration is applied", () => {
    const v = diffMigrations({ shipped: SHIPPED_70, applied: SHIPPED_70.map(ok) });
    expect(v).toMatchObject({ ready: true, reason: "ok", pending: [], failed: [] });
    expect(v.shippedCount).toBe(70);
    expect(v.appliedCount).toBe(70);
  });

  it("reproduces 2026-10-22: 70 shipped, 69 applied, so NOT ready", () => {
    const v = diffMigrations({ shipped: SHIPPED_70, applied: APPLIED_69 });
    expect(v.ready).toBe(false);
    expect(v.reason).toBe("pending");
    expect(v.pending).toEqual([SHIPPED_70[69]]);
    expect(v.shippedCount).toBe(70);
    expect(v.appliedCount).toBe(69);
  });

  it("reproduces 2026-10-01: nothing applied at all", () => {
    const v = diffMigrations({ shipped: SHIPPED_70, applied: [] });
    expect(v.ready).toBe(false);
    expect(v.reason).toBe("pending");
    expect(v.pending).toHaveLength(70);
  });

  it("catches the case a count would miss: same totals, different names", () => {
    // This is the whole reason the verdict compares names. With totals, two
    // sides of 2 each would agree while the database is missing `b` entirely.
    const v = diffMigrations({
      shipped: ["a", "b"],
      applied: [ok("a"), ok("zz-not-shipped")],
    });
    expect(v.shippedCount).toBe(2);
    expect(v.appliedCount).toBe(2);
    expect(v.ready).toBe(false);
    expect(v.pending).toEqual(["b"]);
  });

  it("treats an unfinished row as failed, not as applied", () => {
    const v = diffMigrations({
      shipped: ["a"],
      applied: [{ migration_name: "a", finished_at: null, rolled_back_at: null }],
    });
    expect(v.ready).toBe(false);
    expect(v.reason).toBe("failed");
    expect(v.failed).toEqual(["a"]);
    // And it is still pending: migrate deploy has not completed it.
    expect(v.pending).toEqual(["a"]);
  });

  it("treats a rolled-back row as failed", () => {
    const v = diffMigrations({
      shipped: ["a"],
      applied: [
        {
          migration_name: "a",
          finished_at: new Date(),
          rolled_back_at: new Date(),
        },
      ],
    });
    expect(v.ready).toBe(false);
    expect(v.reason).toBe("failed");
    expect(v.failed).toEqual(["a"]);
  });

  it("failed outranks pending in the reason, because it blocks migrate deploy", () => {
    const v = diffMigrations({
      shipped: ["a", "b"],
      applied: [{ migration_name: "a", finished_at: null, rolled_back_at: null }],
    });
    expect(v.reason).toBe("failed");
  });

  it("a rollback to an older image is still ready", () => {
    // The database holds a migration this image does not ship. Under the
    // additive-migration posture the older code runs fine against the newer
    // schema, so calling this "not ready" would make every rollback look
    // broken.
    const v = diffMigrations({
      shipped: ["a"],
      applied: [ok("a"), ok("b-from-a-newer-build")],
    });
    expect(v.ready).toBe(true);
    expect(v.reason).toBe("ok");
  });

  it("de-duplicates and sorts so the answer does not depend on input order", () => {
    const v = diffMigrations({
      shipped: ["b", "a", "b"],
      applied: [],
    });
    expect(v.pending).toEqual(["a", "b"]);
    expect(v.shippedCount).toBe(2);
  });
});

describe("unreadable", () => {
  it("is never ready, for either cause", () => {
    for (const reason of ["migrations-unreadable", "database-unreachable"] as const) {
      const v = unreadable(reason, 70);
      expect(v.ready).toBe(false);
      expect(v.reason).toBe(reason);
      expect(v.shippedCount).toBe(70);
    }
  });
});

describe("readShippedMigrations", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const fixture = (names: string[]) => {
    const root = mkdtempSync(join(tmpdir(), "psico-migrations-"));
    dirs.push(root);
    for (const n of names) mkdirSync(join(root, n));
    writeFileSync(join(root, "migration_lock.toml"), 'provider = "postgresql"');
    return root;
  };

  it("reads directory names and ignores files beside them", () => {
    const root = fixture(["20260101000000_a", "20260102000000_b"]);
    expect(readShippedMigrations([root])?.sort()).toEqual([
      "20260101000000_a",
      "20260102000000_b",
    ]);
  });

  it("returns null — not an empty list — when no candidate exists", () => {
    // An empty list would diff clean against ANY database and report ready.
    // That is the fail-open bug this distinction exists to prevent.
    expect(readShippedMigrations([join(tmpdir(), "psico-does-not-exist")])).toBeNull();
  });

  it("takes the first candidate that exists", () => {
    const second = fixture(["20260101000000_a"]);
    const found = readShippedMigrations([
      join(tmpdir(), "psico-absent"),
      second,
    ]);
    expect(found).toEqual(["20260101000000_a"]);
  });
});

describe("SchemaReadinessService", () => {
  const prismaWith = (rows: AppliedMigrationRow[] | Error) => ({
    $queryRaw: vi.fn(() =>
      rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows),
    ),
  });

  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const fixture = (names: string[]) => {
    const root = mkdtempSync(join(tmpdir(), "psico-migrations-"));
    dirs.push(root);
    for (const n of names) mkdirSync(join(root, n));
    return root;
  };

  it("reports pending when the database is behind the image", async () => {
    const root = fixture(["m1", "m2"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new SchemaReadinessService(prismaWith([ok("m1")]) as any);
    const report = await svc.report([root]);
    expect(report.ready).toBe(false);
    expect(report.pending).toEqual(["m2"]);
  });

  it("is ready when both sides agree", async () => {
    const root = fixture(["m1"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new SchemaReadinessService(prismaWith([ok("m1")]) as any);
    await expect(svc.report([root])).resolves.toMatchObject({ ready: true });
  });

  it("fails closed when the migrations directory is missing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new SchemaReadinessService(prismaWith([]) as any);
    const report = await svc.report([join(tmpdir(), "psico-absent")]);
    expect(report).toMatchObject({
      ready: false,
      reason: "migrations-unreadable",
    });
  });

  it("fails closed when the ledger cannot be read — the empty-database case", async () => {
    const root = fixture(["m1"]);
    const svc = new SchemaReadinessService(
      // `relation "_prisma_migrations" does not exist` is what an unmigrated
      // database answers, and it must not read as "nothing pending".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaWith(new Error('relation "_prisma_migrations" does not exist')) as any,
    );
    const report = await svc.report([root]);
    expect(report).toMatchObject({
      ready: false,
      reason: "database-unreachable",
      shippedCount: 1,
    });
  });
});

describe("GET /api/health/ready", () => {
  const controller = (report: unknown) =>
    new HealthController(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { report: vi.fn(() => Promise.resolve(report)) } as any,
    );

  it("answers 200 with the report when the schema is current", async () => {
    const report = {
      ready: true,
      reason: "ok",
      pending: [],
      failed: [],
      shippedCount: 70,
      appliedCount: 70,
    };
    await expect(controller(report).ready()).resolves.toEqual(report);
  });

  it("answers 503 SCHEMA_NOT_READY and names what is pending", async () => {
    const report = {
      ready: false,
      reason: "pending",
      pending: ["20261021000000_editorial_origin_seal"],
      failed: [],
      shippedCount: 70,
      appliedCount: 69,
    };
    await expect(controller(report).ready()).rejects.toMatchObject({
      status: 503,
      response: {
        code: "SCHEMA_NOT_READY",
        details: { pending: ["20261021000000_editorial_origin_seal"] },
      },
    });
  });

  it("still refuses when readiness could not be established at all", async () => {
    const report = {
      ready: false,
      reason: "migrations-unreadable",
      pending: [],
      failed: [],
      shippedCount: 0,
      appliedCount: 0,
    };
    await expect(controller(report).ready()).rejects.toMatchObject({
      status: 503,
      response: { code: "SCHEMA_NOT_READY" },
    });
  });

  it("liveness stays liveness: /health never consults the schema", async () => {
    // If this ever starts depending on the schema probe, Coolify's gate
    // deadlocks: it waits for a migration that only post-deployment applies.
    const probe = { report: vi.fn() };
    const c = new HealthController(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      probe as any,
    );
    expect(c.check()).toMatchObject({ status: "ok" });
    expect(probe.report).not.toHaveBeenCalled();
  });
});
