import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
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
  READINESS_CACHE_MS,
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
 * The rolled-back cases below come from an independent review of the first
 * version of this file, which treated any `rolled_back_at` row as a permanent
 * failure. That turned the runbook's own recovery path — resolve, then apply
 * again — into a probe that would never go green.
 */

const AT = new Date("2026-10-01T00:00:00Z");

const applied = (name: string): AppliedMigrationRow => ({
  migration_name: name,
  finished_at: AT,
  rolled_back_at: null,
});
/** Started and never finished, nobody resolved it: what blocks migrate deploy. */
const unresolved = (name: string): AppliedMigrationRow => ({
  migration_name: name,
  finished_at: null,
  rolled_back_at: null,
});
/** `prisma migrate resolve --rolled-back` wrote this. */
const rolledBack = (name: string): AppliedMigrationRow => ({
  migration_name: name,
  finished_at: null,
  rolled_back_at: AT,
});

/** The real inventory, abbreviated: 70 shipped, 69 applied. */
const SHIPPED_70 = Array.from(
  { length: 70 },
  (_, i) => `2026${String(i).padStart(4, "0")}_m${i}`,
);

describe("diffMigrations", () => {
  it("is ready when every shipped migration is applied", () => {
    const v = diffMigrations({
      shipped: SHIPPED_70,
      applied: SHIPPED_70.map(applied),
    });
    expect(v).toMatchObject({ ready: true, reason: "ok", pending: [], failed: [] });
    expect(v.appliedCount).toBe(70);
  });

  it("reproduces 2026-10-22: 70 shipped, 69 applied, so NOT ready", () => {
    const v = diffMigrations({
      shipped: SHIPPED_70,
      applied: SHIPPED_70.slice(0, 69).map(applied),
    });
    expect(v.ready).toBe(false);
    expect(v.reason).toBe("pending");
    expect(v.pending).toEqual([SHIPPED_70[69]]);
  });

  it("reproduces 2026-10-01: nothing applied at all", () => {
    const v = diffMigrations({ shipped: SHIPPED_70, applied: [] });
    expect(v.ready).toBe(false);
    expect(v.pending).toHaveLength(70);
  });

  it("catches the case a count would miss: same totals, different names", () => {
    const v = diffMigrations({
      shipped: ["a", "b"],
      applied: [applied("a"), applied("zz-not-shipped")],
    });
    expect(v.shippedCount).toBe(2);
    expect(v.appliedCount).toBe(2);
    expect(v.ready).toBe(false);
    expect(v.pending).toEqual(["b"]);
  });

  describe("history of a migration that was rolled back", () => {
    it("rolled back AND LATER APPLIED, two rows for one name, is ready", () => {
      // The documented recovery: it failed, someone ran
      // `migrate resolve --rolled-back`, the next deploy applied it. The
      // ledger keeps both rows. Reporting this as failed forever was the bug.
      const v = diffMigrations({
        shipped: ["a"],
        applied: [rolledBack("a"), applied("a")],
      });
      expect(v).toMatchObject({ ready: true, reason: "ok", failed: [] });
      expect(v.appliedCount).toBe(1);
    });

    it("row order does not change that verdict", () => {
      const v = diffMigrations({
        shipped: ["a"],
        applied: [applied("a"), rolledBack("a")],
      });
      expect(v.ready).toBe(true);
    });

    it("only the rolled-back row: still PENDING, and not a failure", () => {
      // migrate deploy will simply apply it again, so the honest word is
      // "pending". Calling it "failed" would send someone to resolve a row
      // that is already resolved.
      const v = diffMigrations({ shipped: ["a"], applied: [rolledBack("a")] });
      expect(v.ready).toBe(false);
      expect(v.reason).toBe("pending");
      expect(v.pending).toEqual(["a"]);
      expect(v.failed).toEqual([]);
    });

    it("unfinished and unresolved blocks, and is reported as failed", () => {
      const v = diffMigrations({ shipped: ["a"], applied: [unresolved("a")] });
      expect(v.ready).toBe(false);
      expect(v.reason).toBe("failed");
      expect(v.failed).toEqual(["a"]);
      expect(v.pending).toEqual(["a"]);
    });

    it("an unfinished row followed by a successful one is applied, not failed", () => {
      const v = diffMigrations({
        shipped: ["a"],
        applied: [unresolved("a"), applied("a")],
      });
      expect(v).toMatchObject({ ready: true, failed: [] });
    });

    it("a blocking row for a migration this image does NOT ship still blocks", () => {
      // Prisma refuses to move past ANY unresolved failure, so rolling back
      // to an older image does not clear it. The probe must agree.
      const v = diffMigrations({
        shipped: ["a"],
        applied: [applied("a"), unresolved("newer-from-another-build")],
      });
      expect(v.ready).toBe(false);
      expect(v.reason).toBe("failed");
      expect(v.failed).toEqual(["newer-from-another-build"]);
      expect(v.pending).toEqual([]);
    });

    it("failed outranks pending in the reason", () => {
      const v = diffMigrations({
        shipped: ["a", "b"],
        applied: [unresolved("a")],
      });
      expect(v.reason).toBe("failed");
    });
  });

  it("a rollback to an older image is still ready", () => {
    const v = diffMigrations({
      shipped: ["a"],
      applied: [applied("a"), applied("b-from-a-newer-build")],
    });
    expect(v).toMatchObject({ ready: true, reason: "ok" });
  });

  it("de-duplicates and sorts so the answer does not depend on input order", () => {
    const v = diffMigrations({ shipped: ["b", "a", "b"], applied: [] });
    expect(v.pending).toEqual(["a", "b"]);
    expect(v.shippedCount).toBe(2);
  });
});

describe("unreadable", () => {
  it("is never ready, for either cause", () => {
    for (const reason of ["migrations-unreadable", "database-unreachable"] as const) {
      expect(unreadable(reason, 70)).toMatchObject({ ready: false, reason });
    }
  });
});

/** A migrations folder the way Prisma writes one: a dir plus its SQL. */
const makeFixture = (track: string[]) => (names: string[], opts?: { skipSqlFor?: string }) => {
  const root = mkdtempSync(join(tmpdir(), "psico-migrations-"));
  track.push(root);
  for (const n of names) {
    mkdirSync(join(root, n));
    if (opts?.skipSqlFor !== n) {
      writeFileSync(join(root, n, "migration.sql"), "SELECT 1;");
    }
  }
  if (names.length > 0) {
    writeFileSync(join(root, "migration_lock.toml"), 'provider = "postgresql"');
  }
  return root;
};

describe("readShippedMigrations · controles negativos", () => {
  const dirs: string[] = [];
  const fixture = makeFixture(dirs);
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("inventario válido: devuelve los nombres e ignora los archivos de al lado", () => {
    const root = fixture(["20260101000000_a", "20260102000000_b"]);
    expect(readShippedMigrations([root])?.sort()).toEqual([
      "20260101000000_a",
      "20260102000000_b",
    ]);
  });

  it("carpeta inexistente → null", () => {
    expect(readShippedMigrations([join(tmpdir(), "psico-no-existe")])).toBeNull();
  });

  it("carpeta EXISTENTE pero VACÍA → null, no lista vacía", () => {
    // El falso 200 que la auditoría encontró: una lista vacía cuadra contra
    // cualquier base y la declararía al día.
    const root = fixture([]);
    expect(readShippedMigrations([root])).toBeNull();
  });

  it("un directorio sin su migration.sql → null (imagen incompleta)", () => {
    const root = fixture(["20260101000000_a", "20260102000000_b"], {
      skipSqlFor: "20260102000000_b",
    });
    expect(readShippedMigrations([root])).toBeNull();
  });

  it("lectura fallida → null", () => {
    // Una ruta que existe y NO es un directorio: `readdirSync` lanza ENOTDIR.
    // Determinista y portable, al contrario que jugar con permisos.
    const root = fixture(["20260101000000_a"]);
    const asFile = join(root, "20260101000000_a", "migration.sql");
    expect(readShippedMigrations([asFile])).toBeNull();
  });

  it("toma el primer candidato que existe", () => {
    const second = fixture(["20260101000000_a"]);
    expect(
      readShippedMigrations([join(tmpdir(), "psico-ausente"), second]),
    ).toEqual(["20260101000000_a"]);
  });
});

describe("SchemaReadinessService", () => {
  const dirs: string[] = [];
  const fixture = makeFixture(dirs);
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const prismaWith = (rows: AppliedMigrationRow[] | Error) => ({
    $queryRaw: vi.fn(() =>
      rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows),
    ),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcWith = (p: unknown) => new SchemaReadinessService(p as any);

  it("reports pending when the database is behind the image", async () => {
    const root = fixture(["m1", "m2"]);
    const report = await svcWith(prismaWith([applied("m1")])).report([root]);
    expect(report).toMatchObject({ ready: false, pending: ["m2"] });
  });

  it("is ready when both sides agree", async () => {
    const root = fixture(["m1"]);
    await expect(
      svcWith(prismaWith([applied("m1")])).report([root]),
    ).resolves.toMatchObject({ ready: true });
  });

  it("fails closed when the migrations inventory is invalid", async () => {
    const report = await svcWith(prismaWith([])).report([
      join(tmpdir(), "psico-ausente"),
    ]);
    expect(report).toMatchObject({ ready: false, reason: "migrations-unreadable" });
  });

  it("fails closed when the ledger cannot be read — the empty-database case", async () => {
    const root = fixture(["m1"]);
    const report = await svcWith(
      prismaWith(new Error('relation "_prisma_migrations" does not exist')),
    ).report([root]);
    expect(report).toMatchObject({
      ready: false,
      reason: "database-unreachable",
      shippedCount: 1,
    });
  });

  it("no filtra el mensaje del driver en el veredicto", () => {
    // El veredicto viaja a un endpoint público: un mensaje de conexión no.
    const v = unreadable("database-unreachable", 1);
    expect(JSON.stringify(v)).not.toMatch(/relation|postgres|localhost|5432/i);
  });

  describe("caché breve: una petición pública no es una consulta", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-22T00:00:00Z"));
    });

    it("dos llamadas dentro de la ventana consultan UNA vez", async () => {
      const root = fixture(["m1"]);
      const prisma = prismaWith([applied("m1")]);
      const svc = svcWith(prisma);
      await svc.report([root]);
      await svc.report([root]);
      await svc.report([root]);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("vencida la ventana, vuelve a consultar", async () => {
      const root = fixture(["m1"]);
      const prisma = prismaWith([applied("m1")]);
      const svc = svcWith(prisma);
      await svc.report([root]);
      vi.advanceTimersByTime(READINESS_CACHE_MS + 1);
      await svc.report([root]);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it("registra en el cambio de estado, no en cada petición", async () => {
      // Un endpoint público sondeado con el esquema atrasado escribiría la
      // misma línea para siempre y enterraría la que importaba.
      const spy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
      const root = fixture(["m1", "m2"]);
      const svc = svcWith(prismaWith([applied("m1")]));
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(READINESS_CACHE_MS + 1);
        await svc.report([root]);
      }
      expect(spy).toHaveBeenCalledTimes(1);
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
    await expect(
      controller({
        ready: false,
        reason: "migrations-unreadable",
        pending: [],
        failed: [],
        shippedCount: 0,
        appliedCount: 0,
      }).ready(),
    ).rejects.toMatchObject({ status: 503, response: { code: "SCHEMA_NOT_READY" } });
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

  it("el límite de tasa se aplica de verdad, pese al SkipThrottle de la clase", () => {
    // `@Throttle` SOLO no basta: el guard resuelve el skip con
    // `getAllAndOverride([handler, clase])`, así que sin el
    // `@SkipThrottle({default:false})` del handler el límite quedaría escrito
    // y nunca aplicado — un verde vacío más. Las claves son las de
    // `@nestjs/throttler` (`THROTTLER:SKIP` / `THROTTLER:LIMIT` + nombre).
    const handler = HealthController.prototype.ready;
    expect(Reflect.getMetadata("THROTTLER:SKIPdefault", handler)).toBe(false);
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", handler)).toBe(60);
    // Y la clase sigue saltándose el throttle para `/health`, que es barato.
    expect(Reflect.getMetadata("THROTTLER:SKIPdefault", HealthController)).toBe(
      true,
    );
  });
});
