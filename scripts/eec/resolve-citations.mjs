#!/usr/bin/env node
/**
 * EEC — construir el mapa de notas desde las fuentes que ya existen.
 *
 *   node scripts/eec/resolve-citations.mjs --chapter=C01
 *   node scripts/eec/resolve-citations.mjs --chapter=C01 --write
 *
 * Une tres documentos que hoy viven separados y no se hablan:
 *
 *   source-inventory.json   el inventario editorial (instantánea de Notion):
 *                           código, autor, año, DOI, estado, localizador
 *   eec-library.bib         Zotero/Better BibTeX: las Citation Keys
 *   chapter.md + anchors    el texto canónico y sus anclas de encabezado
 *
 * y produce `citations.json`. Todo lo que no se pueda DEMOSTRAR con esos tres
 * queda en el informe UNRESOLVED, no en una nota.
 *
 * ── Qué cuenta como demostrable ─────────────────────────────────────────────
 *
 * Dos uniones, y ninguna es una impresión sobre el sentido del texto:
 *
 *   fuente → citation_key   por DOI idéntico (identificador global), y si no
 *                           hay DOI, por apellido + año + título coincidentes.
 *                           Solo se acepta si el candidato es ÚNICO.
 *
 *   fuente → anchor_id      cuando el encabezado de una sección NOMBRA al autor
 *                           de la fuente. «Paul Ekman: el rostro como pista» no
 *                           es una interpretación de lo que dice el párrafo: es
 *                           el título que el autor le puso a la sección.
 *
 * Lo que NO se hace es deducir el localizador de página, ni colocar una nota en
 * una frase concreta. Eso lo decide quien escribe, en Scrivener, y el protocolo
 * EEC-REF-OPS-001 §4 lo dice: el marcador se inserta en el manuscrito. Mientras
 * no existan esos marcadores, una nota «al principio de la sección de Ekman» no
 * sería la nota del autor sino la mía.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChapter } from "./parse-chapter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const norm = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Entradas del `.bib`, con los campos que sirven para emparejar. */
function parseBib(text) {
  const out = [];
  for (const m of text.matchAll(/^@([a-zA-Z]+)\{([^,]+),([\s\S]*?)\n\}/gm)) {
    const [, type, key, body] = m;
    const f = (n) =>
      body
        .match(
          new RegExp(`\\n\\s*${n}\\s*=\\s*[{"]([\\s\\S]*?)[}"],?\\s*\\n`, "i"),
        )?.[1]
        ?.replace(/\s+/g, " ")
        .replace(/[{}]/g, "")
        .trim() ?? "";
    out.push({
      key: key.trim(),
      type,
      doi: f("doi")
        .replace(/^https?:\/\/doi\.org\//i, "")
        .toLowerCase(),
      title: f("title"),
      author: f("author"),
      year: f("year") || f("date").slice(0, 4),
    });
  }
  return out;
}

/** Apellidos de una lista de autores, en cualquiera de los dos formatos. */
function surnames(author) {
  return author
    .split(/\s+and\s+|;/i)
    .map((a) => {
      const t = a.trim();
      if (t.includes(",")) return norm(t.split(",")[0]);
      const parts = t.split(/\s+/);
      return norm(parts[parts.length - 1]);
    })
    .filter(Boolean);
}

/**
 * fuente → Citation Key. Devuelve el método usado como evidencia, o null.
 * Un empate NO se rompe: dos candidatos son un UNRESOLVED, no una moneda.
 */
function matchKey(src, bib) {
  if (src.DOI) {
    const doi = src.DOI.toLowerCase();
    const hits = bib.filter((b) => b.doi && b.doi === doi);
    if (hits.length === 1)
      return { key: hits[0].key, method: "doi", value: doi };
    if (hits.length > 1) return null;
  }
  const srcSur = surnames(src.Autor ?? "");
  const srcTitle = norm(src.Fuente);
  // Título idéntico primero. La regla de prefijo existe para tolerar subtítulos
  // recortados en el inventario, pero convierte a un título corto en prefijo de
  // uno largo: «Disenfranchised Grief» (1999) empata también con
  // «Disenfranchised Grief: Recognizing Hidden Sorrow» (1989), y dos candidatos
  // se descartan. Cuando UNA entrada coincide exactamente, esa igualdad es la
  // identidad más fuerte disponible y no hay ambigüedad que romper.
  const exact = bib.filter((b) => norm(b.title) && norm(b.title) === srcTitle);
  if (exact.length === 1) {
    return { key: exact[0].key, method: "title-exact", value: exact[0].title };
  }
  const byTitle = bib.filter((b) => {
    const t = norm(b.title);
    return (
      t && (t === srcTitle || t.startsWith(srcTitle) || srcTitle.startsWith(t))
    );
  });
  if (byTitle.length === 1) {
    return { key: byTitle[0].key, method: "title", value: byTitle[0].title };
  }
  // Sin `author+year` como último recurso, deliberadamente. Barrett publicó en
  // 2017 un artículo, un libro y una entrada de blog: apellido y año los
  // colapsan en uno solo y el resultado es una atribución falsa que además
  // parece resuelta. Un DOI o un título son identidades; un año no lo es.
  void srcSur;
  return null;
}

/**
 * Nadie cita dos obras distintas con la misma clave.
 *
 * La comprobación va después de emparejar todo, porque un choque solo se ve
 * mirando el conjunto: cada pareja aislada parecía razonable.
 */
function dropAmbiguous(matched) {
  const byKey = new Map();
  for (const m of matched) {
    if (!m.key) continue;
    byKey.set(m.key.key, (byKey.get(m.key.key) ?? 0) + 1);
  }
  return byKey;
}

/**
 * fuente → ancla, solo cuando un encabezado nombra al autor.
 * Se exige que el apellido aparezca en EXACTAMENTE un encabezado.
 */
function matchAnchor(src, anchors) {
  const srcSur = surnames(src.Autor ?? "");
  const hits = anchors.filter((a) => {
    const h = norm(a.heading_exact ?? "");
    return srcSur.some((s) => s.length > 3 && h.split(" ").includes(s));
  });
  if (hits.length === 1) {
    return {
      anchorId: hits[0].anchor_id,
      method: "heading-names-author",
      value: hits[0].heading_exact,
    };
  }
  return null;
}

/** Un localizador solo cuenta si está cerrado: «pendiente» no es un localizador. */
const PENDING =
  /pendiente|por cotejar|exacta[s]? pendiente|texto completo pendiente/i;
function usableLocator(src) {
  const loc = (src.Localizador ?? "").trim();
  if (!loc || PENDING.test(loc)) return null;
  return loc;
}

export function resolve(chapter) {
  const dir = join(ROOT, "content/books/eec", chapter);
  const inv = JSON.parse(
    readFileSync(join(dir, "source-inventory.json"), "utf8"),
  );
  const anchorsDoc = JSON.parse(
    readFileSync(join(dir, "anchors.json"), "utf8"),
  );
  const unit = JSON.parse(readFileSync(join(dir, "unit.json"), "utf8"));
  const bib = parseBib(
    readFileSync(join(ROOT, unit.citation_system.bibliography), "utf8"),
  );
  const anchors = anchorsDoc.anchors ?? [];

  // Los encabezados del ancla deben existir de verdad en el texto canónico.
  const parsed = parseChapter(
    readFileSync(join(dir, unit.files.canonical_markdown), "utf8"),
    unit.title,
  );
  const headings = new Set(
    parsed.blocks.filter((b) => b.kind === "HEADING").map((b) => b.content),
  );

  const citations = [];
  const unresolved = [];
  let n = 0;

  const claims = dropAmbiguous(
    inv.sources
      .filter((s) => s.Estado !== "DESCARTADA")
      .map((s) => ({ key: matchKey(s, bib) })),
  );

  for (const src of inv.sources) {
    const code = src["Código"];
    if (src.Estado === "DESCARTADA") {
      unresolved.push({
        source_code: code,
        reason: "SOURCE_DISCARDED",
        detail: "La fila está marcada DESCARTADA en el inventario editorial.",
      });
      continue;
    }

    const key = matchKey(src, bib);
    const anchor = matchAnchor(src, anchors);
    const anchorInText = anchor && headings.has(anchor.value) ? anchor : null;

    if (!key) {
      unresolved.push({
        source_code: code,
        reason: "NO_CITATION_KEY",
        detail:
          "Ninguna entrada del .bib coincide de forma única por DOI, título ni autor+año.",
      });
      continue;
    }
    if (!anchor) {
      unresolved.push({
        source_code: code,
        citation_key: key.key,
        reason: "NO_ANCHOR",
        detail:
          "Ningún encabezado del capítulo nombra a esta autoría, y no existe " +
          "marcador de cita en el manuscrito. Dónde va la llamada lo decide " +
          "quien escribe (EEC-REF-OPS-001 §4).",
      });
      continue;
    }
    if (!anchorInText) {
      unresolved.push({
        source_code: code,
        citation_key: key.key,
        reason: "ANCHOR_NOT_IN_CANONICAL_TEXT",
        detail: `El ancla dice «${anchor.value}» y ese encabezado no está en el texto canónico.`,
      });
      continue;
    }

    const locator = usableLocator(src);
    if (claims.get(key.key) > 1 && locator) {
      unresolved.push({
        source_code: code,
        citation_key: key.key,
        reason: "AMBIGUOUS_CITATION_KEY",
        detail:
          "Más de una fuente del inventario cae en esta misma clave; cuál de " +
          "las obras se cita aquí es una decisión editorial, no un empate a resolver.",
      });
      continue;
    }
    // Un artículo se cita entero; un libro necesita página y aquí no la hay.
    const isBook = bib.find((b) => b.key === key.key)?.type === "book";
    if (isBook && !locator) {
      unresolved.push({
        source_code: code,
        citation_key: key.key,
        anchor_id: anchorInText.anchorId,
        reason: "MISSING_LOCATOR_FOR_BOOK",
        detail:
          "Chicago 18 pide localizador para un libro y el inventario lo declara pendiente de cotejo.",
      });
      continue;
    }

    n += 1;
    citations.push({
      note_id: `EEC-${chapter}-N${String(n).padStart(3, "0")}`,
      anchor_id: anchorInText.anchorId,
      citation_key: key.key,
      locator,
      locator_required: isBook,
      source_code: code,
      evidence: {
        citation_key_matched_by: key.method,
        citation_key_evidence: key.value,
        anchor_matched_by: anchorInText.method,
        anchor_evidence: anchorInText.value,
        locator_from: locator ? "source-inventory.Localizador" : null,
        editorial_status: src.Estado,
      },
    });
  }

  return {
    schema_version: "1.0",
    chapter_id: unit.unit_id,
    canonical_version: unit.canonical_version,
    publication_reference_layer: `EEC_${chapter}_PUBREF_v1.0`,
    citation_style: {
      manual: unit.citation_system.manual,
      edition: unit.citation_system.edition,
      system: unit.citation_system.system,
      csl_file: unit.citation_system.csl_file,
      callouts: "superscript",
      numbering: "generated-at-build-time",
      numbering_resets_each_chapter: true,
      bibliography_scope: "book",
    },
    generated_by: "scripts/eec/resolve-citations.mjs",
    generated_at: new Date().toISOString().slice(0, 10),
    citations,
    unresolved,
    summary: {
      sources_in_inventory: inv.sources.length,
      bib_entries: bib.length,
      resolved: citations.length,
      unresolved: unresolved.length,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const chapter =
    process.argv.find((a) => a.startsWith("--chapter="))?.slice(10) ?? "C01";
  const write = process.argv.includes("--write");
  const doc = resolve(chapter);
  if (write) {
    writeFileSync(
      join(ROOT, "content/books/eec", chapter, "citations.json"),
      JSON.stringify(doc, null, 2) + "\n",
    );
  }
  console.log(
    `fuentes=${doc.summary.sources_in_inventory} bib=${doc.summary.bib_entries} ` +
      `resueltas=${doc.summary.resolved} sin resolver=${doc.summary.unresolved}`,
  );
  const by = {};
  for (const u of doc.unresolved) by[u.reason] = (by[u.reason] ?? 0) + 1;
  for (const [r, c] of Object.entries(by)) console.log(`  ${r}: ${c}`);
  if (write) console.log("escrito citations.json");
}
