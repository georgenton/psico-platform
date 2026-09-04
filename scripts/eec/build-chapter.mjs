#!/usr/bin/env node
/**
 * EEC — build de un capítulo desde sus fuentes maestras.
 *
 *   node scripts/eec/build-chapter.mjs --chapter=C01
 *   node scripts/eec/build-chapter.mjs --chapter=C01 --out=artifacts
 *
 * UNA prosa canónica (`chapter.md`, verificada por SHA-256), UN sistema de citas
 * (`citations.json` + BibTeX + CSL) y de ahí salen TODAS las formas: el payload
 * que consume FeelVerse, el DOCX imprimible, el EPUB y el manifiesto con hashes.
 * Ninguna salida es fuente: si algo hay que corregir, se corrige en `content/`.
 *
 * ── Por qué la numeración no se escribe a mano ──────────────────────────────
 *
 * Los números de nota son una función del orden de aparición, no un dato. En
 * cuanto se teclean, impresión y digital pueden divergir sin que nadie lo note.
 * Aquí se generan en un solo sitio (`numberNotes`) y se reparten a las tres
 * salidas, así que o coinciden las tres o no compila ninguna.
 *
 * Sin dependencias nuevas: el DOCX y el EPUB son ZIP con XML, y `zip` ya está en
 * la caja. Pandoc sería más corto, pero añadir un binario al pipeline por dos
 * formatos que caben en 200 líneas no compensa.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import CSL from "citeproc";
import { parseChapter } from "./parse-chapter.mjs";
import {
  bibToCslJson,
  createEngine,
  renderBibliography,
  renderNotes,
} from "./render-csl.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
/** El libro se compone en español; el estilo toma de aquí sus términos. */
const CSL_LOCALE_FILE = "locales-es-ES.xml";

// ── args ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  let chapter = "";
  let out = "artifacts";
  for (const a of argv) {
    if (a.startsWith("--chapter=")) chapter = a.slice(10);
    else if (a.startsWith("--out=")) out = a.slice(6);
  }
  if (!chapter) throw new Error("MISSING_CHAPTER (usa --chapter=C01)");
  return { chapter, out };
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const xml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Markdown en línea → runs. Deliberadamente corto: el manuscrito usa `*cursiva*`
 * y `**negrita**` y nada más. Un parser general aquí sería adivinar necesidades
 * que el texto no tiene.
 */
function inlineRuns(text) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ t: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) runs.push({ t: tok.slice(2, -2), b: true });
    else runs.push({ t: tok.slice(1, -1), i: true });
    last = m.index + tok.length;
  }
  if (last < text.length) runs.push({ t: text.slice(last) });
  return runs.length ? runs : [{ t: text }];
}

// ── citas ──────────────────────────────────────────────────────────────────

/** Citation Keys presentes en el `.bib` (Better BibTeX). */
function bibKeys(bibText) {
  return new Set(
    [...bibText.matchAll(/^@[a-zA-Z]+\{([^,]+),/gm)].map((m) => m[1].trim()),
  );
}

/**
 * Numeración automática, fuente única para las tres salidas.
 *
 * Chicago 18 shortened notes: la PRIMERA aparición de una fuente lleva la nota
 * completa y las siguientes la forma corta. Eso lo decide el orden, así que se
 * calcula aquí una vez y se reparte, en lugar de que cada renderer lo repita y
 * se desincronice.
 */
function numberNotes(citations) {
  const seen = new Set();
  return citations.map((c, i) => ({
    n: i + 1,
    // El identificador estable de la nota. El número visible depende del orden
    // de aparición y cambia si el capítulo se reordena; `noteId` no, y es lo
    // único con lo que impresión, EPUB y FeelVerse pueden hablar de LA MISMA
    // nota. Se perdía justo aquí: `numberNotes` construía objetos nuevos y
    // `note_id` se quedaba en `citations.json`.
    noteId: c.note_id ?? null,
    anchorId: c.anchor_id ?? null,
    citationKey: c.citation_key,
    locator: c.locator ?? null,
    first: !seen.has(c.citation_key) && (seen.add(c.citation_key), true),
  }));
}

/** Validaciones de §9 sobre la capa de referencias. */
function validateCitations(citations, keys, anchors) {
  const problems = [];
  const anchorIds = new Set(
    (anchors?.anchors ?? []).map((a) => a.id ?? a.anchor_id),
  );
  for (const c of citations) {
    if (!c.citation_key) problems.push("CITATION_WITHOUT_KEY");
    else if (!keys.has(c.citation_key))
      problems.push(`CITATION_KEY_NOT_IN_BIB:${c.citation_key}`);
    if (c.locator_required && !c.locator)
      problems.push(`MISSING_LOCATOR:${c.citation_key}`);
    if (c.anchor_id && anchorIds.size && !anchorIds.has(c.anchor_id))
      problems.push(`ANCHOR_NOT_FOUND:${c.anchor_id}`);
  }
  return problems;
}

// ── salidas ────────────────────────────────────────────────────────────────

/**
 * Fecha fija para todo lo que entra en un ZIP.
 *
 * `zip` guarda la fecha de modificación de cada fichero, así que dos builds del
 * mismo capítulo daban archivos con hashes distintos solo por el reloj. Se
 * ancla a la fecha de la versión canónica: el mismo texto produce el mismo
 * DOCX y el mismo EPUB, hoy y dentro de diez años, y el `SHA256SUMS.txt` sirve
 * para lo que existe — comprobar que un fichero es EL fichero.
 */
function stampTimes(dir, when) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) stampTimes(full, when);
    else utimesSync(full, when, when);
  }
  utimesSync(dir, when, when);
}

function zipDir(dir, outFile, firstStored, when) {
  rmSync(outFile, { force: true });
  if (when) stampTimes(dir, when);
  // `mimetype` va sin comprimir y primero: lo exige el spec de EPUB.
  if (firstStored) {
    execFileSync("zip", ["-X0", outFile, firstStored], { cwd: dir });
    execFileSync("zip", ["-Xr9D", outFile, ".", "-x", firstStored], {
      cwd: dir,
    });
  } else {
    execFileSync("zip", ["-Xr9Dq", outFile, "."], { cwd: dir });
  }
}

const DOCX_STYLE_FOR = {
  HEADING: "Heading2",
  QUOTE: "Quote",
  PARAGRAPH: null,
  EXERCISE: "Quote",
  PAUSE: "Quote",
  VIDEO: "Quote",
  IMAGE: "Quote",
  AUDIO: "Quote",
};

function buildDocx(tmp, { title, blocks, notes, bibEntries }) {
  const body = [];
  body.push(
    `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t xml:space="preserve">${xml(title)}</w:t></w:r></w:p>`,
  );
  for (const b of blocks) {
    const style = DOCX_STYLE_FOR[b.kind] ?? null;
    const runs = inlineRuns(b.content)
      .map(
        (r) =>
          `<w:r><w:rPr>${r.b ? "<w:b/>" : ""}${r.i ? "<w:i/>" : ""}</w:rPr>` +
          `<w:t xml:space="preserve">${xml(r.t)}</w:t></w:r>`,
      )
      .join("");
    const sup = (b.notes ?? [])
      .map(
        (n) =>
          `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>${n}</w:t></w:r>`,
      )
      .join("");
    body.push(
      `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${runs}${sup}</w:p>`,
    );
  }
  if (notes.length) {
    body.push(
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Notas</w:t></w:r></w:p>`,
    );
    // El `noteId` viaja en un marcador de Word: invisible en la página,
    // legible por cualquiera que abra el fichero. Sin esto, la nota impresa
    // solo se podría identificar por su número, que es justo lo que cambia.
    notes.forEach((n, i) =>
      body.push(
        `<w:p>${
          n.noteId
            ? `<w:bookmarkStart w:id="${i + 1}" w:name="${xml(n.noteId)}"/><w:bookmarkEnd w:id="${i + 1}"/>`
            : ""
        }<w:r><w:t xml:space="preserve">${xml(`${n.n}. ${n.rendered}`)}</w:t></w:r></w:p>`,
      ),
    );
  }
  body.push(
    `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Bibliografía</w:t></w:r></w:p>`,
  );
  for (const e of bibEntries)
    body.push(
      `<w:p><w:r><w:t xml:space="preserve">${xml(e)}</w:t></w:r></w:p>`,
    );

  mkdirSync(join(tmp, "_rels"), { recursive: true });
  mkdirSync(join(tmp, "word/_rels"), { recursive: true });
  writeFileSync(
    join(tmp, "[Content_Types].xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
  );
  writeFileSync(
    join(tmp, "_rels/.rels"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  writeFileSync(
    join(tmp, "word/_rels/document.xml.rels"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  const st = (id, name, sz, opts = "") =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:pPr><w:spacing w:before="240" w:after="120"/>${opts}</w:pPr><w:rPr><w:sz w:val="${sz}"/></w:rPr></w:style>`;
  writeFileSync(
    join(tmp, "word/styles.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${st("Title", "Title", "48")}${st("Heading2", "heading 2", "32")}${st("Quote", "Quote", "22", '<w:ind w:left="720"/>')}</w:styles>`,
  );
  writeFileSync(
    join(tmp, "word/document.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701"/></w:sectPr></w:body></w:document>`,
  );
}

function buildEpub(
  tmp,
  { title, author, blocks, notes, bibEntries, lang, uid, modified },
) {
  const H = { HEADING: "h2", QUOTE: "blockquote" };
  const html = blocks
    .map((b) => {
      const tag = H[b.kind] ?? "p";
      const cls = ["PARAGRAPH", "HEADING", "QUOTE"].includes(b.kind)
        ? ""
        : ` class="block-${b.kind.toLowerCase()}"`;
      const inner =
        inlineRuns(b.content)
          .map((r) =>
            r.b
              ? `<strong>${xml(r.t)}</strong>`
              : r.i
                ? `<em>${xml(r.t)}</em>`
                : xml(r.t),
          )
          .join("") +
        (b.notes ?? [])
          .map((n) => `<sup><a href="#note-${n}" id="ref-${n}">${n}</a></sup>`)
          .join("");
      return `<${tag}${cls}>${inner}</${tag}>`;
    })
    .join("\n");
  const notesHtml = notes.length
    ? `<h2>Notas</h2><ol>${notes
        .map(
          (n) =>
            // `data-note-id`: el identificador estable acompaña a la nota en el
            // EPUB igual que en el DOCX y en el JSON de FeelVerse.
            `<li id="note-${n.n}"${n.noteId ? ` data-note-id="${xml(n.noteId)}"` : ""}>` +
            `${xml(n.rendered)} <a href="#ref-${n.n}">↩</a></li>`,
        )
        .join("")}</ol>`
    : "";
  const bibHtml = `<h2>Bibliografía</h2>${bibEntries.map((e) => `<p class="bib">${xml(e)}</p>`).join("")}`;

  mkdirSync(join(tmp, "META-INF"), { recursive: true });
  mkdirSync(join(tmp, "OEBPS"), { recursive: true });
  writeFileSync(join(tmp, "mimetype"), "application/epub+zip");
  writeFileSync(
    join(tmp, "META-INF/container.xml"),
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  writeFileSync(
    join(tmp, "OEBPS/style.css"),
    `body{font-family:Georgia,serif;line-height:1.6;margin:1.2em}h1,h2{line-height:1.25}blockquote{margin:1em 0 1em 1.2em;padding-left:.8em;border-left:3px solid #ccc}.bib{text-indent:-1.5em;margin-left:1.5em}sup a{text-decoration:none}`,
  );
  writeFileSync(
    join(tmp, "OEBPS/chapter.xhtml"),
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}"><head><meta charset="utf-8"/><title>${xml(title)}</title><link rel="stylesheet" href="style.css"/></head><body><h1>${xml(title)}</h1>
${html}
${notesHtml}
${bibHtml}
</body></html>`,
  );
  writeFileSync(
    join(tmp, "OEBPS/nav.xhtml"),
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8"/><title>Índice</title></head><body><nav epub:type="toc" id="toc"><h1>Índice</h1><ol><li><a href="chapter.xhtml">${xml(title)}</a></li></ol></nav></body></html>`,
  );
  writeFileSync(
    join(tmp, "OEBPS/content.opf"),
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">urn:uuid:${uid}</dc:identifier><dc:title>${xml(title)}</dc:title><dc:creator>${xml(author)}</dc:creator><dc:language>${lang}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ch" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="ch"/></spine></package>`,
  );
}

/**
 * Un motor de PDF real o nada. Un PDF «casi bien» para imprenta es peor que
 * ninguno.
 *
 * Cada motor se invoca con SUS argumentos. La versión anterior devolvía el
 * primer binario encontrado y lo llamaba siempre con la línea de Pandoc
 * (`--to=pdf -o salida entrada`): con LibreOffice o WeasyPrint delante en el
 * PATH, eso o falla o escribe un fichero que no es el PDF que se pidió.
 * WeasyPrint, además, ni siquiera lee DOCX — solo HTML —, así que aquí no
 * figura como conversor de este build.
 */
const PDF_ENGINES = [
  {
    bin: "pandoc",
    args: (docx, pdf) => [docx, "--to=pdf", "-o", pdf],
    reads: "docx",
  },
  {
    bin: "soffice",
    args: (docx, pdf) => [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      dirname(pdf),
      docx,
    ],
    reads: "docx",
    // LibreOffice nombra la salida como el fuente: hay que moverla al nombre
    // pedido en vez de suponer que `--outdir` acepta un nombre de fichero.
    producesSourceName: true,
  },
  {
    bin: "libreoffice",
    args: (docx, pdf) => [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      dirname(pdf),
      docx,
    ],
    reads: "docx",
    producesSourceName: true,
  },
];

function findPdfEngine() {
  for (const engine of PDF_ENGINES) {
    try {
      execFileSync("which", [engine.bin], { stdio: "pipe" });
      return engine;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

// ── main ───────────────────────────────────────────────────────────────────
export function build({ chapter, out }) {
  const src = join(ROOT, "content/books/eec", chapter);
  const unit = JSON.parse(readFileSync(join(src, "unit.json"), "utf8"));
  const version = unit.canonical_version.match(/_v([\d.]+)_/)?.[1] ?? "1.0";
  // La fecha del cierre editorial, no la del reloj de quien compila.
  const canonicalDate = new Date(
    `${unit.canonical_version.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? "1970-01-01"}T00:00:00Z`,
  );
  const dest = join(ROOT, out, "eec", chapter, `v${version}`);

  const report = {
    chapter,
    canonicalVersion: unit.canonical_version,
    builtAt: new Date().toISOString(),
    checks: {},
    outputs: {},
    blockers: [],
  };

  // 1 · el texto es EL texto.
  const raw = readFileSync(join(src, unit.files.canonical_markdown));
  const actual = sha256(raw);
  report.checks.canonicalSha256 = actual;
  report.checks.canonicalShaMatches = actual === unit.canonical_sha256;
  if (!report.checks.canonicalShaMatches) {
    throw new Error(
      `CANONICAL_SHA_MISMATCH esperado=${unit.canonical_sha256} real=${actual}`,
    );
  }

  const parsed = parseChapter(raw.toString("utf8"), unit.title);
  const blocks = parsed.blocks;
  report.checks.parsedTitle = parsed.title;
  report.checks.titleMatchesUnit = parsed.title === unit.title;
  report.checks.blocks = blocks.length;
  report.checks.blockKinds = blocks.reduce(
    (a, b) => ((a[b.kind] = (a[b.kind] ?? 0) + 1), a),
    {},
  );

  // 2 · referencias: una fuente, un motor, tres salidas.
  const citationsDoc = JSON.parse(
    readFileSync(join(src, unit.files.citations), "utf8"),
  );
  const anchors = JSON.parse(
    readFileSync(join(src, unit.files.anchors), "utf8"),
  );
  const bibPath = join(ROOT, unit.citation_system.bibliography);
  const bibRaw = readFileSync(bibPath);
  const bibText = bibRaw.toString("utf8");
  const keys = bibKeys(bibText);

  // El `.bib` es tan canónico como la prosa cuando la unidad fija su SHA: la
  // bibliografía de un capítulo cerrado no puede cambiar por debajo del build.
  if (unit.citation_system.bibliography_sha256) {
    const bibSha = sha256(bibRaw);
    report.checks.bibliographySha256 = bibSha;
    report.checks.bibliographyShaMatches =
      bibSha === unit.citation_system.bibliography_sha256;
    if (!report.checks.bibliographyShaMatches) {
      throw new Error(
        `BIBLIOGRAPHY_SHA_MISMATCH esperado=${unit.citation_system.bibliography_sha256} real=${bibSha}`,
      );
    }
  }
  if (unit.citation_system.bibliography_entries_expected != null) {
    const expected = unit.citation_system.bibliography_entries_expected;
    report.checks.bibliographyEntriesExpected = expected;
    if (keys.size !== expected) {
      throw new Error(
        `BIBLIOGRAPHY_ENTRY_COUNT_MISMATCH esperado=${expected} real=${keys.size}`,
      );
    }
  }
  const citations = citationsDoc.citations ?? [];

  const problems = validateCitations(citations, keys, anchors);

  // Anclas → bloques. Una ancla de encabezado nombra el HEADING literal, así que
  // la nota cae en ese bloque; el `heading_exact` se coteja contra el texto y una
  // ancla que no exista es un fallo, no una nota que desaparece en silencio.
  const anchorBlock = new Map();
  for (const a of anchors.anchors ?? []) {
    const idx = blocks.findIndex(
      (b) => b.kind === "HEADING" && b.content === a.heading_exact,
    );
    if (idx >= 0) {
      blocks[idx].anchorId = a.anchor_id ?? a.id;
      anchorBlock.set(a.anchor_id ?? a.id, idx);
    }
  }
  for (const c of citations) {
    if (c.anchor_id && !anchorBlock.has(c.anchor_id)) {
      problems.push(`ANCHOR_NOT_IN_TEXT:${c.anchor_id}`);
    }
  }

  // Chicago numera por orden de APARICIÓN. Ordenarlas por el orden del
  // inventario daba llamadas 4,5,6,7,3,1,2… en la página: números correctos
  // sobre las fuentes correctas, y aun así mal.
  const ordered = [...citations].sort(
    (a, b) =>
      (anchorBlock.get(a.anchor_id) ?? Number.MAX_SAFE_INTEGER) -
      (anchorBlock.get(b.anchor_id) ?? Number.MAX_SAFE_INTEGER),
  );
  // Chicago de verdad: el estilo declarado en `unit.json`, procesado por
  // citeproc-js. Antes salía `citationKey, locator`, que no es Chicago ni es
  // una nota — era el nombre de una fila de Zotero.
  const cslItems = bibToCslJson(bibText);
  const engine = createEngine({
    stylePath: join(ROOT, "styles", unit.citation_system.csl_file),
    localePath: join(ROOT, "styles", CSL_LOCALE_FILE),
    items: cslItems,
  });
  const notes = renderNotes(engine, numberNotes(ordered));
  const byAnchor = new Map();
  for (const n of notes) {
    if (!n.anchorId) continue;
    if (!byAnchor.has(n.anchorId)) byAnchor.set(n.anchorId, []);
    byAnchor.get(n.anchorId).push(n.n);
  }
  for (const b of blocks) b.notes = byAnchor.get(b.anchorId) ?? [];

  report.checks.citationKeysInBib = keys.size;
  report.checks.notes = notes.length;
  report.checks.citationProblems = problems;
  report.checks.numberingIsAutomatic = true;
  if (citations.length === 0) {
    report.blockers.push({
      code: "CITATIONS_NOT_MAPPED",
      detail:
        `citations.json llega con \`citations: []\`. Las ${keys.size} Citation Keys existen ` +
        "en el .bib, pero no existe el mapa afirmación → ancla → Zotero Key → localizador, " +
        "así que no hay notas que numerar. No se inventa.",
    });
  }
  if (problems.length) {
    throw new Error(`CITATION_VALIDATION_FAILED: ${problems.join(", ")}`);
  }

  // Bibliografía: el `.bib` del capítulo entero (`bibliography_scope: book`),
  // compuesto y ordenado por el mismo estilo CSL que las notas. Antes era un
  // `author. year. title. journal.` unido con puntos, que no es ningún estilo.
  const bibEntries = renderBibliography(engine, Object.keys(cslItems));
  report.checks.bibliographyEntries = bibEntries.length;
  report.checks.citationStyle = {
    csl: unit.citation_system.csl_file,
    locale: CSL_LOCALE_FILE,
    processor: `citeproc-js ${CSL.PROCESSOR_VERSION}`,
  };

  // 3 · salidas.
  //
  // Se borra lo que ESTE build vuelve a escribir, y solo eso. Antes se hacía
  // `rmSync(dest)` entero, que además de las salidas se llevaba por delante lo
  // que otros procesos dejan en la misma carpeta — la preimagen y la postimagen
  // de producción viven ahí, y una reconstrucción del capítulo las borraba en
  // silencio junto con la evidencia de que se publicó.
  for (const d of ["manifest", "print", "epub", "feelverse"])
    mkdirSync(join(dest, d), { recursive: true });
  for (const f of [
    "feelverse/unit-payload.json",
    "feelverse/chapter.json",
    "manifest/SHA256SUMS.txt",
    "manifest/release.yaml",
    "manifest/build-report.json",
    `print/EEC_${chapter}_PRINT_v${version}_READY.docx`,
    `print/EEC_${chapter}_PRINT_v${version}_READY.pdf`,
    `epub/EEC_${chapter}_v${version}.epub`,
  ])
    rmSync(join(dest, f), { force: true });
  const tmp = join(dest, ".tmp");
  rmSync(tmp, { recursive: true, force: true });

  // 3a · FeelVerse: el payload EXACTO de ingestUnitV2, más el JSON del lector.
  const payload = {
    editionKey: unit.production.editionKey,
    unitKey: unit.production.unitKey,
    title: unit.title,
    summary: null,
    durationMinutes: null,
    placement: unit.placement,
    blocks: blocks.map((b) => ({
      kind: b.kind,
      content: b.content,
      meta: b.notes?.length ? { notes: b.notes } : null,
    })),
  };
  const fvPayload = join(dest, "feelverse/unit-payload.json");
  writeFileSync(fvPayload, JSON.stringify(payload, null, 2) + "\n");
  const fvChapter = join(dest, "feelverse/chapter.json");
  writeFileSync(
    fvChapter,
    JSON.stringify(
      {
        unit_id: unit.unit_id,
        canonical_version: unit.canonical_version,
        canonical_sha256: unit.canonical_sha256,
        title: unit.title,
        placement: unit.placement,
        blocks: payload.blocks.length,
        notes: notes.map((n) => ({
          n: n.n,
          // `noteId` viaja a las tres salidas: el número puede cambiar de
          // capítulo a capítulo o de edición a edición, el identificador no.
          noteId: n.noteId,
          anchorId: n.anchorId,
          citationKey: n.citationKey,
          locator: n.locator,
          rendered: n.rendered,
        })),
        bibliography: bibEntries,
        citation_system: unit.citation_system,
      },
      null,
      2,
    ) + "\n",
  );
  report.outputs.feelverse = [fvPayload, fvChapter].map((p) =>
    relative(ROOT, p),
  );

  // 3b · DOCX.
  const docxTmp = join(tmp, "docx");
  mkdirSync(docxTmp, { recursive: true });
  buildDocx(docxTmp, { title: unit.title, blocks, notes, bibEntries });
  const docx = join(dest, `print/EEC_${chapter}_PRINT_v${version}_READY.docx`);
  zipDir(docxTmp, docx, null, canonicalDate);
  report.outputs.docx = relative(ROOT, docx);

  // 3c · EPUB.
  const epubTmp = join(tmp, "epub");
  mkdirSync(epubTmp, { recursive: true });
  buildEpub(epubTmp, {
    title: unit.title,
    author: "Marina Quintana",
    blocks,
    notes,
    bibEntries,
    lang: "es",
    modified: canonicalDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
    uid:
      unit.canonical_sha256.slice(0, 8) +
      "-0000-5000-8000-" +
      unit.canonical_sha256.slice(8, 20),
  });
  const epub = join(dest, `epub/EEC_${chapter}_v${version}.epub`);
  zipDir(epubTmp, epub, "mimetype", canonicalDate);
  report.outputs.epub = relative(ROOT, epub);

  // 3d · PDF, solo con un motor real.
  const pdfEngine = findPdfEngine();
  if (pdfEngine) {
    const pdf = join(dest, `print/EEC_${chapter}_PRINT_v${version}_READY.pdf`);
    execFileSync(pdfEngine.bin, pdfEngine.args(docx, pdf), { cwd: ROOT });
    if (pdfEngine.producesSourceName) {
      const produced = docx.replace(/\.docx$/, ".pdf");
      if (produced !== pdf && existsSync(produced)) renameSync(produced, pdf);
    }
    if (!existsSync(pdf)) {
      throw new Error(`PDF_ENGINE_PRODUCED_NOTHING:${pdfEngine.bin}`);
    }
    report.outputs.pdf = relative(ROOT, pdf);
    report.checks.pdfEngine = pdfEngine.bin;
  } else {
    report.outputs.pdf = null;
    report.checks.pdfEngine = null;
    report.blockers.push({
      code: "SKIPPED_NO_RELIABLE_PDF_ENGINE",
      detail:
        "Ni pandoc/LaTeX ni LibreOffice en este entorno. El DOCX es válido y abre " +
        "en Word; generar el PDF con un conversor improvisado — o llamando a uno " +
        "real con los argumentos de otro — daría un fichero que parece de imprenta " +
        "y no lo es.",
    });
  }

  rmSync(tmp, { recursive: true, force: true });

  // 4 · manifiesto y hashes.
  const files = [
    ...report.outputs.feelverse,
    report.outputs.docx,
    report.outputs.epub,
    report.outputs.pdf,
  ].filter(Boolean);
  const sums = files
    .map((f) => `${sha256(readFileSync(join(ROOT, f)))}  ${f}`)
    .join("\n");
  writeFileSync(join(dest, "manifest/SHA256SUMS.txt"), sums + "\n");

  const y = (o, ind = "") =>
    Object.entries(o)
      .map(([k, v]) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? `${ind}${k}:\n${y(v, ind + "  ")}`
          : Array.isArray(v)
            ? `${ind}${k}:\n${v.map((x) => `${ind}  - ${x}`).join("\n")}`
            : `${ind}${k}: ${v === null ? "null" : v}`,
      )
      .join("\n");
  writeFileSync(
    join(dest, "manifest/release.yaml"),
    y({
      chapter: unit.unit_id,
      canonical_version: unit.canonical_version,
      canonical_sha256: unit.canonical_sha256,
      title: unit.title,
      built_at: report.builtAt,
      citation_style: `${unit.citation_system.manual} ${unit.citation_system.edition} · ${unit.citation_system.system}`,
      csl: unit.citation_system.csl_file,
      bibliography_entries: bibEntries.length,
      notes: notes.length,
      numbering: unit.citation_system.numbering,
      blocks: blocks.length,
      outputs: files,
      blockers: report.blockers.map((b) => b.code),
    }) + "\n",
  );
  writeFileSync(
    join(dest, "manifest/build-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );

  return { report, dest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { report, dest } = build(parseArgs(process.argv.slice(2)));
    console.log(`OK  ${relative(ROOT, dest)}`);
    console.log(
      `    bloques=${report.checks.blocks} notas=${report.checks.notes} ` +
        `bib=${report.checks.bibliographyEntries} sha=${report.checks.canonicalSha256.slice(0, 12)}…`,
    );
    for (const b of report.blockers) console.log(`    BLOQUEO ${b.code}`);
    process.exit(0);
  } catch (e) {
    console.error(`FALLO  ${e.message}`);
    process.exit(1);
  }
}
