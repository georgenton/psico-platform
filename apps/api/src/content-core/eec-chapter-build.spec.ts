import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * El build de un capítulo EEC, por sus salidas.
 *
 * Tres formatos salen del mismo texto y del mismo mapa de notas: el payload de
 * FeelVerse, el DOCX de imprenta y el EPUB. Lo que estas pruebas vigilan no es
 * que cada uno compile — eso ya lo dice el exit code — sino que los tres digan
 * LO MISMO: misma numeración por orden de aparición y mismo `note_id` estable
 * detrás de cada número. Divergir ahí no rompe ningún build; solo hace que la
 * nota 7 del libro impreso y la 7 de la app dejen de ser la misma nota.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const OUT = ".tmp-eec-build-spec";
const dest = (chapter: string) => join(ROOT, OUT, "eec", chapter, "v1.0");

type Note = {
  n: number;
  noteId: string | null;
  anchorId: string | null;
  citationKey: string;
  locator: string | null;
  rendered: string;
};

async function buildChapter(chapter: string): Promise<void> {
  const mod = await import(
    /* @vite-ignore */ join(ROOT, "scripts/eec/build-chapter.mjs")
  );
  mod.build({ chapter, out: OUT });
}

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const unzip = (archive: string, entry: string): string =>
  execFileSync("unzip", ["-p", archive, entry], {
    maxBuffer: 32 * 1024 * 1024,
  }).toString("utf8");

afterAll(() => rmSync(join(ROOT, OUT), { recursive: true, force: true }));

describe("EEC · un texto, tres salidas", () => {
  it("C01 numera igual en FeelVerse, DOCX y EPUB", async () => {
    await buildChapter("C01");
    const d = dest("C01");
    const chapterJson = readJson<{ notes: Note[] }>(
      join(d, "feelverse/chapter.json"),
    );
    const payload = readJson<{
      blocks: { meta: { notes?: number[] } | null }[];
    }>(join(d, "feelverse/unit-payload.json"));

    // El orden de aparición ES la numeración: 1..N sin huecos ni repeticiones.
    expect(chapterJson.notes.map((n) => n.n)).toEqual(
      chapterJson.notes.map((_, i) => i + 1),
    );

    // Las llamadas que el lector ve en los bloques son exactamente esos números.
    const inPayload = payload.blocks
      .flatMap((b) => b.meta?.notes ?? [])
      .sort((a, b) => a - b);
    expect(inPayload).toEqual(chapterJson.notes.map((n) => n.n));

    // La lista impresa: «1. …», «2. …» en el mismo orden.
    const docx = unzip(
      join(d, "print/EEC_C01_PRINT_v1.0_READY.docx"),
      "word/document.xml",
    );
    // Solo la sección «Notas»: el cuerpo del capítulo también tiene párrafos
    // que empiezan por «1. », y contarlos aquí mediría la actividad del libro
    // en vez de las notas.
    const notesSection = docx.slice(
      docx.indexOf("<w:t>Notas</w:t>"),
      docx.indexOf("<w:t>Bibliografía</w:t>"),
    );
    const printed = [...notesSection.matchAll(/>(\d+)\. [^<]{10,}</g)].map(
      (m) => Number(m[1]),
    );
    expect(printed).toEqual(chapterJson.notes.map((n) => n.n));

    // El EPUB ancla cada nota con el mismo número que la llamada.
    const xhtml = unzip(
      join(d, "epub/EEC_C01_v1.0.epub"),
      "OEBPS/chapter.xhtml",
    );
    const anchors = [...xhtml.matchAll(/<li id="note-(\d+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(anchors).toEqual(chapterJson.notes.map((n) => n.n));
    const calls = [...xhtml.matchAll(/<sup><a href="#note-(\d+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect([...calls].sort((a, b) => a - b)).toEqual(
      chapterJson.notes.map((n) => n.n),
    );
  }, 120_000);

  it("el `note_id` estable llega a las tres salidas", async () => {
    const d = dest("C01");
    const chapterJson = readJson<{ notes: Note[] }>(
      join(d, "feelverse/chapter.json"),
    );
    const citations = readJson<{ citations: { note_id: string }[] }>(
      join(ROOT, "content/books/eec/C01/citations.json"),
    );

    // Ni uno se pierde por el camino, y son los que declaró `citations.json`.
    const ids = chapterJson.notes.map((n) => n.noteId);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
      true,
    );
    expect([...ids].sort()).toEqual(
      citations.citations.map((c) => c.note_id).sort(),
    );

    // El número visible NO es el identificador: la nota 1 de este capítulo no
    // es «N001», porque el orden de aparición y el de resolución difieren. Esa
    // diferencia es justamente lo que hace falta un id estable.
    expect(chapterJson.notes[0].noteId).not.toBe("EEC-C01-N001");

    const docx = unzip(
      join(d, "print/EEC_C01_PRINT_v1.0_READY.docx"),
      "word/document.xml",
    );
    for (const id of ids) expect(docx).toContain(`w:name="${id}"`);

    const xhtml = unzip(
      join(d, "epub/EEC_C01_v1.0.epub"),
      "OEBPS/chapter.xhtml",
    );
    for (const id of ids) expect(xhtml).toContain(`data-note-id="${id}"`);
  });

  it("las notas se componen con el estilo CSL declarado, no con la clave de Zotero", async () => {
    const d = dest("C01");
    const chapterJson = readJson<{
      notes: Note[];
      bibliography: string[];
      citation_system: { csl_file: string };
    }>(join(d, "feelverse/chapter.json"));

    expect(chapterJson.citation_system.csl_file).toBe(
      "chicago-shortened-notes-bibliography.csl",
    );
    for (const note of chapterJson.notes) {
      // Lo que se escribía antes: `EkmanEtAl1969PanCultural, Science…`.
      expect(note.rendered).not.toContain(note.citationKey);
      expect(note.rendered.length).toBeGreaterThan(20);
      // Chicago compone autor y título; las comillas angulares vienen del
      // locale español del estilo.
      expect(note.rendered).toMatch(/«.+»/);
    }
    // Y la bibliografía es la del estilo, no `campo. campo. campo.`.
    expect(chapterJson.bibliography.length).toBeGreaterThan(0);
    expect(
      chapterJson.bibliography.some((e) => /\(\d{4}\)|\d{4}\./.test(e)),
    ).toBe(true);
  });
});

describe("EEC-C02 · el capítulo cerrado del 2026-08-21", () => {
  it("compila desde los bytes canónicos y declara lo que no tiene", async () => {
    await buildChapter("C02");
    const d = dest("C02");
    const report = readJson<{
      checks: Record<string, unknown>;
      blockers: { code: string }[];
    }>(join(d, "manifest/build-report.json"));

    expect(report.checks.canonicalSha256).toBe(
      "f137ee10fb80a3ea91af42d93d7262b98de7101a5eeae37051d765dc12a2188a",
    );
    expect(report.checks.canonicalShaMatches).toBe(true);
    expect(report.checks.bibliographySha256).toBe(
      "c13f040401797329aa3945d6f1358cdf1a67a1b83cf6fc029b31cc7854abd2fa",
    );
    expect(report.checks.bibliographyShaMatches).toBe(true);
    expect(report.checks.citationKeysInBib).toBe(29);
    expect(report.checks.titleMatchesUnit).toBe(true);

    // Cero notas, dicho en voz alta. El capítulo no trae marcadores de cita y
    // ningún encabezado nombra a una autoría: dónde va cada llamada es una
    // decisión de quien escribe, no del build.
    expect(report.checks.notes).toBe(0);
    expect(report.blockers.map((b) => b.code)).toContain(
      "CITATIONS_NOT_MAPPED",
    );

    const payload = readJson<{
      editionKey: string;
      unitKey: string;
      title: string;
      placement: { order: number };
      blocks: unknown[];
    }>(join(d, "feelverse/unit-payload.json"));
    expect(payload.editionKey).toBe("emociones-en-construccion-1e");
    expect(payload.unitKey).toBe("f58df2e8-4203-5aa2-83b0-1a8ab79a885a");
    expect(payload.placement.order).toBe(2);
    expect(payload.title).toBe("¿Existen realmente las emociones universales?");
    expect(payload.blocks.length).toBe(230);
  }, 120_000);

  it("dos builds del mismo texto dan los mismos bytes", async () => {
    // El `SHA256SUMS.txt` solo sirve de algo si el hash depende del texto y no
    // del reloj. DOCX y EPUB son ZIP, y un ZIP guarda la fecha de cada fichero:
    // sin fijarla, dos builds seguidos daban hashes distintos y el manifiesto
    // no probaba nada.
    const d = dest("C02");
    const hash = () =>
      [
        "print/EEC_C02_PRINT_v1.0_READY.docx",
        "epub/EEC_C02_v1.0.epub",
        "feelverse/unit-payload.json",
        "feelverse/chapter.json",
      ].map((f) =>
        createHash("sha256")
          .update(readFileSync(join(d, f)))
          .digest("hex"),
      );
    const first = hash();
    await buildChapter("C02");
    expect(hash()).toEqual(first);
  }, 120_000);

  it("un `.bib` que cambia bajo el capítulo detiene el build", async () => {
    // La prosa está protegida por su SHA desde el primer día; la bibliografía
    // de un capítulo cerrado merece lo mismo. Se comprueba sobre una copia:
    // ni el texto ni el `.bib` reales se tocan.
    const tmpChapter = mkdtempSync(join(ROOT, "content/books/eec/.tmp-spec-"));
    try {
      cpSync(join(ROOT, "content/books/eec/C02"), tmpChapter, {
        recursive: true,
      });
      const unitPath = join(tmpChapter, "unit.json");
      const unit = readJson<{
        citation_system: { bibliography_sha256: string };
      }>(unitPath);
      unit.citation_system.bibliography_sha256 = "0".repeat(64);
      writeFileSync(unitPath, JSON.stringify(unit, null, 2));
      await expect(buildChapter(tmpChapter.split("/").pop()!)).rejects.toThrow(
        /BIBLIOGRAPHY_SHA_MISMATCH/,
      );
    } finally {
      rmSync(tmpChapter, { recursive: true, force: true });
    }
  }, 60_000);
});
