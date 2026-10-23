import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AUTHORSHIP_PENDING,
  AUTHORSHIP_SOURCES,
  FIXTURE_AUTHOR_SLUGS,
  RETAINED_BOOKS,
} from "./authorship-sources";

/**
 * A ratchet over the catalogue seed's authorship payloads.
 *
 * ── Why a static check and not a run ──────────────────────────────────────
 *
 * `prisma/seed.ts` executes on import — importing it from a spec would seed
 * whatever `DATABASE_URL` happens to point at. So this reads the source. The
 * behavioural half (seed → repair → seed again, against a real disposable
 * database) lives in `authorship-repair.pg-spec.ts`; neither substitutes for
 * the other.
 *
 * What this pins: the seed may not mint or re-assert a professional claim,
 * and may not re-assert a book's author on `update`. Those two together were
 * the whole defect — the first invented credentials, the second made
 * repairing a row by hand pointless, because the next deploy put it back.
 */

const SEED = readFileSync(
  join(__dirname, "..", "..", "prisma", "seed.ts"),
  "utf8",
);

/**
 * The seed with its comments removed.
 *
 * The rule is about PAYLOADS, not about prose. The comments in that file
 * explain at length why no credential is seeded — and naming the fields it
 * refuses to write is exactly how a reader understands the fix. A check over
 * the raw text would therefore fail on its own documentation and push the
 * next person to delete the explanation to get green.
 */
const SEED_CODE = SEED.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /(^|[^:])\/\/.*$/gm,
  "$1",
);

/** Brace-matched body of every `update: { … }` literal in the seed. */
function updateBlocks(src: string): string[] {
  const out: string[] = [];
  const needle = "update: {";
  let i = src.indexOf(needle);
  while (i !== -1) {
    let depth = 0;
    let j = i + needle.length - 1; // at the '{'
    for (; j < src.length; j += 1) {
      if (src[j] === "{") depth += 1;
      else if (src[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(i, j + 1));
    i = src.indexOf(needle, j);
  }
  return out;
}

describe("prisma/seed.ts · autoría y credenciales", () => {
  it("no siembra ninguna credencial profesional", () => {
    // No licence, no verification flag, no doctoral title — in create or in
    // update. A fixture identity must not arrive accredited.
    // Guard the guard: stripping comments must not have emptied the file.
    expect(SEED_CODE).toMatch(/bookAuthor\.upsert/);
    expect(SEED_CODE).not.toMatch(/licenseNumber/);
    expect(SEED_CODE).not.toMatch(/isVerified/);
    expect(SEED_CODE).not.toMatch(/\bDra?\.\s/);
  });

  it("no reafirma el autor de ningún libro en `update`", () => {
    const blocks = updateBlocks(SEED_CODE);
    // Guard the guard: if the parser stops finding blocks, the assertion
    // below would pass over nothing.
    expect(blocks.length).toBeGreaterThan(5);
    const offending = blocks.filter((b) => /\bauthorId\b/.test(b));
    expect(offending).toEqual([]);
  });

  it("el autor de fixture no se sobrescribe en cada corrida", () => {
    // `update: {}` on the fixture author is what lets a curated or repaired
    // row survive. The pattern mirrors `bootstrap-book` and `author-review`:
    // an author is resolved, never overwritten.
    const idx = SEED.indexOf('where: { slug: "marina-quintana" }');
    expect(idx).toBeGreaterThan(0);
    const region = SEED.slice(idx, idx + 700);
    expect(region).toMatch(/update: \{\}/);
  });

  it("atribuye el libro ancla a su autor de fuente, no al de fixture", () => {
    // On a fresh database EEC must be created under the identifier that the
    // sourced-author resolution produced — not under the fixture identity, and
    // not under some other row. The identifier is read out of the resolution
    // itself instead of being hardcoded here, so renaming the variable does
    // not turn this into a false alarm while still catching a swap.
    const assigned = /(\w+)\s*=\s*created\.id;/.exec(SEED_CODE)?.[1];
    expect(assigned).toBeTruthy();

    const idx = SEED.indexOf('slug: "emociones-en-construccion"');
    expect(idx).toBeGreaterThan(0);
    const region = SEED.slice(idx, idx + 1400);
    expect(region).toMatch(new RegExp(`authorId: ${assigned}\\b`));
    expect(region).not.toMatch(/authorId: fixtureAuthor\.id/);
  });

  it("no adopta una fila homónima por coincidencia de slug", () => {
    // The hazard a plain `upsert` carries: keyed on the slug, it returns
    // whatever row already holds it, so the anchor book would be attributed to
    // a stranger because a string matched. The seed must resolve the row and
    // compare the name before adopting it — and must NOT reach that row
    // through an upsert, which would also rename it on the way in.
    const slug = /SOURCED_AUTHOR_SLUG = "([^"]+)"/.exec(SEED_CODE)?.[1];
    expect(slug).toBeTruthy();

    // Resolution, not creation-by-coincidence.
    expect(SEED_CODE).toMatch(
      /findUnique\(\{\s*where: \{ slug: SOURCED_AUTHOR_SLUG \}/,
    );
    // The adopted row's name has to be checked against the canonical one.
    expect(SEED_CODE).toMatch(/\.name\.trim\(\) === SOURCED_AUTHOR_NAME/);
    // And no upsert may be keyed on that slug, by constant or by literal.
    const upserts = /bookAuthor\.upsert\(\{[\s\S]{0,200}/g;
    for (const [block] of SEED_CODE.matchAll(upserts)) {
      expect(block).not.toMatch(/SOURCED_AUTHOR_SLUG/);
      expect(block).not.toContain(`"${slug}"`);
    }
  });

  it("la sinopsis del libro ancla no arrastra el nombre equivocado", () => {
    // The synopsis used to open with the fixture author's name, so the wrong
    // attribution travelled in editorial copy as well as in the foreign key.
    const idx = SEED.indexOf('slug: "emociones-en-construccion"');
    const region = SEED.slice(idx, idx + 1400);
    const summary = /summary:\s*\n?\s*"([^"]+)"/.exec(region)?.[1] ?? "";
    expect(summary.length).toBeGreaterThan(20);
    expect(summary).not.toMatch(/Marina/);
  });

  it("no renombra la fila de fixture a un autor real", () => {
    // One BookAuthor row can carry several books, so renaming it would
    // silently re-attribute the others and fuse two identities into one.
    const idx = SEED.indexOf('where: { slug: "marina-quintana" }');
    const region = SEED.slice(idx, idx + 700);
    expect(region).not.toMatch(/Quizamanchuro|Jaramillo/);
  });
});

/**
 * Familias Ensambladas — las dos divergencias que la UAT del 2026-10-22
 * encontró entre la landing aprobada y el catálogo servido.
 *
 * La landing la presenta de Jorge Quizamanchuro y «Aún no disponible»; el
 * catálogo la devolvía de «Marina Quintana» —una identidad de fixture— y
 * publicada. Las dos salían del seed, y la segunda se reafirmaba en CADA
 * corrida, de modo que despublicarla era imposible sin tocar este archivo.
 */
describe("prisma/seed.ts · Familias Ensambladas", () => {
  /** El bloque `update: { … }` que pertenece a este libro. */
  const familiasUpdate = (() => {
    const idx = SEED_CODE.indexOf('slug: "familias-ensambladas"');
    const region = SEED_CODE.slice(idx);
    return updateBlocks(region)[0] ?? "";
  })();

  it("no acredita a la identidad de fixture", () => {
    // El defecto original: el catálogo público acreditaba a una identidad de
    // fixture —con nombre de persona— como autora de una obra real. Eso sigue
    // prohibido aquí, con fuente o sin ella. Lo que cambió es cuál es el
    // valor honesto cuando SÍ hay fuente.
    const idx = SEED_CODE.indexOf('slug: "familias-ensambladas"');
    expect(idx).toBeGreaterThan(0);
    const region = SEED_CODE.slice(idx, idx + 1800);
    expect(region).not.toMatch(/authorId: fixtureAuthor\.id/);
    expect(region).not.toMatch(/marina-quintana/);
  });

  it("acredita al autor con fuente, resuelto y no escrito a mano", () => {
    // El 2026-10-13 el valor honesto era ninguno: la nota declaraba la
    // autoría y en la misma frase decía que no autorizaba corregir la fila.
    // La autorización del 2026-10-23 retira ese aplazamiento y la tabla de
    // fuentes ya lleva la obra; seguir sin acreditarla sería el seed
    // contradiciendo a la tabla.
    //
    // Se exige la VARIABLE resuelta, no el nombre literal: escribirlo a mano
    // se saltaría la comprobación de homonimia que la resolución hace — el
    // mismo defecto que esta suite vigila para el libro ancla.
    const idx = SEED_CODE.indexOf('slug: "familias-ensambladas"');
    const region = SEED_CODE.slice(idx, idx + 1800);
    expect(region).toMatch(/authorId: sourcedAuthorId/);
    expect(region).not.toMatch(/authorId: "/);
  });

  it("nace sin publicar, como dice la landing aprobada", () => {
    const idx = SEED_CODE.indexOf('slug: "familias-ensambladas"');
    const region = SEED_CODE.slice(idx, idx + 900);
    expect(region).toMatch(/isPublished: false/);
    expect(region).not.toMatch(/isPublished: true/);
  });

  it("no reafirma su publicación en `update`", () => {
    // Guard the guard: si el parser dejara de encontrar el bloque, la
    // afirmación siguiente pasaría sobre una cadena vacía.
    expect(familiasUpdate).toMatch(/title: "Familias Ensambladas"/);
    expect(familiasUpdate).not.toMatch(/\bisPublished\b/);
  });

  it("tampoco reafirma su autoría en `update`", () => {
    expect(familiasUpdate).not.toMatch(/\bauthorId\b/);
  });
});

describe("authorship-sources · Familias ya tiene fuente en el repositorio", () => {
  it("sale de PENDING cuando la autorización la nombra, y el seed la sigue", () => {
    // La versión anterior fijaba lo contrario y CAYÓ al añadirse la fuente,
    // que es exactamente para lo que se escribió: «si alguien añade la
    // fuente, esta prueba cae y obliga a revisar el seed y el plan de
    // reparación a la vez». Las dos revisiones se hicieron, así que ahora
    // fija el estado nuevo en lugar del viejo.
    const fuente = AUTHORSHIP_SOURCES.find(
      (x) => x.bookSlug === "familias-ensambladas",
    );
    expect(fuente?.authorName).toBe("Jorge Quizamanchuro");
    // La fuente tiene que ser citable, no una afirmación suelta.
    expect(fuente?.source).toMatch(/2026-10-23/);
    expect(AUTHORSHIP_PENDING).not.toContain("familias-ensambladas");
  });

  it("la fuente acredita autoría y nada más", () => {
    // La autorización dice, con todas sus letras, que «no acredita títulos
    // profesionales, licencias, especialidades ni biografías». La forma de la
    // tabla es lo que lo hace cierto: no hay dónde escribirlo.
    const fuente = AUTHORSHIP_SOURCES.find(
      (x) => x.bookSlug === "familias-ensambladas",
    )!;
    expect(Object.keys(fuente).sort()).toEqual(
      ["authorName", "authorSlug", "bookSlug", "bookTitle", "source"].sort(),
    );
  });

  it("la decisión de retenerla es una tabla aparte de la de autoría", () => {
    // Quién escribió una obra y si se ofrece a los lectores son dos
    // afirmaciones con fuentes distintas. Mezclarlas dejaría que una
    // atribución arrastrase una publicación.
    const retenida = RETAINED_BOOKS.find(
      (r) => r.bookSlug === "familias-ensambladas",
    );
    expect(retenida?.source).toMatch(/2026-10-23/);
    expect(Object.keys(retenida!).sort()).toEqual(
      ["bookSlug", "bookTitle", "source"].sort(),
    );
  });

  it("la identidad de fixture sigue declarada como tal", () => {
    expect(FIXTURE_AUTHOR_SLUGS).toContain("marina-quintana");
  });
});
