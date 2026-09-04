/**
 * EEC — notas y bibliografía compuestas con el estilo CSL aprobado.
 *
 * Antes de esto el build escribía `citationKey, locator` y lo etiquetaba
 * «Chicago». No lo era: era una clave de Zotero y una cadena suelta. Aquí entra
 * el procesador CSL de referencia (citeproc-js) con
 * `styles/chicago-shortened-notes-bibliography.csl` — el estilo que declara
 * `unit.json` — y con el locale español, así que lo que sale es lo que ese
 * estilo dicta: nota completa la primera vez, forma corta después, y una
 * bibliografía ordenada por el propio estilo.
 *
 * Determinista por construcción: mismas entradas y mismo orden ⇒ mismas
 * cadenas. Ni fechas de hoy, ni `Intl` dependiente del entorno, ni orden de
 * objetos: los ids se ordenan antes de entrar.
 *
 * ── Qué NO hace ────────────────────────────────────────────────────────────
 *
 * No decide qué se cita ni dónde. Recibe las notas ya resueltas (`note_id`,
 * clave, localizador) y solo las compone. Si `citations.json` trae cero notas,
 * aquí no se inventa ninguna.
 */

import { readFileSync } from "node:fs";
import CSL from "citeproc";

/** BibTeX (Better BibTeX) → CSL-JSON, con los campos que este corpus usa. */
const TYPE_MAP = {
  article: "article-journal",
  book: "book",
  incollection: "chapter",
  inproceedings: "paper-conference",
  mastersthesis: "thesis",
  phdthesis: "thesis",
  misc: "document",
  techreport: "report",
  online: "webpage",
};

/** «Last, First and Last, First» o «{Institución Literal}». */
function parseNames(raw) {
  if (!raw) return [];
  return raw
    .split(/\s+and\s+/i)
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => {
      const literal = n.match(/^\{(.+)\}$/);
      if (literal) return { literal: literal[1].trim() };
      if (n.includes(",")) {
        const [family, given] = n.split(",");
        return { family: family.trim(), given: (given ?? "").trim() };
      }
      const parts = n.split(/\s+/);
      return { family: parts.pop(), given: parts.join(" ") };
    });
}

export function bibToCslJson(bibText) {
  const items = {};
  for (const m of bibText.matchAll(/^@([a-zA-Z]+)\{([^,]+),([\s\S]*?)\n\}/gm)) {
    const [, type, rawKey, body] = m;
    const key = rawKey.trim();
    const field = (name) =>
      body
        .match(
          new RegExp(`\\n\\s*${name}\\s*=\\s*\\{([\\s\\S]*?)\\},?\\s*\\n`, "i"),
        )?.[1]
        ?.replace(/\s+/g, " ")
        .trim() ?? "";
    const strip = (s) => s.replace(/[{}]/g, "").trim();
    const year = field("year") || field("date").slice(0, 4);
    const item = {
      id: key,
      type: TYPE_MAP[type.toLowerCase()] ?? "document",
      title: strip(field("title")),
    };
    const authors = parseNames(field("author"));
    if (authors.length) item.author = authors;
    const editors = parseNames(field("editor"));
    if (editors.length) item.editor = editors;
    const container = field("journal") || field("booktitle");
    if (container) item["container-title"] = strip(container);
    const publisher = field("publisher") || field("school") || field("organization");
    if (publisher) item.publisher = strip(publisher);
    if (field("address")) item["publisher-place"] = strip(field("address"));
    if (field("volume")) item.volume = strip(field("volume"));
    if (field("number")) item.issue = strip(field("number"));
    if (field("pages")) item.page = strip(field("pages")).replace(/--/g, "–");
    if (field("edition")) item.edition = strip(field("edition"));
    if (field("type")) item.genre = strip(field("type"));
    const doi = field("doi").replace(/^https?:\/\/doi\.org\//i, "");
    if (doi) item.DOI = doi;
    if (field("url")) item.URL = field("url");
    if (year) item.issued = { "date-parts": [[Number(year)]] };
    const urldate = field("urldate");
    if (urldate) {
      const [y, mo, d] = urldate.split("-").map(Number);
      if (y) item.accessed = { "date-parts": [[y, mo, d].filter(Boolean)] };
    }
    items[key] = item;
  }
  return items;
}

/**
 * Un localizador Chicago es una página o una sección. El inventario editorial
 * usa el mismo campo, a veces, para la referencia de la revista completa
 * («Social Cognitive and Affective Neuroscience, 12(1), 1–23.»). Pasar eso como
 * `locator` produciría «…, 12(1), 1–23» precedido de «pág.», que dice algo
 * falso. Se distingue: lo que parece página va como localizador; lo demás viaja
 * como sufijo literal, sin fingir que es otra cosa.
 */
export function classifyLocator(locator) {
  if (!locator) return null;
  const t = locator.trim().replace(/\.$/, "");
  if (/^(pp?\.?\s*)?\d+(\s*[–-]\s*\d+)?$/i.test(t)) {
    return { kind: "locator", label: "page", value: t.replace(/^pp?\.?\s*/i, "") };
  }
  if (/^(cap[íi]tulo|cap\.|chap\.)\s*\d+/i.test(t)) {
    return { kind: "locator", label: "chapter", value: t.replace(/^\D+/, "") };
  }
  if (/^§\s*\d+/.test(t)) {
    return { kind: "locator", label: "section", value: t.replace(/^§\s*/, "") };
  }
  return { kind: "suffix", value: locator.trim() };
}

function stripTags(html) {
  return html
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&#38;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&#60;/g, "<")
    .replace(/&#62;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function createEngine({ stylePath, localePath, items }) {
  const style = readFileSync(stylePath, "utf8");
  const locale = readFileSync(localePath, "utf8");
  const sys = {
    retrieveLocale: () => locale,
    retrieveItem: (id) => items[id],
  };
  return new CSL.Engine(sys, style, "es-ES");
}

/**
 * Compone las notas EN SU ORDEN. El orden importa dos veces: fija el número
 * visible y decide qué nota es la primera de su fuente — que es lo único que
 * distingue la forma completa de la corta en este estilo.
 *
 * Devuelve la misma lista de entrada con `rendered` añadido; ni reordena ni
 * renumera, porque el número ya lo calculó el build.
 */
export function renderNotes(engine, notes) {
  const rendered = new Map();
  const pre = [];
  for (const note of notes) {
    const loc = classifyLocator(note.locator);
    const citationItem = { id: note.citationKey };
    if (loc?.kind === "locator") {
      citationItem.locator = loc.value;
      citationItem.label = loc.label;
    } else if (loc?.kind === "suffix") {
      citationItem.suffix = ` ${loc.value}`;
    }
    const citationID = `EEC-NOTE-${note.n}`;
    const cluster = {
      citationID,
      citationItems: [citationItem],
      properties: { noteIndex: note.n },
    };
    const [, updates] = engine.processCitationCluster(cluster, pre.slice(), []);
    for (const [, html, id] of updates) rendered.set(id ?? citationID, html);
    pre.push([citationID, note.n]);
  }
  return notes.map((note) => ({
    ...note,
    rendered: stripTags(rendered.get(`EEC-NOTE-${note.n}`) ?? ""),
  }));
}

/** La bibliografía que dicta el estilo, en su propio orden. */
export function renderBibliography(engine, ids) {
  engine.updateItems([...ids].sort());
  const [, entries] = engine.makeBibliography();
  return entries.map(stripTags).filter(Boolean);
}
