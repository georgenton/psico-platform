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
  BOOK_COPY_WITHDRAWAL,
  freezePlan,
  targetIdentityFromUrl,
  type FrozenPlan,
} from "./authorship-plan-file";
import { fixtureIdentitiesNamedIn } from "./authorship-sources";
import {
  applyAuthorshipRepair,
  collectReversal,
  RepairConflictError,
  RepairPreconditionError,
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

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dropWhenIdle } from "../test/pg-drop";

import {
  classifyTransactionFailure,
  describeError,
  runRepair,
} from "./authorship-repair-cli";
import {
  computePlanHash,
  describeOutcome,
  loadFrozenPlan,
  outcomePathFor,
  readOutcome,
} from "./authorship-plan-file";

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

/**
 * Copy shaped like the leftovers the UAT of 2026-10-22 measured in staging:
 * a synopsis opening with the fixture identity's name, a card line naming it
 * on the book whose authorship is still PENDING, and a bio asserting a
 * professional specialty. Written here as synthetic text — the point is the
 * shape of the defect, not the production prose.
 */
const BIO_A = "Biografía sintética con especialidad profesional afirmada.";
const BIO_B = "Biografía sintética distinta.";
const SINOPSIS_CON_NOMBRE =
  "Marina Quintana acompaña al lector por un recorrido sintético de prueba.";
const DESCRIPCION_CON_NOMBRE = "Una guía sintética escrita por Marina.";
/** Copy that mentions nobody: it must come out of the repair untouched. */
const SINOPSIS_LIMPIA = "Una sinopsis sintética que no nombra a nadie.";

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
        bio: true,
        isVerified: true,
      },
      orderBy: { slug: "asc" },
    }),
    books: await prisma.book.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        authorId: true,
        summary: true,
        description: true,
        isPublished: true,
      },
      // Ordered like `readSnapshot`: op order decides the plan hash, and two
      // freezes of an unchanged catalogue have to agree.
      orderBy: { slug: "asc" },
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
      await dropWhenIdle(admin, DB);
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
        bio: BIO_A,
        isVerified: true,
      },
    });
    await prisma.bookAuthor.create({
      data: {
        slug: "alguien-mas",
        name: "Alguien Más",
        title: "Su título",
        licenseNumber: "YY-1111",
        bio: "Su biografía",
        isVerified: true,
      },
    });
    await prisma.book.create({
      data: {
        slug: "emociones-en-construccion",
        title: "Emociones en Construcción",
        authorId: demo.id,
        summary: SINOPSIS_CON_NOMBRE,
        // Publicada: es la publicación legítima vigente, y sirve para medir
        // que retirar otra obra no la arrastra.
        isPublished: true,
      },
    });
    await prisma.book.create({
      data: {
        slug: "familias-ensambladas",
        title: "Familias Ensambladas",
        authorId: demo.id,
        description: DESCRIPCION_CON_NOMBRE,
        // PUBLICADA a propósito: es el estado que la base alojada tiene hoy y
        // el único en el que la retirada es una operación. Con el valor por
        // defecto (`false`) el plan la daría por satisfecha y la escritura
        // condicionada no se ejercitaría nunca contra PostgreSQL.
        isPublished: true,
      },
    });
    // A third work, so "the repair does not touch copy that names nobody" is
    // measured rather than assumed.
    await prisma.book.create({
      data: {
        slug: "otro-libro",
        title: "Otro libro",
        summary: SINOPSIS_LIMPIA,
        isPublished: true,
      },
    });
    // A fourth work, carried by the fixture identity and named by NO source
    // table: lo que mantiene medible que reatribuir una obra no arrastra las
    // demás filas del mismo autor.
    await prisma.book.create({
      data: {
        slug: "cuaderno-de-la-casa",
        title: "Cuaderno de la casa",
        authorId: demo.id,
        isPublished: true,
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

  it("aplicar retira credenciales y copy, crea el autor y reatribuye EEC", async () => {
    const plan = await freeze();
    const res = await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    // Credentials · copy de EEC · copy de Familias · alta · atribución.
    expect(res.rowsWritten).toBe(7);

    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      }),
    ).toMatchObject({
      title: null,
      licenseNumber: null,
      bio: null,
      isVerified: false,
    });

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

  it("el copy que nombraba a la identidad de fixture deja de servirse", async () => {
    // El defecto medido en la UAT: la cabecera acreditaba al autor de fuente
    // y la sinopsis seguía abriendo con el nombre de la identidad de fixture.
    const plan = await freeze();
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );

    const eec = await prisma.book.findUnique({
      where: { slug: "emociones-en-construccion" },
    });
    expect(eec!.summary).toBe(BOOK_COPY_WITHDRAWAL.summary);
    expect(fixtureIdentitiesNamedIn(eec!.summary)).toEqual([]);
    // Sólo el campo afectado: `description` estaba limpio y sigue nulo.
    expect(eec!.description).toBeNull();

    // La otra obra también deja de nombrar a la identidad de fixture.
    const familias = await prisma.book.findUnique({
      where: { slug: "familias-ensambladas" },
    });
    expect(familias!.description).toBe(BOOK_COPY_WITHDRAWAL.description);
    expect(familias!.summary).toBeNull();
    // Y deja de ofrecerse, que es la otra mitad de la decisión editorial.
    expect(familias!.isPublished).toBe(false);
    // La publicación legítima del libro ancla no se toca: retirar una obra no
    // es tocar la disponibilidad del resto.
    expect(eec!.isPublished).toBe(true);
    expect(
      (await prisma.book.findUnique({ where: { slug: "otro-libro" } }))!
        .isPublished,
    ).toBe(true);
  });

  it("la retirada es idempotente contra la base real", async () => {
    const plan = await freeze();
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    // Segunda corrida del MISMO plan congelado: la obra ya está retirada, así
    // que la operación se da por satisfecha en vez de chocar con su propia
    // expectativa.
    const otra = await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    expect(
      otra.applied.find((a) => a.op === "retire-book-publication")?.wrote,
    ).toBe(false);
    expect(
      (await prisma.book.findUnique({
        where: { slug: "familias-ensambladas" },
      }))!.isPublished,
    ).toBe(false);
  });

  it("si la obra se republica entre el plan y la escritura, no se pisa", async () => {
    const plan = await freeze();
    // Otra conexión la republica después de congelar el plan. El estado ya no
    // es ni el observado ni el resultado: la reparación se detiene.
    await prisma.book.update({
      where: { slug: "familias-ensambladas" },
      data: { slug: "familias-ensambladas-v2" },
    });
    await expect(
      prisma.$transaction((tx) =>
        applyAuthorshipRepair(tx as never, plan, { apply: true }),
      ),
    ).rejects.toThrow(/identidad del registro cambió/);
  });

  it("el copy que no nombra a nadie se queda como está", async () => {
    const plan = await freeze();
    expect(
      plan.ops.some(
        (o) => o.kind === "withdraw-book-copy" && o.bookSlug === "otro-libro",
      ),
    ).toBe(false);
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    expect(
      (await prisma.book.findUnique({ where: { slug: "otro-libro" } }))!
        .summary,
    ).toBe(SINOPSIS_LIMPIA);
  });

  it("el texto retirado sobrevive en la preimagen, para reescribirlo", async () => {
    // Retirar no es perder: la única copia del texto anterior queda en el
    // archivo privado, que es de donde saldrá la reescritura editorial.
    const entries = await collectReversal(prisma as never, await freeze());
    const copy = entries.find((e) => e.subject.startsWith("book copy id="));
    expect(copy?.restore).toEqual({
      summary: SINOPSIS_CON_NOMBRE,
      description: null,
    });
  });

  it("el otro libro no se reasigna y el autor ajeno queda intacto", async () => {
    const plan = await freeze();
    await prisma.$transaction((tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: true }),
    );
    const demo = await prisma.bookAuthor.findUnique({
      where: { slug: "marina-quintana" },
    });
    // Familias tiene fuente propia desde el 2026-10-23; la obra que NINGUNA
    // tabla nombra es la que prueba que la reatribución no arrastra filas.
    expect(
      (await prisma.book.findUnique({
        where: { slug: "cuaderno-de-la-casa" },
      }))!.authorId,
    ).toBe(demo!.id);
    expect(
      await prisma.bookAuthor.findUnique({ where: { slug: "alguien-mas" } }),
    ).toMatchObject({
      title: "Su título",
      licenseNumber: "YY-1111",
      bio: "Su biografía",
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

  it("biografía A → biografía B antes de aplicar: se detecta y no escribe", async () => {
    // La biografía viaja en el mismo digest exacto que el título: un cambio
    // de un texto a otro texto se detecta, y no se retira lo que nadie revisó.
    const plan = await freeze();
    await other.bookAuthor.update({
      where: { slug: "marina-quintana" },
      data: { bio: BIO_B },
    });
    await expect(
      prisma.$transaction((tx) =>
        applyAuthorshipRepair(tx as never, plan, { apply: true }),
      ),
    ).rejects.toBeInstanceOf(RepairConflictError);
    expect(
      (await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      }))!.bio,
    ).toBe(BIO_B);
  });

  it("sinopsis A → sinopsis B antes de aplicar: se detecta y no escribe", async () => {
    const plan = await freeze();
    await other.book.update({
      where: { slug: "emociones-en-construccion" },
      data: { summary: "Otra sinopsis, también con Marina Quintana dentro." },
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

  it("otra conexión cambia el copy en el intervalo: no se sobrescribe", async () => {
    // La ventana propia de la retirada de copy. El hook dispara tras la
    // PRIMERA lectura de libro, que es la de esta operación.
    const plan = await freeze();
    const intruso = "Texto que escribió otra conexión.";
    await expect(
      prisma.$transaction(async (tx) => {
        const wrapped = interleave(tx as never, "book", async () => {
          await other.book.update({
            where: { slug: "emociones-en-construccion" },
            data: { summary: intruso },
          });
        });
        return applyAuthorshipRepair(wrapped, plan, { apply: true });
      }),
    ).rejects.toBeInstanceOf(RepairConflictError);

    // Lo que escribió la otra conexión sigue ahí, y la retirada previa de
    // credenciales se revirtió con la transacción.
    expect(
      (await prisma.book.findUnique({
        where: { slug: "emociones-en-construccion" },
      }))!.summary,
    ).toBe(intruso);
    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      }),
    ).toMatchObject({ title: TITULO_A, bio: BIO_A, isVerified: true });
  });

  it("otra conexión cambia el libro en el intervalo: ni se pisa ni queda media reparación", async () => {
    // El copy se limpia ANTES de planificar a propósito: así el plan no lleva
    // ninguna operación de copy y la única lectura de libro es la de la
    // reatribución, que es la ventana que esta prueba mide. Con una operación
    // de copy por delante, el hook dispararía en su lectura y el conflicto
    // saldría de la comparación previa de la reatribución, no de su escritura
    // condicionada — la prueba pasaría midiendo algo más débil.
    await prisma.book.update({
      where: { slug: "emociones-en-construccion" },
      data: { summary: SINOPSIS_LIMPIA },
    });
    await prisma.book.update({
      where: { slug: "familias-ensambladas" },
      data: { description: null },
    });
    const plan = await freeze();
    expect(plan.ops.some((o) => o.kind === "withdraw-book-copy")).toBe(false);
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
      bio: BIO_A,
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
        expect(res.rowsWritten).toBe(7);
        throw new Error("fallo posterior simulado");
      }),
    ).rejects.toThrow(/fallo posterior simulado/);

    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      }),
    ).toMatchObject({ isVerified: true, title: TITULO_A, bio: BIO_A });
    expect(
      await prisma.bookAuthor.findUnique({
        where: { slug: "jorge-quizamanchuro" },
      }),
    ).toBeNull();
    // El copy retirado vuelve con todo lo demás: una reparación a medias
    // dejaría la sinopsis en el marcador sin que el autor se hubiera creado.
    expect(
      (await prisma.book.findUnique({
        where: { slug: "emociones-en-construccion" },
      }))!.summary,
    ).toBe(SINOPSIS_CON_NOMBRE);
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

  /* ── El recorrido del CLI, no la posición del código ──────────────────── */

  describe("recorrido completo del comando", () => {
    /**
     * Drives `runRepair` with injected dependencies against this disposable
     * database. The static assertions elsewhere pin where a call sits in the
     * source; this is the only thing that shows the command works.
     */
    const outDir = () => mkdtempSync(join(tmpdir(), "authorship-journey-"));

    /** The apply argv for a reviewed plan — both halves of its identity. */
    const applyArgvFor = (
      planPath: string,
      preimage: string,
      dry: { plan: { planId: string; planHash: string } },
    ) => [
      "--apply",
      `--plan=${planPath}`,
      `--reversal-out=${preimage}`,
      "--expect-database=" + target().database,
      "--expect-posture=test",
      `--expect-plan-id=${dry.plan.planId}`,
      `--expect-plan-hash=${dry.plan.planHash}`,
    ];

    const deps = (argv: string[], over: Record<string, string> = {}) => ({
      argv,
      env: { DATABASE_URL: url, ...over },
      posture: "test",
      prisma: prisma as never,
      say: () => undefined,
    });

    it("preparar, revisar, aplicar y comprobar filas", async () => {
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const preimage = join(dir, "preimagen.json");

      // 1 · prepare and freeze.
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));
      expect(dry.mode).toBe("dry-run");
      expect(dry.rowsWritten).toBe(0);
      expect(existsSync(planPath)).toBe(true);

      // 2 · review: the file loads under its own expected identity.
      const reviewed = loadFrozenPlan(planPath, target(), {
        planId: dry.plan.planId,
        planHash: dry.plan.planHash,
      });
      expect(reviewed.ops).toHaveLength(7);
      expect(reviewed.ops.map((o) => o.kind)).toEqual([
        "withdraw-author-credentials",
        "withdraw-book-copy",
        "withdraw-book-copy",
        // La retirada va ANTES de las atribuciones a propósito: si ambas
        // recaen sobre la misma obra, dejar de ofrecerla es lo que no puede
        // perderse por un bloqueo de la otra.
        "retire-book-publication",
        "create-author",
        "reattribute-book",
        "reattribute-book",
      ]);

      // 3 · apply, consuming THAT plan.
      const run = await runRepair(
        deps([
          "--apply",
          `--plan=${planPath}`,
          `--reversal-out=${preimage}`,
          "--expect-database=" + target().database,
          "--expect-posture=test",
          `--expect-plan-id=${dry.plan.planId}`,
          `--expect-plan-hash=${dry.plan.planHash}`,
        ]),
      );
      expect(run.mode).toBe("apply");
      expect(run.rowsWritten).toBe(7);
      expect(run.outcomeState).toBe("applied");

      // 4 · the rows, and the files beside them.
      const fixture = await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      });
      expect(fixture).toMatchObject({
        title: null,
        licenseNumber: null,
        bio: null,
        isVerified: false,
      });
      const eec = await prisma.book.findUnique({
        where: { slug: "emociones-en-construccion" },
      });
      expect(eec?.summary).toBe(BOOK_COPY_WITHDRAWAL.summary);
      const sourced = await prisma.bookAuthor.findUnique({
        where: { slug: "jorge-quizamanchuro" },
      });
      expect(eec?.authorId).toBe(sourced?.id);

      // The preimage holds the literals and stays `intended`; the outcome is
      // a separate file.
      const pre = JSON.parse(readFileSync(preimage, "utf8"));
      expect(pre.state).toBe("intended");
      expect(JSON.stringify(pre)).toContain(TITULO_A);
      // El copy retirado también: es la única copia del texto a reescribir.
      expect(JSON.stringify(pre)).toContain(BIO_A);
      expect(JSON.stringify(pre)).toContain(SINOPSIS_CON_NOMBRE);
      expect(readOutcome(preimage)?.state).toBe("applied");
      // And nothing shareable carries the literals.
      expect(JSON.stringify(run.report)).not.toContain(TITULO_A);
      expect(JSON.stringify(run.report)).not.toContain(LICENCIA_A);
      expect(JSON.stringify(run.report)).not.toContain(BIO_A);
      expect(JSON.stringify(run.report)).not.toContain(SINOPSIS_CON_NOMBRE);
    }, 60_000);

    it("repetir el mismo plan con otra ruta de resultado: cero cambios, sin duplicados", async () => {
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const first = join(dir, "pre-1.json");
      const second = join(dir, "pre-2.json");

      const dry = await runRepair(deps([`--plan-out=${planPath}`]));
      const applyArgv = (rev: string) => [
        "--apply",
        `--plan=${planPath}`,
        `--reversal-out=${rev}`,
        "--expect-database=" + target().database,
        "--expect-posture=test",
        `--expect-plan-id=${dry.plan.planId}`,
        `--expect-plan-hash=${dry.plan.planHash}`,
      ];

      const one = await runRepair(deps(applyArgv(first)));
      expect(one.rowsWritten).toBe(7);

      // The second run is the documented idempotence. It used to fail here:
      // `collectReversal` read the already-repaired book, compared it against
      // `expectAuthorId`, and threw a CONFLICT before the applier could reach
      // its no-op — so the whole journey was not idempotent even though the
      // applier alone was.
      const two = await runRepair(deps(applyArgv(second)));
      expect(two.rowsWritten).toBe(0);
      expect(two.reversalEntries).toBe(0);
      expect(two.outcomeState).toBe("applied");

      // The first preimage was not touched, and the second is its own file.
      expect(readOutcome(first)?.state).toBe("applied");
      expect(readOutcome(second)?.state).toBe("applied");
      expect(outcomePathFor(first)).not.toBe(outcomePathFor(second));

      // No duplicate author, and the rows are where the first run left them.
      const sourced = await prisma.bookAuthor.findMany({
        where: { slug: "jorge-quizamanchuro" },
      });
      expect(sourced).toHaveLength(1);
      const eec = await prisma.book.findUnique({
        where: { slug: "emociones-en-construccion" },
      });
      expect(eec?.authorId).toBe(sourced[0]!.id);
    }, 60_000);

    it("reusar la misma ruta de respaldo no destruye la única copia", async () => {
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const preimage = join(dir, "pre.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));
      const argv = [
        "--apply",
        `--plan=${planPath}`,
        `--reversal-out=${preimage}`,
        "--expect-database=" + target().database,
        "--expect-posture=test",
        `--expect-plan-id=${dry.plan.planId}`,
        `--expect-plan-hash=${dry.plan.planHash}`,
      ];
      await runRepair(deps(argv));
      const kept = readFileSync(preimage, "utf8");
      // The outcome check now fires FIRST, which is strictly earlier than the
      // preimage check and therefore better: it stops before the plan is even
      // re-read. Either refusal protects the only copy of the prior values.
      await expect(runRepair(deps(argv))).rejects.toThrow(
        /RESULTADO PREVIO|RESPALDO EXISTENTE/,
      );
      expect(readFileSync(preimage, "utf8")).toBe(kept);
    }, 60_000);

    it("conflicto real: rechazo sin adoptar el estado nuevo ni replanificar", async () => {
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));

      // Somebody changes the row after the plan was reviewed.
      await prisma.bookAuthor.update({
        where: { slug: "marina-quintana" },
        data: { title: TITULO_B },
      });

      const preimage = join(dir, "pre.json");
      await expect(
        runRepair(
          deps([
            "--apply",
            `--plan=${planPath}`,
            `--reversal-out=${preimage}`,
            "--expect-database=" + target().database,
            "--expect-posture=test",
            `--expect-plan-id=${dry.plan.planId}`,
            `--expect-plan-hash=${dry.plan.planHash}`,
          ]),
        ),
      ).rejects.toThrow(/no son los que el plan revisado observó/);

      // Nothing was written, no preimage was created (the refusal happens
      // while collecting it), and the new value was NOT adopted.
      const row = await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      });
      expect(row?.title).toBe(TITULO_B);
      expect(row?.isVerified).toBe(true);
      expect(existsSync(preimage)).toBe(false);
      expect(
        await prisma.bookAuthor.findUnique({
          where: { slug: "jorge-quizamanchuro" },
        }),
      ).toBeNull();
    }, 60_000);

    it("un fallo al guardar el respaldo deja cero escrituras de reparación", async () => {
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const preimage = join(dir, "pre.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));

      // The backup path is already taken, so persisting refuses. Every
      // precondition of the plan still holds, which is what makes this a test
      // of the BACKUP and not of the plan: the only reason to stop is that the
      // previous values could not be secured.
      writeFileSync(preimage, "{}");

      const before = await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      });
      await expect(
        runRepair(
          deps([
            "--apply",
            `--plan=${planPath}`,
            `--reversal-out=${preimage}`,
            "--expect-database=" + target().database,
            "--expect-posture=test",
            `--expect-plan-id=${dry.plan.planId}`,
            `--expect-plan-hash=${dry.plan.planHash}`,
          ]),
        ),
      ).rejects.toThrow(/RESPALDO EXISTENTE/);

      // Zero repair writes: the claims are still there and no author was made.
      const after = await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      });
      expect(after).toMatchObject({
        title: before?.title,
        licenseNumber: before?.licenseNumber,
        isVerified: true,
      });
      expect(
        await prisma.bookAuthor.findUnique({
          where: { slug: "jorge-quizamanchuro" },
        }),
      ).toBeNull();
      // And the file that was in the way is untouched.
      expect(readFileSync(preimage, "utf8")).toBe("{}");
    }, 60_000);

    it("el dry-run valida el autor de destino tanto pendiente como existente", async () => {
      const dir = outDir();
      // Pending: no sourced author row yet.
      const pending = await runRepair(
        deps([`--plan-out=${join(dir, "a.json")}`]),
      );
      // Credenciales · copy de dos libros · alta pendiente · atribución.
      expect(pending.reversalEntries).toBe(7);

      // Existing: create it, re-plan, and the dry run still validates it.
      await prisma.bookAuthor.create({
        data: { slug: "jorge-quizamanchuro", name: "Jorge Quizamanchuro" },
      });
      const existing = await runRepair(
        deps([`--plan-out=${join(dir, "b.json")}`]),
      );
      // The create-author op is satisfied, so one entry drops.
      expect(existing.reversalEntries).toBe(6);
      expect(existing.rowsWritten).toBe(0);
    }, 60_000);

    it("un cambio de nombre entre validación y escritura no se pisa", async () => {
      // `slug` and `name` are part of the conditional WHERE, so an identity
      // change in the window makes the statement match zero rows instead of
      // writing to a row that is no longer the one the plan described.
      const plan = await freeze();
      const op = plan.ops.find(
        (o) => o.kind === "withdraw-author-credentials",
      ) as Extract<
        FrozenPlan["ops"][number],
        { kind: "withdraw-author-credentials" }
      >;

      await expect(
        prisma.$transaction(async (tx) => {
          const patched = interleave(tx as never, "author", async () => {
            await other.bookAuthor.update({
              where: { id: op.authorId },
              data: { name: "Nombre Cambiado" },
            });
          });
          return applyAuthorshipRepair(patched, plan, { apply: true });
        }),
      ).rejects.toThrow(/escritura condicionada|identidad/);

      const row = await prisma.bookAuthor.findUnique({
        where: { id: op.authorId },
      });
      expect(row?.name).toBe("Nombre Cambiado");
      expect(row?.isVerified).toBe(true); // not withdrawn
    }, 60_000);

    it("describeError no vuelca el detalle de un fallo del driver", async () => {
      // A real constraint violation, to prove the sanitation on a genuine
      // driver error rather than a synthetic one.
      let caught: unknown;
      try {
        await prisma.bookAuthor.create({
          data: { slug: "marina-quintana", name: "Duplicada" },
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeTruthy();
      const d = describeError(caught);
      expect(d.message).not.toContain("marina-quintana");
      expect(d.message).toMatch(/no se imprime/);
    }, 60_000);

    it("rollback confirmado: estado correcto y cero cambios de reparación", async () => {
      // A REAL rollback: the callback applies the repair against the real
      // transaction and then throws one of our own errors, so PostgreSQL rolls
      // it back. The failure's scope settles the question, so it is recorded
      // as `rolled-back` rather than guessed at. The throw is injected; the
      // rollback is not.
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const preimage = join(dir, "pre.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));
      const base = deps(applyArgvFor(planPath, preimage, dry));

      const before = await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      });

      await expect(
        runRepair({
          ...base,
          prisma: {
            ...(base.prisma as object),
            $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
              prisma.$transaction(async (tx) => {
                await fn(tx);
                throw new RepairPreconditionError(
                  "prueba",
                  "fallo posterior forzado",
                );
              }),
          },
        } as never),
      ).rejects.toThrow(/fallo posterior forzado/);

      // Nothing of the repair survived.
      const after = await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      });
      expect(after).toMatchObject({
        title: before?.title,
        licenseNumber: before?.licenseNumber,
        isVerified: true,
      });
      expect(
        await prisma.bookAuthor.findUnique({
          where: { slug: "jorge-quizamanchuro" },
        }),
      ).toBeNull();

      // And the record says exactly that, paired with its plan.
      const outcome = readOutcome(preimage);
      expect(outcome?.state).toBe("rolled-back");
      expect(outcome?.planId).toBe(dry.plan.planId);
      expect(JSON.parse(readFileSync(preimage, "utf8")).state).toBe("intended");
    }, 60_000);

    it("fallo del registro tras un commit confirmado: filas verificadas, preimagen intacta, salida no cero", async () => {
      // Simulated by making the outcome path unwritable — the commit is real,
      // the paperwork failure is injected. Presented as what it is.
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const preimage = join(dir, "pre.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));

      // The paperwork is made impossible AFTER the commit, which is the only
      // honest place to inject it: the pre-flight check would otherwise stop
      // the run before it ever wrote anything. A directory where the outcome
      // file belongs makes `openSync(..., "wx")` fail for a real reason.
      const base = deps(applyArgvFor(planPath, preimage, dry));
      const lines: string[] = [];
      const run = await runRepair({
        ...base,
        say: (l: string) => lines.push(l),
        prisma: {
          ...(base.prisma as object),
          $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
            const r = await prisma.$transaction(fn);
            mkdirSync(outcomePathFor(preimage));
            return r;
          },
        },
      } as never);

      // The transaction committed, and the rows prove it.
      expect(run.transactionOutcome).toBe("committed");
      expect(run.rowsWritten).toBe(7);
      const eec = await prisma.book.findUnique({
        where: { slug: "emociones-en-construccion" },
      });
      const sourced = await prisma.bookAuthor.findUnique({
        where: { slug: "jorge-quizamanchuro" },
      });
      expect(eec?.authorId).toBe(sourced?.id);

      // No outcome file exists, and none is claimed.
      expect(run.outcomeRecorded).toBe(false);
      expect(run.outcome).toBeUndefined();
      expect(readOutcome(preimage)).toBeNull();

      // The preimage is intact, the warning separates the two facts, and the
      // exit code demands attention.
      expect(JSON.parse(readFileSync(preimage, "utf8")).state).toBe("intended");
      const said = lines.join("\n");
      expect(said).toMatch(
        /la transacción se CONFIRMÓ y el registro del resultado falló/,
      );
      expect(said).toMatch(/La base cambió: 7 fila\(s\)/);
      expect(said).toMatch(/no se afirma que exista/);
      expect(run.exitCode).toBe(6);
    }, 60_000);

    it("cero filas por idempotencia: no se dice que se modificaron datos", async () => {
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));
      const first = join(dir, "pre-1.json");
      await runRepair(deps(applyArgvFor(planPath, first, dry)));

      // Second run: nothing to write. The record is broken after the commit.
      const second = join(dir, "pre-2.json");
      const base = deps(applyArgvFor(planPath, second, dry));
      const lines: string[] = [];
      const run = await runRepair({
        ...base,
        say: (l: string) => lines.push(l),
        prisma: {
          ...(base.prisma as object),
          $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
            const r = await prisma.$transaction(fn);
            mkdirSync(outcomePathFor(second));
            return r;
          },
        },
      } as never);
      expect(run.rowsWritten).toBe(0);
      const said = lines.join("\n");
      expect(said).toMatch(/La base NO cambió: 0 filas escritas/);
      expect(said).not.toMatch(/La base cambió:/);
      expect(run.exitCode).toBe(6);
    }, 60_000);

    it("resultado de commit desconocido (inyección): no se etiqueta como aborto ni se reintenta", async () => {
      // SIMULATION, not an observed incident: the transport failure is
      // injected by wrapping $transaction so it rejects with a connection
      // class error after the callback ran.
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const preimage = join(dir, "pre.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));

      let callbackRuns = 0;
      const base = deps(applyArgvFor(planPath, preimage, dry));
      const lines: string[] = [];
      const injected = {
        ...base,
        say: (l: string) => lines.push(l),
        prisma: {
          ...(base.prisma as object),
          $queryRawUnsafe: (sql: string) =>
            (
              prisma as never as {
                $queryRawUnsafe: (s: string) => Promise<unknown>;
              }
            ).$queryRawUnsafe(sql),
          $transaction: async () => {
            callbackRuns += 1;
            throw Object.assign(new Error("connection terminated"), {
              code: "08006",
            });
          },
          bookAuthor: prisma.bookAuthor,
          book: prisma.book,
        },
      } as never;

      await expect(runRepair(injected)).rejects.toThrow(
        /connection terminated/,
      );

      // Attempted exactly once: no retry on a guess.
      expect(callbackRuns).toBe(1);
      // Recorded as undetermined — NOT as a confirmed abort.
      const outcome = readOutcome(preimage);
      expect(outcome?.state).toBe("undetermined");
      expect(outcome?.state).not.toBe("rolled-back");
      const said = lines.join("\n");
      expect(said).toMatch(/no se pudo determinar el resultado/);
      expect(said).toMatch(/NO se afirma que la reparación no se aplicara/);
      // The preimage is untouched and still only `intended`.
      expect(JSON.parse(readFileSync(preimage, "utf8")).state).toBe("intended");
    }, 60_000);

    it("rechazo con un error de Prisma: no se declara revertido ni se reintenta", async () => {
      // SIMULATION, not an observed incident. The injected rejection is the
      // shape Prisma really produces — a wrapper with a `P####` code — rather
      // than a bare SQLSTATE, because that is the case the shape rule got
      // wrong: `P1017` is "the server closed the connection" and it matched
      // /^[0-9A-Z]{5}$/, so it was recorded as a confirmed rollback.
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));

      for (const code of ["P1017", "P2028"]) {
        const preimage = join(dir, `pre-${code}.json`);
        let attempts = 0;
        const base = deps(applyArgvFor(planPath, preimage, dry));
        const lines: string[] = [];

        await expect(
          runRepair({
            ...base,
            say: (l: string) => lines.push(l),
            prisma: {
              ...(base.prisma as object),
              $queryRawUnsafe: (sql: string) =>
                (
                  prisma as never as {
                    $queryRawUnsafe: (q: string) => Promise<unknown>;
                  }
                ).$queryRawUnsafe(sql),
              $transaction: async () => {
                attempts += 1;
                throw Object.assign(new Error("Transaction already closed"), {
                  name: "PrismaClientKnownRequestError",
                  code,
                  clientVersion: "7.0.0",
                });
              },
              bookAuthor: prisma.bookAuthor,
              book: prisma.book,
            },
          } as never),
        ).rejects.toThrow(/Transaction already closed/);

        // Attempted once: no retry, no re-plan, no automatic reversal.
        expect(attempts).toBe(1);

        // NOT recorded as a confirmed rollback on that signal alone.
        const outcome = readOutcome(preimage);
        expect(outcome?.state).toBe("undetermined");
        expect(outcome?.state).not.toBe("rolled-back");

        // And it does not tell the operator the repair did not happen.
        const said = lines.join("\n");
        expect(said).toMatch(/no se pudo determinar el resultado/);
        expect(said).not.toMatch(/No se aplicó la reparación/);
        expect(said).not.toMatch(/la base quedó como estaba/);

        // The preimage is intact and still only `intended`.
        expect(JSON.parse(readFileSync(preimage, "utf8")).state).toBe(
          "intended",
        );
      }
    }, 90_000);

    it("la salida exige intervención cuando el resultado es indeterminado", async () => {
      // `runRepair` rethrows, and the entry point maps a foreign failure to a
      // non-zero exit. Asserted on the classification the orchestration used,
      // since the process boundary is `main`.
      expect(
        classifyTransactionFailure(
          Object.assign(new Error("x"), { code: "P1017" }),
        ),
      ).toBe("undetermined");
      expect(
        describeError(Object.assign(new Error("x"), { code: "P1017" }))
          .exitCode,
      ).toBe(1);
    });

    it("un resultado previo detiene la ejecución ANTES de modificar la base", async () => {
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));

      // A fresh preimage path whose outcome file already exists: archiving the
      // backup and leaving the record is an ordinary thing to do.
      const preimage = join(dir, "pre.json");
      writeFileSync(outcomePathFor(preimage), "{}");

      const before = await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      });
      await expect(
        runRepair(deps(applyArgvFor(planPath, preimage, dry))),
      ).rejects.toThrow(/RESULTADO PREVIO/);

      // Zero changes, and the preimage was never written.
      const after = await prisma.bookAuthor.findUnique({
        where: { slug: "marina-quintana" },
      });
      expect(after?.isVerified).toBe(before?.isVerified);
      expect(existsSync(preimage)).toBe(false);
      expect(
        await prisma.bookAuthor.findUnique({
          where: { slug: "jorge-quizamanchuro" },
        }),
      ).toBeNull();
    }, 60_000);

    it("un resultado de otro plan no se acepta como evidencia", async () => {
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const preimage = join(dir, "pre.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));
      await runRepair(deps(applyArgvFor(planPath, preimage, dry)));

      // Tamper with the record so it claims another plan.
      const op = outcomePathFor(preimage);
      const f = JSON.parse(readFileSync(op, "utf8"));
      f.planId = "otro-plan";
      writeFileSync(op, JSON.stringify(f));

      expect(readOutcome(preimage)).toBeNull();
      const read = describeOutcome(preimage);
      expect(read.ok).toBe(false);
      expect(read.ok === false && read.reason).toMatch(/otro plan/);
    }, 60_000);

    it("el hash cubre la postura: un plan de otra postura no se aplica", async () => {
      const dir = outDir();
      const planPath = join(dir, "plan.json");
      const dry = await runRepair(deps([`--plan-out=${planPath}`]));
      const edited = JSON.parse(readFileSync(planPath, "utf8"));
      edited.target.posture = "staging";
      edited.planHash = computePlanHash(edited.ops, edited.target, {
        blockers: edited.blockers,
        satisfied: edited.satisfied,
        untouched: edited.untouched,
      });
      writeFileSync(planPath, JSON.stringify(edited));
      await expect(
        runRepair(
          deps([
            "--apply",
            `--plan=${planPath}`,
            `--reversal-out=${join(dir, "pre.json")}`,
            "--expect-database=" + target().database,
            "--expect-posture=test",
            `--expect-plan-id=${dry.plan.planId}`,
            `--expect-plan-hash=${dry.plan.planHash}`,
          ]),
        ),
      ).rejects.toThrow(/POSTURA DISCORDANTE/);
    }, 60_000);
  });
});
