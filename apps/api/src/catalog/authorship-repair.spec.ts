import { describe, expect, it, vi } from "vitest";

import {
  describePlan,
  planAuthorshipRepair,
  type CatalogSnapshot,
} from "./authorship-repair";
import {
  BOOK_COPY_WITHDRAWAL,
  WITHDRAWAL,
  computePlanHash,
  fieldDigest,
  freezePlan,
  sanitizedPlanSummary,
  targetIdentityFromUrl,
  type FrozenPlan,
  type TargetIdentity,
} from "./authorship-plan-file";
import {
  applyAuthorshipRepair,
  collectReversal,
  RepairConflictError,
  RepairPreconditionError,
  type RepairTx,
} from "./authorship-repair-apply";
import {
  AUTHORSHIP_PENDING,
  AUTHORSHIP_SOURCES,
  FIXTURE_AUTHOR_SLUGS,
  fixtureIdentitiesNamedIn,
} from "./authorship-sources";

/**
 * Planning and applying, over a snapshot and a fake transaction.
 *
 * These pin DECISIONS and REFUSALS. They are not evidence that a write lands
 * in PostgreSQL, nor that the concurrency protection holds against a real
 * second connection — `authorship-repair.pg-spec.ts` does both, and the two
 * are deliberately not interchangeable.
 */

const TARGET: TargetIdentity = targetIdentityFromUrl(
  "postgresql://u:p@localhost:5433/catalogo_de_prueba",
  "development",
);

/** Synthetic values. Never a real or withdrawn credential. */
const TITULO_A = "Título sintético A";
const TITULO_B = "Título sintético B";
const LICENCIA_A = "AA-0001";
const LICENCIA_B = "BB-0002";

const BIO_A = "Biografía sintética con especialidad profesional afirmada.";
/** Copy shaped like the leftovers the UAT measured: a name in prose. */
const SINOPSIS_CON_NOMBRE =
  "Marina Quintana acompaña al lector por un recorrido sintético.";

const DEMO_AUTHOR = {
  id: "a-demo",
  slug: "marina-quintana",
  name: "Marina Quintana",
  title: TITULO_A,
  licenseNumber: LICENCIA_A,
  bio: BIO_A,
  isVerified: true,
};

/** A third party's row: legitimate data, nothing to do with this file. */
const OTHER_AUTHOR = {
  id: "a-other",
  slug: "alguien-mas",
  name: "Alguien Más",
  title: "Su título",
  licenseNumber: "YY-1111",
  bio: "Su biografía",
  isVerified: true,
};

const snapshot = (over: Partial<CatalogSnapshot> = {}): CatalogSnapshot => ({
  authors: [DEMO_AUTHOR, OTHER_AUTHOR],
  books: [
    {
      id: "b-eec",
      slug: "emociones-en-construccion",
      title: "Emociones en Construcción",
      authorId: "a-demo",
      summary: SINOPSIS_CON_NOMBRE,
      description: null,
    },
    {
      id: "b-fe",
      slug: "familias-ensambladas",
      title: "Familias Ensambladas",
      authorId: "a-demo",
      summary: null,
      description: null,
    },
  ],
  ...over,
});

const freeze = (snap: CatalogSnapshot = snapshot()): FrozenPlan =>
  freezePlan(planAuthorshipRepair(snap), TARGET);

describe("authorship sources", () => {
  it("sólo acredita autoría editorial, nunca una credencial profesional", () => {
    for (const s of AUTHORSHIP_SOURCES) {
      expect(Object.keys(s).sort()).toEqual(
        ["authorName", "authorSlug", "bookSlug", "bookTitle", "source"].sort(),
      );
    }
  });

  it("no extrapola a los libros sin fuente", () => {
    const sourced = AUTHORSHIP_SOURCES.map((s) => s.bookSlug);
    for (const pending of AUTHORSHIP_PENDING) {
      expect(sourced).not.toContain(pending);
    }
  });

  it("no publica la credencial que viene a retirar", () => {
    const files = [
      JSON.stringify(AUTHORSHIP_SOURCES),
      JSON.stringify(FIXTURE_AUTHOR_SLUGS),
    ].join(" ");
    expect(files).not.toMatch(/EC-PSI/i);
    expect(files).not.toMatch(/Dra\.|Dr\./);
  });
});

describe("plan congelado", () => {
  it("el hash cubre operaciones y destino", () => {
    const plan = planAuthorshipRepair(snapshot());
    const otro = targetIdentityFromUrl(
      "postgresql://u:p@localhost:5433/otra_base",
      "development",
    );
    // Same operations, different database ⇒ different plan.
    expect(computePlanHash(plan.ops, TARGET)).not.toBe(
      computePlanHash(plan.ops, otro),
    );
  });

  it("el resumen compartible no lleva literales ni sus digests", () => {
    const summary = JSON.stringify(sanitizedPlanSummary(freeze()));
    expect(summary).not.toContain(TITULO_A);
    expect(summary).not.toContain(LICENCIA_A);
    // Tampoco el digest del valor retirado, ni la clave que lo transportaría.
    expect(summary).not.toContain(fieldDigest(TITULO_A) as string);
    expect(summary).not.toContain(fieldDigest(LICENCIA_A) as string);
    expect(summary).not.toContain("titleDigest");
    expect(summary).not.toContain("licenseDigest");
    // El planHash y la huella del destino SÍ están: son identificadores del
    // plan, no del valor, y son justo lo que vincula lo revisado con lo
    // aplicado.
    expect(summary).toContain("planHash");
    expect(summary).toContain("fingerprint");
    // Y dice qué había, que es lo que un revisor necesita.
    expect(summary).toContain("titlePresent");
    expect(summary).toContain("licensePresent");
  });

  it("la expectativa es exacta, no una presencia", () => {
    const op = freeze().ops.find(
      (o) => o.kind === "withdraw-author-credentials",
    );
    if (op?.kind !== "withdraw-author-credentials") throw new Error("shape");
    expect(op.expect.titleDigest).toBe(fieldDigest(TITULO_A));
    expect(op.expect.licenseDigest).toBe(fieldDigest(LICENCIA_A));
    // Y conserva identidad de fila, no sólo los campos.
    expect(op.expect.name).toBe("Marina Quintana");
    expect(op.expect.slug).toBe("marina-quintana");
  });
});

describe("planAuthorshipRepair", () => {
  it("atribuye EEC a su autor de fuente, creando la fila que falta", () => {
    const plan = planAuthorshipRepair(snapshot());
    const create = plan.ops.find((o) => o.kind === "create-author");
    const attr = plan.ops.find((o) => o.kind === "reattribute-book");
    if (create?.kind !== "create-author") throw new Error("falta el alta");
    if (attr?.kind !== "reattribute-book")
      throw new Error("falta la atribución");
    expect(create.authorSlug).toBe("jorge-quizamanchuro");
    expect(attr.expectAuthorId).toBe("a-demo");
    // Aún no existe, así que el plan no finge un id de destino.
    expect(attr.targetAuthorId).toBeNull();
  });

  it("congela el id del autor cuando ya existe, incluso con slug normalizado", () => {
    const plan = planAuthorshipRepair(
      snapshot({
        authors: [
          DEMO_AUTHOR,
          {
            id: "a-jorge",
            slug: "  Jorge-Quizamanchuro ",
            name: "Jorge Quizamanchuro",
            title: null,
            licenseNumber: null,
            bio: null,
            isVerified: false,
          },
        ],
      }),
    );
    expect(plan.ops.some((o) => o.kind === "create-author")).toBe(false);
    const attr = plan.ops.find((o) => o.kind === "reattribute-book");
    if (attr?.kind !== "reattribute-book") throw new Error("shape");
    // El id real, no el slug canónico: el aplicador no vuelve a buscar.
    expect(attr.targetAuthorId).toBe("a-jorge");
  });

  it("no toca al autor ajeno ni sus credenciales", () => {
    const plan = planAuthorshipRepair(snapshot());
    expect(JSON.stringify(plan.ops)).not.toContain("a-other");
    expect(plan.untouched.map((u) => u.subject)).toContain("autor alguien-mas");
  });

  it("no reasigna el otro libro del autor antiguo", () => {
    const plan = planAuthorshipRepair(snapshot());
    const slugs = plan.ops
      .filter((o) => o.kind === "reattribute-book")
      .map((o) => (o.kind === "reattribute-book" ? o.bookSlug : ""));
    expect(slugs).not.toContain("familias-ensambladas");
    expect(
      plan.untouched.find((u) => u.subject.includes("familias-ensambladas"))
        ?.note,
    ).toMatch(/AUTHORSHIP_SOURCE = PENDING/);
  });

  it("un libro ausente no es un bloqueo, y se dice el alcance de la consulta", () => {
    const plan = planAuthorshipRepair(snapshot());
    expect(plan.blockers).toHaveLength(0);
    const nota = plan.untouched.find((u) =>
      u.subject.includes("parejas-que-perduran"),
    )?.note;
    // No afirma que la obra no exista: dice que no hay fila identificada en el
    // alcance consultado, y que no se hace bootstrap por esa inferencia.
    expect(nota).toMatch(/alcance consultado/);
    expect(nota).toMatch(/sin bootstrap ni ingesta/);
  });

  it("dos filas con el mismo slug de libro BLOQUEAN el plan", () => {
    const plan = planAuthorshipRepair(
      snapshot({
        books: [
          {
            id: "b1",
            slug: "emociones-en-construccion",
            title: "A",
            authorId: null,
            summary: null,
            description: null,
          },
          {
            id: "b2",
            slug: "emociones-en-construccion",
            title: "B",
            authorId: null,
            summary: null,
            description: null,
          },
        ],
      }),
    );
    // Antes esto caía en `untouched` y el plan seguía adelante.
    expect(plan.blockers.some((b) => /comparten el slug/.test(b.reason))).toBe(
      true,
    );
    expect(plan.ops.some((o) => o.kind === "reattribute-book")).toBe(false);
  });

  it("dos autores que normalizan al mismo slug BLOQUEAN, no se elige uno", () => {
    const plan = planAuthorshipRepair(
      snapshot({
        authors: [
          DEMO_AUTHOR,
          { ...DEMO_AUTHOR, id: "a-dup", slug: "Marina-Quintana" },
        ],
      }),
    );
    expect(
      plan.blockers.some((b) => /normalizan al mismo slug/.test(b.reason)),
    ).toBe(true);
  });

  it("un slug de autor con otro nombre bloquea en vez de adjuntar el libro", () => {
    const plan = planAuthorshipRepair(
      snapshot({
        authors: [
          DEMO_AUTHOR,
          {
            id: "a-collision",
            slug: "jorge-quizamanchuro",
            name: "Otra Persona",
            title: null,
            licenseNumber: null,
            bio: null,
            isVerified: false,
          },
        ],
      }),
    );
    expect(plan.blockers.some((b) => /identidad distinta/.test(b.reason))).toBe(
      true,
    );
  });

  it("es idempotente: un catálogo ya reparado no propone nada", () => {
    const plan = planAuthorshipRepair(
      snapshot({
        authors: [
          {
            ...DEMO_AUTHOR,
            title: null,
            licenseNumber: null,
            bio: null,
            isVerified: false,
          },
          {
            id: "a-jorge",
            slug: "jorge-quizamanchuro",
            name: "Jorge Quizamanchuro",
            title: null,
            licenseNumber: null,
            bio: null,
            isVerified: false,
          },
        ],
        books: [
          {
            id: "b-eec",
            slug: "emociones-en-construccion",
            title: "Emociones en Construcción",
            authorId: "a-jorge",
            // Ya retirado por una corrida anterior: el marcador no nombra a
            // nadie, así que el planificador no vuelve a proponer la retirada.
            summary: BOOK_COPY_WITHDRAWAL.summary,
            description: null,
          },
        ],
      }),
    );
    expect(plan.ops).toHaveLength(0);
    expect(plan.satisfied.length).toBeGreaterThan(0);
  });

  it("describePlan no imprime los valores retirados", () => {
    const text = describePlan(freeze());
    expect(text).not.toContain(TITULO_A);
    expect(text).not.toContain(LICENCIA_A);
    expect(text).not.toContain(BIO_A);
    expect(text).not.toContain(SINOPSIS_CON_NOMBRE);
    expect(text).toMatch(/título=presente/);
  });
});

/**
 * El copy, que es la otra mitad de la acreditación.
 *
 * Corregir la clave ajena corrigió la firma y nada más. Estas pruebas fijan
 * QUÉ propone el plan para la prosa, y —tan importante como eso— qué NO
 * propone: una sinopsis que no nombra a nadie es copy editorial legítimo y no
 * se toca.
 */
describe("planAuthorshipRepair · copy que nombra a una identidad de fixture", () => {
  const copyOp = (plan: ReturnType<typeof planAuthorshipRepair>) =>
    plan.ops.find((o) => o.kind === "withdraw-book-copy");

  const withBookCopy = (over: { summary?: string; description?: string }) =>
    planAuthorshipRepair(
      snapshot({
        books: [
          {
            id: "b-eec",
            slug: "emociones-en-construccion",
            title: "Emociones en Construcción",
            authorId: "a-demo",
            summary: over.summary ?? null,
            description: over.description ?? null,
          },
        ],
      }),
    );

  it("propone retirar sólo los campos que la nombran", () => {
    const op = copyOp(
      withBookCopy({
        summary: SINOPSIS_CON_NOMBRE,
        description: "Una descripción que no nombra a nadie.",
      }),
    );
    if (op?.kind !== "withdraw-book-copy") throw new Error("shape");
    expect(op.fields).toEqual(["summary"]);
    expect(op.namedIdentities).toEqual(["marina-quintana"]);
  });

  it("el reemplazo es el marcador declarado, no un vacío ni una reescritura", () => {
    // Vaciar una sinopsis degrada una página legítima por un defecto de una
    // cláusula; reescribirla sería redactar copy que nadie revisó.
    expect(BOOK_COPY_WITHDRAWAL.summary).toMatch(/revisión editorial/);
    expect(BOOK_COPY_WITHDRAWAL.summary.length).toBeGreaterThan(0);
    // Y el marcador no puede nombrar a nadie, o la fila reparada volvería a
    // disparar la misma comprobación que la seleccionó.
    for (const text of Object.values(BOOK_COPY_WITHDRAWAL)) {
      expect(fixtureIdentitiesNamedIn(text)).toEqual([]);
    }
  });

  it("una obra con autoría PENDING también deja de nombrarla", () => {
    // `AUTHORSHIP_PENDING` prohíbe inventar QUIÉN la escribió. Retirar un
    // nombre que ninguna fuente sustenta no inventa nada.
    const plan = planAuthorshipRepair(
      snapshot({
        books: [
          {
            id: "b-fe",
            slug: "familias-ensambladas",
            title: "Familias Ensambladas",
            authorId: "a-demo",
            summary: null,
            description: "Una guía sintética escrita por Marina.",
          },
        ],
      }),
    );
    const op = copyOp(plan);
    if (op?.kind !== "withdraw-book-copy") throw new Error("shape");
    expect(op.bookSlug).toBe("familias-ensambladas");
    expect(op.fields).toEqual(["description"]);
    // Y sigue sin atribuirse a nadie.
    expect(plan.ops.some((o) => o.kind === "reattribute-book")).toBe(false);
  });

  it("no toca el copy que no nombra a nadie", () => {
    expect(
      copyOp(withBookCopy({ summary: "Un recorrido por las seis emociones." })),
    ).toBeUndefined();
  });

  it("una palabra común que coincide en minúsculas no cuenta como nombre", () => {
    // El riesgo real de derivar los nombres del slug: una identidad futura
    // como `luz-blanco` convertiría palabras corrientes en disparadores, y un
    // falso positivo aquí destruye una sinopsis legítima.
    expect(
      copyOp(withBookCopy({ summary: "Un capítulo sobre la vida marina." })),
    ).toBeUndefined();
    // En mayúscula inicial sí: ahí está escrito como nombre propio.
    expect(
      copyOp(withBookCopy({ summary: "Marina lo cuenta en el prólogo." })),
    ).toBeTruthy();
  });

  it("el nombre completo cuenta aunque vaya en minúsculas", () => {
    // Dos tokens en secuencia no son una coincidencia.
    expect(
      copyOp(withBookCopy({ summary: "escrito por marina quintana, 2026." })),
    ).toBeTruthy();
  });

  it("no vuelve a proponerlo sobre una fila ya retirada", () => {
    expect(
      copyOp(withBookCopy({ summary: BOOK_COPY_WITHDRAWAL.summary })),
    ).toBeUndefined();
  });

  it("un snapshot sin la columna se rechaza en vez de dar un catálogo limpio", () => {
    // `readSnapshot` castea el resultado de un `select`, así que un campo
    // olvidado llega como undefined y el compilador no lo ve. Sin esto, el
    // plan diría que no hay copy que retirar.
    const sinColumna = snapshot();
    const books = sinColumna.books.map(({ summary: _omit, ...rest }) => rest);
    expect(() =>
      planAuthorshipRepair({
        ...sinColumna,
        books: books as unknown as CatalogSnapshot["books"],
      }),
    ).toThrow(/SNAPSHOT INCOMPLETO.*books\.summary/s);
  });
});

// ── applier ───────────────────────────────────────────────────────────────

function fakeTx(over: Partial<CatalogSnapshot> = {}) {
  const snap = snapshot(over);
  const authors = snap.authors.map((a) => ({ ...a }));
  const books = snap.books.map((b) => ({ ...b }));
  const writes: string[] = [];

  /**
   * Prisma's `updateMany` semantics, as far as this tool uses them: every key
   * present in the WHERE is an equality condition. Written generically rather
   * than per-field so a new column in the condition is honoured by the mock
   * instead of being silently ignored — a mock that drops a condition turns a
   * compare-and-set into an unconditional write and the test would pass on a
   * guarantee the tool does not have.
   */
  const matches = (row: Record<string, unknown>, where: object) =>
    Object.entries(where).every(([k, v]) => v === undefined || row[k] === v);

  const tx: RepairTx = {
    bookAuthor: {
      // Exact id lookup — the semantics the real `findUnique` has.
      findUnique: vi.fn(async ({ where }) => {
        const a = authors.find((x) => x.id === where.id);
        return a ? { ...a } : null;
      }),
      // Plain list; normalisation is the caller's job, as in production.
      findMany: vi.fn(async () => authors.map((a) => ({ ...a }))),
      updateMany: vi.fn(async ({ where, data }) => {
        const match = authors.filter((a) => matches(a, where));
        for (const a of match) {
          Object.assign(a, data);
          writes.push(`author:${a.id}`);
        }
        return { count: match.length };
      }),
      create: vi.fn(async ({ data }) => {
        const row = {
          id: `a-new-${data.slug}`,
          ...data,
          title: null,
          licenseNumber: null,
          bio: null,
          isVerified: false,
        };
        authors.push(row);
        writes.push(`author:new:${data.slug}`);
        return row;
      }),
    },
    book: {
      findUnique: vi.fn(async ({ where }) => {
        const b = books.find((x) => x.id === where.id);
        return b ? { ...b } : null;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const match = books.filter((b) => matches(b, where));
        for (const b of match) {
          Object.assign(b, data);
          writes.push(`book:${b.id}`);
        }
        return { count: match.length };
      }),
    },
  };
  return { tx, authors, books, writes };
}

describe("applyAuthorshipRepair", () => {
  it("dry-run no escribe nada", async () => {
    const { tx, writes, authors } = fakeTx();
    const res = await applyAuthorshipRepair(tx, freeze());
    expect(res.dryRun).toBe(true);
    expect(res.rowsWritten).toBe(0);
    expect(writes).toHaveLength(0);
    expect(authors.find((a) => a.slug === "marina-quintana")!.isVerified).toBe(
      true,
    );
  });

  it("el dry-run comprueba el libro y guarda su vínculo aunque falte el autor", async () => {
    // El caso del plan inicial: autor destino ausente. Antes salía temprano,
    // sin validar expectAuthorId y sin registrar la reversión del vínculo.
    const { tx } = fakeTx();
    const entries = await collectReversal(tx, freeze());
    const link = entries.find((e) => e.subject.startsWith("book id="));
    expect(link?.restore).toEqual({ authorId: "a-demo" });

    const res = await applyAuthorshipRepair(tx, freeze());
    const bookReversal = res.reversal.find((r) =>
      r.subject.startsWith("book id="),
    );
    expect(bookReversal?.restore).toEqual({ authorId: "a-demo" });
  });

  it("una precondición alterada falla también en dry-run", async () => {
    const plan = freeze();
    const { tx, books } = fakeTx();
    books.find((b) => b.slug === "emociones-en-construccion")!.authorId =
      "a-other";
    await expect(collectReversal(tx, plan)).rejects.toBeInstanceOf(
      RepairConflictError,
    );
    await expect(applyAuthorshipRepair(tx, plan)).rejects.toBeInstanceOf(
      RepairConflictError,
    );
  });

  it("aplicar retira credenciales y copy, crea el autor y reatribuye el libro", async () => {
    const { tx, authors, books, writes } = fakeTx();
    const res = await applyAuthorshipRepair(tx, freeze(), { apply: true });

    const demo = authors.find((a) => a.slug === "marina-quintana")!;
    expect(demo).toMatchObject({
      title: null,
      licenseNumber: null,
      bio: null,
      isVerified: false,
    });
    const jorge = authors.find((a) => a.slug === "jorge-quizamanchuro")!;
    expect(jorge).toMatchObject({
      name: "Jorge Quizamanchuro",
      isVerified: false,
    });
    expect(
      books.find((b) => b.slug === "emociones-en-construccion")!.authorId,
    ).toBe(jorge.id);
    expect(books.find((b) => b.slug === "familias-ensambladas")!.authorId).toBe(
      "a-demo",
    );
    // La sinopsis que nombraba a la identidad de fixture deja de servirse, y
    // sólo ese campo cambia.
    const eec = books.find((b) => b.slug === "emociones-en-construccion")!;
    expect(eec.summary).toBe(BOOK_COPY_WITHDRAWAL.summary);
    expect(eec.description).toBeNull();

    expect(res.rowsWritten).toBe(writes.length);
    // Credenciales · copy de EEC · alta · atribución.
    expect(res.rowsWritten).toBe(4);
  });

  it("la reversión guarda TODO campo que la retirada borra", async () => {
    // Encontrado aplicando el plan contra una base real: la retirada ya
    // borraba `bio` y la preimagen no lo guardaba, así que revertirla habría
    // restaurado una fila distinta de la que reemplazó. Derivado de
    // `WITHDRAWAL` en vez de escrito a mano: el día que la retirada alcance
    // otra columna, esto cae en vez de perderla en silencio.
    const { tx } = fakeTx();
    const res = await applyAuthorshipRepair(tx, freeze(), { apply: true });
    const entry = res.reversal.find((r) =>
      r.subject.startsWith("bookAuthor id="),
    );
    expect(Object.keys(entry!.restore).sort()).toEqual(
      Object.keys(WITHDRAWAL).sort(),
    );
    expect(entry!.restore).toMatchObject({ bio: BIO_A, title: TITULO_A });
  });

  it("la reversión del copy guarda el texto que se reemplaza", async () => {
    const { tx } = fakeTx();
    const res = await applyAuthorshipRepair(tx, freeze(), { apply: true });
    const entry = res.reversal.find((r) =>
      r.subject.startsWith("book copy id="),
    );
    expect(entry!.restore).toEqual({
      summary: SINOPSIS_CON_NOMBRE,
      description: null,
    });
  });

  it("una columna desconocida en el plan no llega a la base", async () => {
    // `loadFrozenPlan` ya rechaza un archivo así, pero el aplicador es el
    // único sitio que escribe y no puede depender de que alguien lo haya
    // validado antes: las claves de la escritura salen del módulo, y el plan
    // sólo elige entre ellas. Sin eso, un nombre de campo salido de un JSON
    // sería una columna en el `data` de Prisma.
    const plan = freeze();
    const op = plan.ops.find((o) => o.kind === "withdraw-book-copy")!;
    (op as unknown as Record<string, unknown>).fields = ["coverArtUrl"];

    const { tx, books, writes } = fakeTx();
    await expect(
      applyAuthorshipRepair(tx, plan, { apply: true }),
    ).rejects.toBeInstanceOf(RepairPreconditionError);
    // Ninguna escritura de libro, y la columna inventada no existe. (El
    // `fakeTx` no revierte: en producción la transacción se encarga de la
    // retirada de credenciales que ya había corrido — eso lo mide el pg-spec.)
    expect(writes.filter((w) => w.startsWith("book:"))).toHaveLength(0);
    const eec = books.find((b) => b.slug === "emociones-en-construccion")!;
    expect(eec).not.toHaveProperty("coverArtUrl");
    expect(eec.summary).toBe(SINOPSIS_CON_NOMBRE);
  });

  it("y tampoco pasa el ensayo: el dry-run rechaza la misma operación", async () => {
    // La simetría que el archivo exige: un ensayo que no comprueba lo que la
    // escritura comprueba no es un ensayo de nada.
    const plan = freeze();
    const op = plan.ops.find((o) => o.kind === "withdraw-book-copy")!;
    (op as unknown as Record<string, unknown>).fields = [];
    const { tx } = fakeTx();
    await expect(collectReversal(tx, plan)).rejects.toBeInstanceOf(
      RepairPreconditionError,
    );
  });

  it("la salida aplicada no incluye los valores retirados", async () => {
    const { tx } = fakeTx();
    const res = await applyAuthorshipRepair(tx, freeze(), { apply: true });
    const body = JSON.stringify(res.applied);
    expect(body).not.toContain(TITULO_A);
    expect(body).not.toContain(LICENCIA_A);
    expect(body).toContain("titlePresent");
    // Los literales viven sólo en la reversión, que es el archivo privado.
    expect(JSON.stringify(res.reversal)).toContain(TITULO_A);
  });

  // ── los contraejemplos que la revisión pidió ────────────────────────────

  it("título A → título B, ambos presentes, se detecta y bloquea", async () => {
    const plan = freeze();
    const { tx, authors, writes } = fakeTx();
    authors.find((a) => a.slug === "marina-quintana")!.title = TITULO_B;

    await expect(
      applyAuthorshipRepair(tx, plan, { apply: true }),
    ).rejects.toBeInstanceOf(RepairConflictError);
    expect(writes).toHaveLength(0);
  });

  it("licencia A → licencia B, ambas presentes, se detecta y bloquea", async () => {
    const plan = freeze();
    const { tx, authors, writes } = fakeTx();
    authors.find((a) => a.slug === "marina-quintana")!.licenseNumber =
      LICENCIA_B;

    await expect(
      applyAuthorshipRepair(tx, plan, { apply: true }),
    ).rejects.toBeInstanceOf(RepairConflictError);
    expect(writes).toHaveLength(0);
  });

  it("si el id pasa a ser otra fila, se detiene por identidad", async () => {
    const plan = freeze();
    const { tx, authors, writes } = fakeTx();
    const row = authors.find((a) => a.id === "a-demo")!;
    row.name = "Otra Persona";

    await expect(
      applyAuthorshipRepair(tx, plan, { apply: true }),
    ).rejects.toThrow(/identidad|es ahora/i);
    expect(writes).toHaveLength(0);
  });

  it("un plan de otro destino no se aplica", async () => {
    const plan = freeze();
    // Simula un plan revisado para otra base.
    const foreign: FrozenPlan = {
      ...plan,
      target: targetIdentityFromUrl(
        "postgresql://u:p@localhost:5433/otra_base",
        "development",
      ),
    };
    // El hash ya no corresponde a (ops, target), que es lo que loadFrozenPlan
    // comprueba; aquí se verifica la aritmética de esa comprobación.
    expect(computePlanHash(foreign.ops, foreign.target)).not.toBe(
      foreign.planHash,
    );
  });

  it("repetir no duplica autores ni vuelve a escribir", async () => {
    const { tx, authors, books, writes } = fakeTx();
    await applyAuthorshipRepair(tx, freeze(), { apply: true });
    const afterFirst = writes.length;

    const repaired: CatalogSnapshot = {
      authors: authors.map((a) => ({ ...a })),
      books: books.map((b) => ({ ...b })),
    };
    const second = await applyAuthorshipRepair(tx, freeze(repaired), {
      apply: true,
    });
    expect(second.rowsWritten).toBe(0);
    expect(writes.length).toBe(afterFirst);
    expect(
      authors.filter((a) => a.slug === "jorge-quizamanchuro"),
    ).toHaveLength(1);
  });

  it("la escritura condicionada falla si el dato cambia tras la comprobación", async () => {
    // Simula la ventana: el updateMany no encuentra la fila con los valores
    // leídos, porque otra operación los cambió en el intervalo.
    const { tx, writes } = fakeTx();
    const plan = freeze();
    const original = tx.bookAuthor.updateMany;
    tx.bookAuthor.updateMany = vi.fn(async () => ({ count: 0 }));

    await expect(
      applyAuthorshipRepair(tx, plan, { apply: true }),
    ).rejects.toBeInstanceOf(RepairConflictError);
    tx.bookAuthor.updateMany = original;
    expect(writes).toHaveLength(0);
  });

  it("un plan con bloqueos no aplica nada", async () => {
    const { tx, writes } = fakeTx();
    const blocked = freeze(
      snapshot({
        authors: [
          DEMO_AUTHOR,
          {
            id: "a-collision",
            slug: "jorge-quizamanchuro",
            name: "Otra Persona",
            title: null,
            licenseNumber: null,
            bio: null,
            isVerified: false,
          },
        ],
      }),
    );
    await expect(
      applyAuthorshipRepair(tx, blocked, { apply: true }),
    ).rejects.toBeInstanceOf(RepairPreconditionError);
    expect(writes).toHaveLength(0);
  });

  it("no hay forma de borrar un autor desde el aplicador", () => {
    const { tx } = fakeTx();
    expect(Object.keys(tx.bookAuthor)).toEqual(
      expect.not.arrayContaining(["delete", "deleteMany"]),
    );
    expect(Object.keys(tx.book)).toEqual(
      expect.not.arrayContaining(["delete", "deleteMany"]),
    );
  });
});
