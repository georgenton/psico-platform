import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  planAuthorshipRepair,
  type CatalogSnapshot,
} from "./authorship-repair";
import {
  freezePlan,
  targetIdentityFromUrl,
  type FrozenPlan,
} from "./authorship-plan-file";
import {
  applyAuthorshipRepair,
  collectReversal,
  RepairConflictError,
  type RepairTx,
} from "./authorship-repair-apply";

/**
 * The repair against real PostgreSQL, including a real second connection.
 *
 * ── What the unit spec cannot answer ──────────────────────────────────────
 *
 * Whether the conditional write actually closes the window between the check
 * and the write. The earlier "concurrent" tests changed a row BEFORE the
 * repair started, which only exercised the pre-read comparison — a tool with
 * no protection at all would have passed them. Here a **separate connection**
 * mutates the row **between** the applier's read and its write, driven by code
 * rather than by a sleep, so the interleaving is deterministic.
 *
 * ── Isolation of the test database itself ─────────────────────────────────
 *
 * The earlier version used a fixed name and `DROP DATABASE … WITH (FORCE)`
 * before creating it, which on a shared local server will happily destroy
 * somebody's database for having the same name. This run creates a uniquely
 * named database, records that it created it, and drops only that one.
 *
 * Runs only when TEST_DATABASE_URL is set (`test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();

/** Unique per run: it cannot collide with a pre-existing database. */
const DB = `authorship_repair_${process.pid}_${Date.now().toString(36)}`;
/** Set only once WE created it. Cleanup is conditional on this. */
let createdByThisRun = false;

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const TITULO_A = "Título sintético A";
const TITULO_B = "Título sintético B";
const LICENCIA_A = "AA-0001";
const LICENCIA_B = "BB-0002";

suite("Catálogo · reparación de autoría (PostgreSQL real)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  /** A genuinely separate connection, for the interleaved writer. */
  let other: PrismaClient;
  let otherPool: Pool;
  let url: string;

  const target = () => targetIdentityFromUrl(url, "test");

  const snapshot = async (): Promise<CatalogSnapshot> => ({
    authors: await prisma.bookAuthor.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        title: true,
        licenseNumber: true,
        isVerified: true,
      },
    }),
    books: await prisma.book.findMany({
      select: { id: true, slug: true, title: true, authorId: true },
    }),
  });

  const freeze = async (): Promise<FrozenPlan> =>
    freezePlan(planAuthorshipRepair(await snapshot()), target());

  const runSeed = () =>
    execSync("pnpm exec prisma db seed", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    try {
      // No DROP first: a unique name must not already exist, and if it somehow
      // does, this fails loudly instead of destroying it.
      await admin.query(`CREATE DATABASE "${DB}"`);
      createdByThisRun = true;
    } finally {
      await admin.end();
    }

    url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });

    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    otherPool = new Pool({ connectionString: url });
    other = new PrismaClient({ adapter: new PrismaPg(otherPool) });
  }, 240_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    if (other) await other.$disconnect();
    if (otherPool) await otherPool.end();
    if (!createdByThisRun) return; // Never drop what we did not create.
    const admin = new Pool({ connectionString: base });
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });

  /** The pre-repair world, written explicitly with synthetic values. */
  beforeEach(async () => {
    await prisma.book.updateMany({ data: { authorId: null } });
    await prisma.bookAuthor.deleteMany({});
    await prisma.bookCategory.deleteMany({});
    await prisma.book.deleteMany({});

    const demo = await prisma.bookAuthor.create({
      data: {
        slug: "marina-quintana",
        name: "Marina Quintana",
        title: TITULO_A,
        licenseNumber: LICENCIA_A,
        isVerified: true,
      },
    });
    await prisma.bookAuthor.create({
      data: {
        slug: "alguien-mas",
        name: "Alguien Más",
        title: "Su título",
        licenseNumber: "YY-1111",
        isVerified: true,
      },
    });
    await prisma.book.create({
      data: {
        slug: "emociones-en-construccion",
        title: "Emociones en Construcción",
        authorId: demo.id,
      },
    });
    await prisma.book.create({
      data: {
        slug: "familias-ensambladas",
        title: "Familias Ensambladas",
        authorId: demo.id,
      },
    });
  });

  it("dry-run no escribe ninguna fila", async () => {
    const before = await snapshot();
    const res = await applyAuthorshipRepair(prisma as never, await freeze());
    expect(res.dryRun).toBe(true);
    expect(res.rowsWritten).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it("el dry-run valida el libro y guarda su vínculo con el autor pendiente", async () => {
    const entries = await collectReversal(prisma as never, await freeze());
    const link = entries.find((e) => e.subject.startsWith("book id="));
    const demo = await prisma.bookAuthor.findUnique({
      where: { slug: "marina-quintana" },
    });
    expect(link?.restore).toEqual({ authorId: demo!.id });
  });

  it("aplicar retira credenciales, crea el autor y reatribuye EEC", async () => {
    const plan = await freeze();
    const res = await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    expect(res.rowsWritten).toBe(3);

    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      }),
    ).toMatchObject({ title: null, licenseNumber: null, isVerified: false });

    const jorge = await prisma.bookAuthor.findUnique({
      where: { slug: "jorge-quizamanchuro" },
    });
    expect(jorge).toMatchObject({
      name: "Jorge Quizamanchuro",
      title: null,
      licenseNumber: null,
      isVerified: false,
    });
    expect(
      (await prisma.book.findUnique({
        where: { slug: "emociones-en-construccion" },
      }))!.authorId,
    ).toBe(jorge!.id);
  });

  it("el otro libro no se reasigna y el autor ajeno queda intacto", async () => {
    const plan = await freeze();
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    const demo = await prisma.bookAuthor.findUnique({
      where: { slug: "marina-quintana" },
    });
    expect(
      (await prisma.book.findUnique({
        where: { slug: "familias-ensambladas" },
      }))!.authorId,
    ).toBe(demo!.id);
    expect(
      await prisma.bookAuthor.findUnique({ where: { slug: "alguien-mas" } }),
    ).toMatchObject({
      title: "Su título",
      licenseNumber: "YY-1111",
      isVerified: true,
    });
  });

  // ── contraejemplos exactos, contra la base ─────────────────────────────

  it("título A → título B antes de aplicar: se detecta y no escribe", async () => {
    const plan = await freeze();
    await other.bookAuthor.update({
      where: { slug: "marina-quintana" },
      data: { title: TITULO_B },
    });
    await expect(
      prisma.$transaction((tx) =>
        applyAuthorshipRepair(tx as never, plan, { apply: true }),
      ),
    ).rejects.toBeInstanceOf(RepairConflictError);
    // El valor nuevo sigue ahí: no se retiró algo que nadie revisó.
    expect(
      (await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      }))!.title,
    ).toBe(TITULO_B);
  });

  it("licencia A → licencia B antes de aplicar: se detecta y no escribe", async () => {
    const plan = await freeze();
    await other.bookAuthor.update({
      where: { slug: "marina-quintana" },
      data: { licenseNumber: LICENCIA_B },
    });
    await expect(
      prisma.$transaction((tx) =>
        applyAuthorshipRepair(tx as never, plan, { apply: true }),
      ),
    ).rejects.toBeInstanceOf(RepairConflictError);
  });

  // ── la ventana real ────────────────────────────────────────────────────

  /**
   * Wrap a transaction so a hook fires immediately after a chosen read.
   *
   * This is what makes the interleaving deterministic: the other connection's
   * write happens strictly between the applier's `findUnique` and its
   * conditional `updateMany`, because the code says so — no sleeps, no racing.
   * The read and the write are the real ones against real PostgreSQL, and the
   * interfering write comes from a genuinely separate connection.
   */
  function interleave(
    tx: RepairTx,
    on: "book" | "author",
    hook: () => Promise<void>,
  ): RepairTx {
    let fired = false;
    const run = async () => {
      if (fired) return;
      fired = true;
      await hook();
    };
    if (on === "author") {
      const original = tx.bookAuthor.findUnique.bind(tx.bookAuthor);
      return {
        ...tx,
        bookAuthor: {
          ...tx.bookAuthor,
          findUnique: async (
            args: Parameters<RepairTx["bookAuthor"]["findUnique"]>[0],
          ) => {
            const row = await original(args);
            await run();
            return row;
          },
        },
      };
    }
    const original = tx.book.findUnique.bind(tx.book);
    return {
      ...tx,
      book: {
        ...tx.book,
        findUnique: async (
          args: Parameters<RepairTx["book"]["findUnique"]>[0],
        ) => {
          const row = await original(args);
          await run();
          return row;
        },
      },
    };
  }

  it("otra conexión cambia el autor en el intervalo: no se sobrescribe", async () => {
    const plan = await freeze();
    await expect(
      prisma.$transaction(async (tx) => {
        const wrapped = interleave(tx as never, "author", async () => {
          await other.bookAuthor.update({
            where: { slug: "marina-quintana" },
            data: { title: TITULO_B },
          });
        });
        return applyAuthorshipRepair(wrapped, plan, { apply: true });
      }),
    ).rejects.toBeInstanceOf(RepairConflictError);

    // El cambio de la otra operación sobrevive: la reparación no lo pisó.
    const after = await prisma.bookAuthor.findUnique({
      where: { slug: "marina-quintana" },
    });
    expect(after!.title).toBe(TITULO_B);
    expect(after!.isVerified).toBe(true);
  });

  it("otra conexión cambia el libro en el intervalo: ni se pisa ni queda media reparación", async () => {
    const plan = await freeze();
    const otherAuthor = await prisma.bookAuthor.findUnique({
      where: { slug: "alguien-mas" },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        const wrapped = interleave(tx as never, "book", async () => {
          await other.book.update({
            where: { slug: "emociones-en-construccion" },
            data: { authorId: otherAuthor!.id },
          });
        });
        return applyAuthorshipRepair(wrapped, plan, { apply: true });
      }),
    ).rejects.toBeInstanceOf(RepairConflictError);

    // El vínculo que escribió la otra conexión sigue en pie…
    expect(
      (await prisma.book.findUnique({
        where: { slug: "emociones-en-construccion" },
      }))!.authorId,
    ).toBe(otherAuthor!.id);
    // …y la retirada de credenciales, que ocurrió ANTES en la misma
    // transacción, se revirtió: no queda media reparación aplicada.
    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      }),
    ).toMatchObject({
      title: TITULO_A,
      licenseNumber: LICENCIA_A,
      isVerified: true,
    });
    // Ni el autor nuevo quedó creado.
    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "jorge-quizamanchuro" },
      }),
    ).toBeNull();
  });

  it("un fallo posterior revierte la reparación completa", async () => {
    const plan = await freeze();
    await expect(
      prisma.$transaction(async (tx) => {
        const res = await applyAuthorshipRepair(tx as never, plan, {
          apply: true,
        });
        expect(res.rowsWritten).toBe(3);
        throw new Error("fallo posterior simulado");
      }),
    ).rejects.toThrow(/fallo posterior simulado/);

    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      }),
    ).toMatchObject({ isVerified: true, title: TITULO_A });
    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "jorge-quizamanchuro" },
      }),
    ).toBeNull();
  });

  it("repetir no escribe nada ni duplica el autor", async () => {
    const first = await freeze();
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, first, { apply: true }),
    );
    const second = await freeze();
    const res = await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, second, { apply: true }),
    );
    expect(res.rowsWritten).toBe(0);
    expect(
      await prisma.bookAuthor.findMany({
        where: { slug: "jorge-quizamanchuro" },
      }),
    ).toHaveLength(1);
  });

  // ── identidad bajo normalización, en PostgreSQL ────────────────────────

  it("un autor con slug en otra caja/espacios se reutiliza, no se duplica", async () => {
    await prisma.bookAuthor.create({
      data: { slug: " Jorge-Quizamanchuro ", name: "Jorge Quizamanchuro" },
    });
    const plan = await freeze();
    const attr = plan.ops.find((o) => o.kind === "reattribute-book");
    if (attr?.kind !== "reattribute-book") throw new Error("shape");
    // El planificador congela su id REAL, no el slug canónico.
    expect(attr.targetAuthorId).toBeTruthy();
    expect(plan.ops.some((o) => o.kind === "create-author")).toBe(false);

    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );

    const all = await prisma.bookAuthor.findMany();
    const jorges = all.filter(
      (a) => a.slug.trim().toLowerCase() === "jorge-quizamanchuro",
    );
    expect(jorges).toHaveLength(1);
    expect(
      (await prisma.book.findUnique({
        where: { slug: "emociones-en-construccion" },
      }))!.authorId,
    ).toBe(jorges[0]!.id);
  });

  it("dos autores que normalizan al mismo slug bloquean el plan", async () => {
    await prisma.bookAuthor.create({
      data: { slug: "jorge-quizamanchuro", name: "Jorge Quizamanchuro" },
    });
    await prisma.bookAuthor.create({
      data: { slug: "Jorge-Quizamanchuro", name: "Jorge Quizamanchuro" },
    });
    const plan = planAuthorshipRepair(await snapshot());
    expect(
      plan.blockers.some((b) => /normalizan al mismo slug/.test(b.reason)),
    ).toBe(true);
  });

  // ── el seed ────────────────────────────────────────────────────────────

  it("volver a sembrar NO devuelve EEC a la atribución anterior", async () => {
    const plan = await freeze();
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    const jorge = await prisma.bookAuthor.findUnique({
      where: { slug: "jorge-quizamanchuro" },
    });

    runSeed();

    expect(
      (await prisma.book.findUnique({
        where: { slug: "emociones-en-construccion" },
      }))!.authorId,
    ).toBe(jorge!.id);
    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      }),
    ).toMatchObject({ title: null, licenseNumber: null, isVerified: false });
  }, 180_000);

  it("sembrar desde cero no otorga credenciales a ninguna identidad", async () => {
    await prisma.book.updateMany({ data: { authorId: null } });
    await prisma.bookAuthor.deleteMany({});
    await prisma.book.deleteMany({});

    runSeed();

    const authors = await prisma.bookAuthor.findMany();
    expect(authors.length).toBeGreaterThan(0);
    for (const a of authors) {
      expect(a.title).toBeNull();
      expect(a.licenseNumber).toBeNull();
      expect(a.isVerified).toBe(false);
    }
    const eec = await prisma.book.findUnique({
      where: { slug: "emociones-en-construccion" },
      include: { author: true },
    });
    expect(eec?.author?.slug).toBe("jorge-quizamanchuro");
  }, 180_000);

  it("el seed no atribuye el libro a un slug canónico con identidad discordante", async () => {
    // Alguien ocupa el slug del autor de fuente con otra persona. El seed no
    // debe colgar el libro de esa fila sólo porque el slug coincide, ni
    // renombrarla para encajar.
    await prisma.book.updateMany({ data: { authorId: null } });
    await prisma.bookAuthor.deleteMany({});
    await prisma.book.deleteMany({});
    const impostor = await prisma.bookAuthor.create({
      data: { slug: "jorge-quizamanchuro", name: "Otra Persona" },
    });

    runSeed();

    const eec = await prisma.book.findUnique({
      where: { slug: "emociones-en-construccion" },
    });
    expect(eec?.authorId).not.toBe(impostor.id);
    expect(
      (await prisma.bookAuthor.findUnique({ where: { id: impostor.id } }))!
        .name,
    ).toBe("Otra Persona");
  }, 180_000);

  it("conserva ids de libro, slugs y el acceso por plan", async () => {
    const before = await prisma.book.findMany({
      select: { id: true, slug: true, plan: true, totalChapters: true },
      orderBy: { slug: "asc" },
    });
    const plan = await freeze();
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    expect(
      await prisma.book.findMany({
        select: { id: true, slug: true, plan: true, totalChapters: true },
        orderBy: { slug: "asc" },
      }),
    ).toEqual(before);
  });
});
