import { describe, expect, it, vi } from "vitest";

import {
  describePlan,
  planAuthorshipRepair,
  type CatalogSnapshot,
} from "./authorship-repair";
import {
  applyAuthorshipRepair,
  RepairPreconditionError,
  type RepairTx,
} from "./authorship-repair-apply";
import {
  AUTHORSHIP_PENDING,
  AUTHORSHIP_SOURCES,
  FIXTURE_AUTHOR_SLUGS,
} from "./authorship-sources";

/**
 * Planning and applying the authorship repair.
 *
 * These are unit tests over a snapshot and a fake transaction: they pin the
 * DECISIONS and the refusals. They are NOT evidence that a write lands in
 * PostgreSQL — `authorship-repair.pg-spec.ts` does that against a real
 * disposable database, and the two are deliberately not interchangeable.
 */

const DEMO_AUTHOR = {
  id: "a-demo",
  slug: "marina-quintana",
  name: "Marina Quintana",
  title: "Un título profesional cualquiera",
  licenseNumber: "XX-0000",
  isVerified: true,
};

/** A third party's row: real credentials, nothing to do with this file. */
const OTHER_AUTHOR = {
  id: "a-other",
  slug: "alguien-mas",
  name: "Alguien Más",
  title: "Su título",
  licenseNumber: "YY-1111",
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
    },
    {
      id: "b-fe",
      slug: "familias-ensambladas",
      title: "Familias Ensambladas",
      authorId: "a-demo",
    },
  ],
  ...over,
});

describe("authorship sources", () => {
  it("sólo acredita autoría editorial, nunca una credencial profesional", () => {
    // The shape of the table is the guarantee: there is no field in which a
    // title, a licence or a verification flag could travel.
    for (const s of AUTHORSHIP_SOURCES) {
      expect(Object.keys(s).sort()).toEqual(
        ["authorName", "authorSlug", "bookSlug", "bookTitle", "source"].sort(),
      );
      expect(s.source.length).toBeGreaterThan(20);
    }
  });

  it("no extrapola a los libros sin fuente", () => {
    const sourced = AUTHORSHIP_SOURCES.map((s) => s.bookSlug);
    for (const pending of AUTHORSHIP_PENDING) {
      expect(sourced).not.toContain(pending);
    }
  });

  it("no publica la credencial inventada que viene a retirar", () => {
    // This repository is public. Pinning the literal licence string in the
    // file that removes it would publish the very thing being withdrawn.
    const files = [
      JSON.stringify(AUTHORSHIP_SOURCES),
      JSON.stringify(FIXTURE_AUTHOR_SLUGS),
    ].join(" ");
    expect(files).not.toMatch(/EC-PSI/i);
    expect(files).not.toMatch(/Dra\.|Dr\./);
  });
});

describe("planAuthorshipRepair", () => {
  it("retira las credenciales sin fuente del autor de fixture", () => {
    const plan = planAuthorshipRepair(snapshot());
    const op = plan.ops.find((o) => o.kind === "withdraw-author-credentials");
    expect(op).toBeDefined();
    if (op?.kind !== "withdraw-author-credentials") throw new Error("shape");
    expect(op.authorSlug).toBe("marina-quintana");
    expect(op.next).toEqual({
      title: null,
      licenseNumber: null,
      isVerified: false,
    });
    // Expectations are structural, never the literal value.
    expect(op.expect).toEqual({
      hasTitle: true,
      hasLicense: true,
      isVerified: true,
    });
  });

  it("no toca al autor ajeno ni sus credenciales", () => {
    const plan = planAuthorshipRepair(snapshot());
    const touched = JSON.stringify(plan.ops);
    expect(touched).not.toContain("a-other");
    expect(touched).not.toContain("alguien-mas");
    expect(plan.untouched.map((u) => u.subject)).toContain("autor alguien-mas");
  });

  it("atribuye EEC a su autor de fuente, creando la fila que falta", () => {
    const plan = planAuthorshipRepair(snapshot());
    const create = plan.ops.find((o) => o.kind === "create-author");
    const attr = plan.ops.find((o) => o.kind === "reattribute-book");
    if (create?.kind !== "create-author") throw new Error("falta el alta");
    if (attr?.kind !== "reattribute-book")
      throw new Error("falta la atribución");
    expect(create.authorSlug).toBe("jorge-quizamanchuro");
    expect(create.authorName).toBe("Jorge Quizamanchuro");
    expect(attr.bookSlug).toBe("emociones-en-construccion");
    expect(attr.expectAuthorId).toBe("a-demo");
  });

  it("no reasigna el otro libro del autor antiguo", () => {
    // Familias Ensambladas also points at the demo row. Repairing EEC must not
    // drag it along: no document attributes it to anyone.
    const plan = planAuthorshipRepair(snapshot());
    const reattributed = plan.ops
      .filter((o) => o.kind === "reattribute-book")
      .map((o) => (o.kind === "reattribute-book" ? o.bookSlug : ""));
    expect(reattributed).not.toContain("familias-ensambladas");
    expect(
      plan.untouched.find((u) => u.subject.includes("familias-ensambladas"))
        ?.note,
    ).toMatch(/AUTHORSHIP_SOURCE = PENDING/);
  });

  it("un libro sin fila en este entorno deja su atribución preparada, no bloqueada", () => {
    // `parejas-que-perduran` has a source but no row in staging. That is not a
    // blocker: there is simply nothing to repair yet.
    const plan = planAuthorshipRepair(snapshot());
    expect(plan.blockers).toHaveLength(0);
    expect(
      plan.untouched.some((u) => u.subject.includes("parejas-que-perduran")),
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
            isVerified: false,
          },
        ],
      }),
    );
    expect(plan.blockers).toHaveLength(1);
    expect(plan.blockers[0]!.reason).toMatch(/identidad distinta/);
    expect(plan.ops.some((o) => o.kind === "reattribute-book")).toBe(false);
  });

  it("no duplica el autor por mayúsculas o espacios en el slug", () => {
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
            isVerified: false,
          },
        ],
      }),
    );
    expect(plan.ops.some((o) => o.kind === "create-author")).toBe(false);
  });

  it("es idempotente: un catálogo ya reparado no propone nada", () => {
    const plan = planAuthorshipRepair(
      snapshot({
        authors: [
          {
            ...DEMO_AUTHOR,
            title: null,
            licenseNumber: null,
            isVerified: false,
          },
          {
            id: "a-jorge",
            slug: "jorge-quizamanchuro",
            name: "Jorge Quizamanchuro",
            title: null,
            licenseNumber: null,
            isVerified: false,
          },
        ],
        books: [
          {
            id: "b-eec",
            slug: "emociones-en-construccion",
            title: "Emociones en Construcción",
            authorId: "a-jorge",
          },
        ],
      }),
    );
    expect(plan.ops).toHaveLength(0);
    expect(plan.satisfied.length).toBeGreaterThan(0);
  });

  it("dos filas con el mismo slug de libro bloquean por ambigüedad", () => {
    const plan = planAuthorshipRepair(
      snapshot({
        books: [
          {
            id: "b1",
            slug: "emociones-en-construccion",
            title: "A",
            authorId: null,
          },
          {
            id: "b2",
            slug: "emociones-en-construccion",
            title: "B",
            authorId: null,
          },
        ],
      }),
    );
    expect(
      plan.untouched.some((u) => /no se puede identificar/.test(u.note)),
    ).toBe(true);
    expect(plan.ops.some((o) => o.kind === "reattribute-book")).toBe(false);
  });

  it("describePlan enumera operaciones, intactos y bloqueos", () => {
    const text = describePlan(planAuthorshipRepair(snapshot()));
    expect(text).toMatch(/OPERACIONES PROPUESTAS: \d+/);
    expect(text).toMatch(/INTACTO: \d+/);
    expect(text).toMatch(/BLOQUEOS: 0/);
  });
});

// ── applier ───────────────────────────────────────────────────────────────

function fakeTx(over: Partial<CatalogSnapshot> = {}) {
  const snap = snapshot(over);
  const authors = snap.authors.map((a) => ({ ...a }));
  const books = snap.books.map((b) => ({ ...b }));
  const writes: string[] = [];
  const tx: RepairTx = {
    bookAuthor: {
      findUnique: vi.fn(async ({ where }) => {
        const found = authors.find(
          (a) =>
            (where.id !== undefined && a.id === where.id) ||
            (where.slug !== undefined &&
              a.slug.trim().toLowerCase() === where.slug.trim().toLowerCase()),
        );
        return found ? { ...found } : null;
      }),
      update: vi.fn(async ({ where, data }) => {
        const a = authors.find((x) => x.id === where.id)!;
        Object.assign(a, data);
        writes.push(`author:${where.id}`);
        return a;
      }),
      create: vi.fn(async ({ data }) => {
        const row = {
          id: `a-new-${data.slug}`,
          ...data,
          title: null,
          licenseNumber: null,
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
      update: vi.fn(async ({ where, data }) => {
        const b = books.find((x) => x.id === where.id)!;
        b.authorId = data.authorId;
        writes.push(`book:${where.id}`);
        return b;
      }),
    },
  };
  return { tx, authors, books, writes };
}

describe("applyAuthorshipRepair", () => {
  it("dry-run no escribe nada", async () => {
    const { tx, writes, authors } = fakeTx();
    const plan = planAuthorshipRepair(snapshot());
    const res = await applyAuthorshipRepair(tx, plan); // sin `apply`
    expect(res.dryRun).toBe(true);
    expect(res.rowsWritten).toBe(0);
    expect(writes).toHaveLength(0);
    // The credentials are still there: nothing was touched.
    expect(authors.find((a) => a.slug === "marina-quintana")!.isVerified).toBe(
      true,
    );
  });

  it("aplicar retira credenciales, crea el autor y reatribuye el libro", async () => {
    const { tx, authors, books, writes } = fakeTx();
    const plan = planAuthorshipRepair(snapshot());
    const res = await applyAuthorshipRepair(tx, plan, { apply: true });

    const demo = authors.find((a) => a.slug === "marina-quintana")!;
    expect(demo.title).toBeNull();
    expect(demo.licenseNumber).toBeNull();
    expect(demo.isVerified).toBe(false);

    const jorge = authors.find((a) => a.slug === "jorge-quizamanchuro")!;
    expect(jorge.name).toBe("Jorge Quizamanchuro");
    // The new row carries no credentials at all.
    expect(jorge.title).toBeNull();
    expect(jorge.isVerified).toBe(false);

    expect(
      books.find((b) => b.slug === "emociones-en-construccion")!.authorId,
    ).toBe(jorge.id);
    // Familias Ensambladas stays where it was.
    expect(books.find((b) => b.slug === "familias-ensambladas")!.authorId).toBe(
      "a-demo",
    );
    expect(res.rowsWritten).toBe(writes.length);
    expect(res.rowsWritten).toBe(3);
  });

  it("conserva los metadatos previos para poder revertir", async () => {
    const { tx } = fakeTx();
    const plan = planAuthorshipRepair(snapshot());
    const res = await applyAuthorshipRepair(tx, plan, { apply: true });
    const authorReversal = res.reversal.find((r) =>
      r.subject.startsWith("bookAuthor id="),
    );
    expect(authorReversal?.restore).toMatchObject({ isVerified: true });
    const bookReversal = res.reversal.find((r) =>
      r.subject.startsWith("book id="),
    );
    expect(bookReversal?.restore).toEqual({ authorId: "a-demo" });
  });

  it("repetir no duplica autores ni vuelve a escribir", async () => {
    const { tx, authors, writes } = fakeTx();
    await applyAuthorshipRepair(tx, planAuthorshipRepair(snapshot()), {
      apply: true,
    });
    const afterFirst = writes.length;

    // Re-plan from the repaired state, exactly as a second run would.
    const repaired: CatalogSnapshot = {
      authors: authors.map((a) => ({ ...a })),
      books: [
        {
          id: "b-eec",
          slug: "emociones-en-construccion",
          title: "Emociones en Construcción",
          authorId: authors.find((a) => a.slug === "jorge-quizamanchuro")!.id,
        },
        {
          id: "b-fe",
          slug: "familias-ensambladas",
          title: "Familias Ensambladas",
          authorId: "a-demo",
        },
      ],
    };
    const second = await applyAuthorshipRepair(
      tx,
      planAuthorshipRepair(repaired),
      { apply: true },
    );
    expect(second.rowsWritten).toBe(0);
    expect(writes.length).toBe(afterFirst);
    expect(
      authors.filter((a) => a.slug === "jorge-quizamanchuro"),
    ).toHaveLength(1);
  });

  it("un cambio concurrente en el autor detiene la aplicación sin escribir", async () => {
    const { tx, authors, writes } = fakeTx();
    const plan = planAuthorshipRepair(snapshot());
    // Somebody curated the row between planning and applying.
    authors.find((a) => a.slug === "marina-quintana")!.isVerified = false;

    await expect(
      applyAuthorshipRepair(tx, plan, { apply: true }),
    ).rejects.toBeInstanceOf(RepairPreconditionError);
    expect(writes).toHaveLength(0);
  });

  it("un authorId inesperado en el libro detiene la aplicación", async () => {
    const { tx, books } = fakeTx();
    const plan = planAuthorshipRepair(snapshot());
    books.find((b) => b.slug === "emociones-en-construccion")!.authorId =
      "a-someone-else";

    await expect(
      applyAuthorshipRepair(tx, plan, { apply: true }),
    ).rejects.toBeInstanceOf(RepairPreconditionError);
  });

  it("un plan con bloqueos no aplica nada", async () => {
    const { tx, writes } = fakeTx();
    const blocked = planAuthorshipRepair(
      snapshot({
        authors: [
          DEMO_AUTHOR,
          {
            id: "a-collision",
            slug: "jorge-quizamanchuro",
            name: "Otra Persona",
            title: null,
            licenseNumber: null,
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

  it("nunca borra un autor ni cambia un slug", async () => {
    const { tx } = fakeTx();
    const plan = planAuthorshipRepair(snapshot());
    await applyAuthorshipRepair(tx, plan, { apply: true });
    // The fake transaction exposes no delete at all: the applier has no way to
    // remove a row even if it wanted to. And no op carries a slug change.
    expect(Object.keys(tx.bookAuthor)).toEqual(
      expect.not.arrayContaining(["delete", "deleteMany"]),
    );
    const payloads = JSON.stringify(plan.ops);
    expect(payloads).not.toMatch(/"slug":\s*"emociones/);
  });
});
