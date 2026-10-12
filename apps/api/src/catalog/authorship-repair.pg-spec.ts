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
  applyAuthorshipRepair,
  RepairPreconditionError,
} from "./authorship-repair-apply";

/**
 * The repair against a real, disposable PostgreSQL.
 *
 * The unit spec pins the decisions over a fake transaction. This pins the
 * things only a database can answer: that a dry run leaves the rows alone,
 * that `$transaction` really rolls a half-done correction back, that a second
 * run writes nothing and mints no duplicate author, and — the one that
 * motivated the whole change — that **running the catalogue seed again does
 * not undo the repair**.
 *
 * Runs only when TEST_DATABASE_URL is set (`test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "catalog_authorship_repair_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("Catálogo · reparación de autoría (PostgreSQL real)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let url: string;

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

  /** Run the catalogue seed against the disposable database. */
  const runSeed = () =>
    execSync("pnpm exec prisma db seed", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  }, 240_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  /**
   * Each test starts from the pre-repair world: the catalogue as a database
   * that ran the OLD seed would hold it. The seed no longer writes these
   * claims, so they are set here explicitly — that is what makes the
   * before/after difference visible rather than assumed.
   */
  beforeEach(async () => {
    await prisma.book.updateMany({ data: { authorId: null } });
    await prisma.bookAuthor.deleteMany({});
    await prisma.bookCategory.deleteMany({});
    await prisma.book.deleteMany({});

    const demo = await prisma.bookAuthor.create({
      data: {
        slug: "marina-quintana",
        name: "Marina Quintana",
        title: "Un título profesional sin fuente",
        licenseNumber: "XX-0000",
        isVerified: true,
      },
    });
    // A third party with real credentials, to prove the repair is targeted.
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
    const res = await applyAuthorshipRepair(
      prisma as never,
      planAuthorshipRepair(before),
    );

    expect(res.dryRun).toBe(true);
    expect(res.rowsWritten).toBe(0);
    const after = await snapshot();
    expect(after).toEqual(before);
    // The credentials are still exactly where they were.
    const demo = after.authors.find((a) => a.slug === "marina-quintana")!;
    expect(demo.isVerified).toBe(true);
    expect(demo.licenseNumber).not.toBeNull();
  });

  it("aplicar retira credenciales, crea el autor de fuente y reatribuye EEC", async () => {
    const plan = planAuthorshipRepair(await snapshot());
    const res = await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    expect(res.rowsWritten).toBe(3);

    const demo = await prisma.bookAuthor.findUnique({
      where: { slug: "marina-quintana" },
    });
    expect(demo).toMatchObject({
      title: null,
      licenseNumber: null,
      isVerified: false,
    });
    // The row survives — it still carries a book.
    expect(demo!.name).toBe("Marina Quintana");

    const jorge = await prisma.bookAuthor.findUnique({
      where: { slug: "jorge-quizamanchuro" },
    });
    expect(jorge).toMatchObject({
      name: "Jorge Quizamanchuro",
      title: null,
      licenseNumber: null,
      isVerified: false,
    });

    const eec = await prisma.book.findUnique({
      where: { slug: "emociones-en-construccion" },
    });
    expect(eec!.authorId).toBe(jorge!.id);
  });

  it("el otro libro del autor antiguo NO se reasigna", async () => {
    const plan = planAuthorshipRepair(await snapshot());
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    const demo = await prisma.bookAuthor.findUnique({
      where: { slug: "marina-quintana" },
    });
    const fe = await prisma.book.findUnique({
      where: { slug: "familias-ensambladas" },
    });
    expect(fe!.authorId).toBe(demo!.id);
  });

  it("el autor ajeno y sus credenciales quedan intactos", async () => {
    const plan = planAuthorshipRepair(await snapshot());
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    const other = await prisma.bookAuthor.findUnique({
      where: { slug: "alguien-mas" },
    });
    expect(other).toMatchObject({
      name: "Alguien Más",
      title: "Su título",
      licenseNumber: "YY-1111",
      isVerified: true,
    });
  });

  it("repetir el plan no escribe nada ni duplica el autor", async () => {
    const plan0 = planAuthorshipRepair(await snapshot());
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan0, { apply: true }),
    );
    const plan1 = planAuthorshipRepair(await snapshot());
    const second = await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan1, { apply: true }),
    );
    expect(second.rowsWritten).toBe(0);
    const jorges = await prisma.bookAuthor.findMany({
      where: { slug: "jorge-quizamanchuro" },
    });
    expect(jorges).toHaveLength(1);
  });

  it("un cambio concurrente bloquea y no deja corrección parcial", async () => {
    const plan = planAuthorshipRepair(await snapshot());
    // Somebody curates the author row after the plan was built.
    await prisma.bookAuthor.update({
      where: { slug: "marina-quintana" },
      data: { isVerified: false },
    });

    await expect(
      prisma.$transaction((tx) =>
        applyAuthorshipRepair(tx as never, plan, { apply: true }),
      ),
    ).rejects.toBeInstanceOf(RepairPreconditionError);

    // The transaction rolled back: the book was NOT reattributed, so there is
    // no half-done correction.
    const eec = await prisma.book.findUnique({
      where: { slug: "emociones-en-construccion" },
    });
    const demo = await prisma.bookAuthor.findUnique({
      where: { slug: "marina-quintana" },
    });
    expect(eec!.authorId).toBe(demo!.id);
    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "jorge-quizamanchuro" },
      }),
    ).toBeNull();
  });

  it("un fallo en una operación relacionada revierte la anterior", async () => {
    const plan = planAuthorshipRepair(await snapshot());
    await expect(
      prisma.$transaction(async (tx) => {
        const res = await applyAuthorshipRepair(tx as never, plan, {
          apply: true,
        });
        expect(res.rowsWritten).toBe(3);
        // Something later in the same unit of work fails.
        throw new Error("fallo posterior simulado");
      }),
    ).rejects.toThrow(/fallo posterior simulado/);

    // Nothing stuck: credentials still present, no new author, book unmoved.
    const demo = await prisma.bookAuthor.findUnique({
      where: { slug: "marina-quintana" },
    });
    expect(demo!.isVerified).toBe(true);
    expect(demo!.licenseNumber).not.toBeNull();
    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "jorge-quizamanchuro" },
      }),
    ).toBeNull();
  });

  it("volver a sembrar NO devuelve EEC a la atribución anterior", async () => {
    // The point of the whole change. Repair, then run the catalogue seed the
    // way a deploy does, and check the correction survived.
    const plan0 = planAuthorshipRepair(await snapshot());
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan0, { apply: true }),
    );
    const jorge = await prisma.bookAuthor.findUnique({
      where: { slug: "jorge-quizamanchuro" },
    });

    runSeed();

    const eec = await prisma.book.findUnique({
      where: { slug: "emociones-en-construccion" },
    });
    expect(eec!.authorId).toBe(jorge!.id);

    // And the withdrawn credentials were not restored either.
    const demo = await prisma.bookAuthor.findUnique({
      where: { slug: "marina-quintana" },
    });
    expect(demo).toMatchObject({
      title: null,
      licenseNumber: null,
      isVerified: false,
    });
  }, 180_000);

  it("sembrar desde cero no otorga credenciales a la identidad de fixture", async () => {
    // A fresh database: only the seed has written. No title, no licence, no
    // verification anywhere in the catalogue.
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
    // And the anchor book arrives attributed to its sourced author.
    const eec = await prisma.book.findUnique({
      where: { slug: "emociones-en-construccion" },
      include: { author: true },
    });
    expect(eec?.author?.slug).toBe("jorge-quizamanchuro");
  }, 180_000);

  it("conserva ids de libro, slugs y el acceso por plan", async () => {
    const before = await prisma.book.findMany({
      select: { id: true, slug: true, plan: true, totalChapters: true },
      orderBy: { slug: "asc" },
    });
    const plan0 = planAuthorshipRepair(await snapshot());
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan0, { apply: true }),
    );
    const after = await prisma.book.findMany({
      select: { id: true, slug: true, plan: true, totalChapters: true },
      orderBy: { slug: "asc" },
    });
    // Only the author changed; nothing the reader navigates by moved.
    expect(after).toEqual(before);
  });
});
