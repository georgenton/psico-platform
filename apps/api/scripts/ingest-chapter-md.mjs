#!/usr/bin/env node
/**
 * ingest-chapter-md — turn a manuscript chapter (Markdown / plain prose) into
 * ChapterBlocks so it's readable, highlightable and annotatable in the Lector.
 *
 * Handles BOTH conventions:
 *   • Real Markdown: `# H1`, `## H2`, `> quote`, and fenced specials
 *     (:::pausa / :::ejercicio / :::video ... :::).
 *   • Plain prose (how the manuscript actually arrives): first line = chapter
 *     title; short lines without terminal punctuation = section headings;
 *     everything else = paragraphs. Headings that look like activity sections
 *     ("Actividades", "…exploración emocional guiada…") switch the following
 *     paragraphs to EXERCISE blocks so the manuscript's own activities become
 *     interactive cards.
 *
 * Mocks: if the chapter has no PAUSE, one curated breathing pause is injected
 * ~45% through; a "🎬 Video (próximamente)" mock card is appended before the
 * references section — so the full reading flow is visible before videos and
 * bespoke activities are built.
 *
 * Idempotent per chapter: re-running REPLACES the chapter's blocks.
 * ⚠️  Replacing blocks cascade-deletes highlights/annotations anchored to them
 * (they point at block ids). Fine while iterating on the manuscript; avoid
 * re-ingesting chapters real users already marked up.
 *
 * Usage (Railway shell or local with DATABASE_URL):
 *   cd apps/api
 *   node scripts/ingest-chapter-md.mjs --file content/emociones-en-construccion/capitulo-01.md --order 1
 *   node scripts/ingest-chapter-md.mjs --dir content/emociones-en-construccion          # all, order from filename
 *   node scripts/ingest-chapter-md.mjs --file ... --order 1 --dry-run                   # parse preview, no DB
 *   # optional: --book <slug> (default emociones-en-construccion)
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
};
const FILE = flag("file");
const DIR = flag("dir");
const ORDER = flag("order") ? Number(flag("order")) : undefined;
const BOOK_SLUG = flag("book") ?? "emociones-en-construccion";
const DRY_RUN = Boolean(flag("dry-run"));

if (!FILE && !DIR) {
  console.error("Usage: --file <md> --order <n> [--book slug] [--dry-run] | --dir <folder>");
  process.exit(1);
}

// ─── parser ──────────────────────────────────────────────────────────────────

const HEADING_MAX_LEN = 80;
const EXERCISE_HEADING = /actividad|ejercicio|exploraci[oó]n.*guiada|pr[aá]ctica guiada/i;
const REFERENCES_HEADING = /referencias bibliogr/i;
const FENCE = /^:::\s*(pausa|ejercicio|video)\s*$/i;
const FENCE_END = /^:::\s*$/;
const FENCE_KIND = { pausa: "PAUSE", ejercicio: "EXERCISE", video: "VIDEO_MOCK" };

/**
 * A short line without terminal punctuation reads as an implicit section
 * heading — that's how this manuscript separates sections (no `##`).
 */
function isImplicitHeading(line) {
  return (
    line.length > 0 &&
    line.length < HEADING_MAX_LEN &&
    !/[.?!:…;,"”'’)]$/.test(line)
  );
}

const PAUSE_MOCK =
  "Haz una pausa aquí. Suelta el libro un momento, respira profundo tres veces y nota qué se mueve en tu cuerpo con lo que acabas de leer. No hay respuesta correcta — solo observa.";
// Caption for the VIDEO block. No 🎬 prefix / "próximamente" prose — the
// VideoBlock component renders the play frame + "en producción" state itself.
const VIDEO_MOCK = (title) =>
  `Cápsula del capítulo: el autor conversa sobre «${title}».`;
const EXERCISE_MOCK = (heading) =>
  `✍️ Actividad interactiva — próximamente. «${heading}» se convertirá en un ejercicio guiado dentro de la app (con espacio para responder y guardar). Por ahora, léela como una invitación y, si quieres, llévala a tu Diario o conversa con Eco.`;

/**
 * Parse a manuscript file into { title, blocks: [{kind, content}] }.
 *
 * Fidelity first: manuscript prose stays PARAGRAPH; QUOTE/HEADING come from
 * real Markdown or implicit-heading detection. We DON'T convert whole
 * sections to EXERCISE (that would mangle prose-heavy activity sections).
 * Instead, when a heading looks like an activity/guided-reflection, we drop
 * ONE interactive mock card right after it so the EXERCISE block kind is
 * visible and the reader knows where the real activity will land — while the
 * author's text below stays readable prose.
 *
 * VIDEO mocks render as first-class VIDEO blocks (the real player shows an
 * "en producción" placeholder until ops sets `meta.videoUrl`). The caption
 * goes in `content`. `titleFallback` (from titles.json / filename) is used
 * when the first line is too long to be a real chapter title (e.g. a
 * narrative opening).
 */
export function parseChapter(raw, titleFallback) {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim());

  let title = null;
  const blocks = [];
  let fence = null; // active ::: fence kind
  let fenceBuf = [];

  const pushSpecial = (kind, content) => {
    if (!content) return;
    if (kind === "VIDEO_MOCK") blocks.push({ kind: "VIDEO", content });
    else blocks.push({ kind, content });
  };
  const pushHeading = (text) => {
    blocks.push({ kind: "HEADING", content: text });
    if (EXERCISE_HEADING.test(text) && !REFERENCES_HEADING.test(text)) {
      blocks.push({ kind: "EXERCISE", content: EXERCISE_MOCK(text) });
    }
  };
  const takeTitle = (text) => {
    // A real title is short; a long first line is a narrative opening →
    // keep it as the first paragraph and use the fallback title.
    if (text.length <= 120 && !/[.]$/.test(text)) {
      title = text;
      return true;
    }
    return false;
  };

  for (const line of lines) {
    if (!line) continue;

    // ::: fenced specials (forward-compat with curated Markdown).
    if (fence) {
      if (FENCE_END.test(line)) {
        pushSpecial(fence, fenceBuf.join(" "));
        fence = null;
        fenceBuf = [];
      } else fenceBuf.push(line);
      continue;
    }
    const fenceMatch = line.match(FENCE);
    if (fenceMatch) {
      fence = FENCE_KIND[fenceMatch[1].toLowerCase()];
      continue;
    }

    // Explicit Markdown markers.
    if (/^#{1,3}\s+/.test(line)) {
      const text = line.replace(/^#{1,3}\s+/, "");
      if (!title && takeTitle(text)) continue;
      pushHeading(text);
      continue;
    }
    if (/^>\s+/.test(line)) {
      blocks.push({ kind: "QUOTE", content: line.replace(/^>\s+/, "") });
      continue;
    }

    // First non-empty line = chapter title if it's short enough.
    if (title === null) {
      if (takeTitle(line)) continue;
      title = titleFallback ?? "Sin título";
      blocks.push({ kind: "PARAGRAPH", content: line }); // narrative opening
      continue;
    }

    if (isImplicitHeading(line)) {
      pushHeading(line);
      continue;
    }

    blocks.push({ kind: "PARAGRAPH", content: line });
  }

  injectMocks(blocks, title ?? titleFallback ?? "este capítulo");
  return { title: title ?? titleFallback ?? "Sin título", blocks };
}

function injectMocks(blocks, title) {
  // Insert point: right before the references section, else the end.
  let insertAt = blocks.findIndex(
    (b) => b.kind === "HEADING" && REFERENCES_HEADING.test(b.content),
  );
  if (insertAt === -1) insertAt = blocks.length;

  // 🎬 video capsule at the end of the readable body. Ships as a VIDEO block
  // with no meta.videoUrl → the real player renders an "en producción"
  // placeholder until ops uploads the file and sets meta.videoUrl.
  blocks.splice(insertAt, 0, {
    kind: "VIDEO",
    content: VIDEO_MOCK(title),
  });

  // One curated pause ~45% through if the manuscript has none.
  if (!blocks.some((b) => b.kind === "PAUSE")) {
    const mid = Math.max(1, Math.round(blocks.length * 0.45));
    blocks.splice(mid, 0, { kind: "PAUSE", content: PAUSE_MOCK });
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

const TITLE_FLAG = flag("title");

/** Load a JSON sidecar next to the chapter files, if present. */
function loadSidecar(dir, name) {
  try {
    return JSON.parse(readFileSync(join(dir, name), "utf8"));
  } catch {
    return {};
  }
}

function chapterFiles() {
  if (FILE) {
    if (ORDER === undefined || Number.isNaN(ORDER)) {
      console.error("--file requires --order <n>");
      process.exit(1);
    }
    const dir = FILE.replace(/[^/]+$/, "");
    return [
      {
        path: FILE,
        order: ORDER,
        titles: loadSidecar(dir, "titles.json"),
        parts: loadSidecar(dir, "parts.json"),
      },
    ];
  }
  const titles = loadSidecar(DIR, "titles.json");
  const parts = loadSidecar(DIR, "parts.json");
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const m = f.match(/(\d+)/);
      if (!m) return null;
      return { path: join(DIR, f), order: Number(m[1]), titles, parts };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

async function main() {
  const files = chapterFiles();

  let prisma = null;
  let pool = null;
  let book = null;
  if (!DRY_RUN) {
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { default: pg } = await import("pg");
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    book = await prisma.book.findUnique({ where: { slug: BOOK_SLUG } });
    if (!book) {
      console.error(`Book not found: ${BOOK_SLUG}`);
      process.exit(1);
    }
  }

  try {
    for (const { path, order, titles, parts } of files) {
      const raw = readFileSync(path, "utf8");
      const titleFallback =
        (TITLE_FLAG && TITLE_FLAG !== true ? TITLE_FLAG : null) ??
        titles?.[String(order)] ??
        `Capítulo ${order}`;
      const part = parts?.[String(order)] ?? null;
      const partNumber = part?.number ?? null;
      const partTitle = part?.title ?? null;
      const { title, blocks } = parseChapter(raw, titleFallback);
      const words = blocks.reduce((a, b) => a + b.content.split(/\s+/).length, 0);
      const durationMinutes = Math.max(3, Math.round(words / 180));
      const byKind = blocks.reduce((a, b) => {
        a[b.kind] = (a[b.kind] ?? 0) + 1;
        return a;
      }, {});

      const partLabel = partNumber
        ? ` · Parte ${partNumber}${partTitle ? ` · ${partTitle}` : ""}`
        : "";
      console.log(
        `\n[cap ${order}] "${title}"${partLabel} · ${blocks.length} bloques · ~${durationMinutes} min · ${JSON.stringify(byKind)}`,
      );
      if (DRY_RUN) {
        for (const [i, b] of blocks.entries()) {
          console.log(
            `  ${String(i + 1).padStart(3)}. ${b.kind.padEnd(9)} ${b.content.slice(0, 88)}${b.content.length > 88 ? "…" : ""}`,
          );
        }
        continue;
      }

      const chapter = await prisma.chapter.upsert({
        where: { bookId_order: { bookId: book.id, order } },
        create: { bookId: book.id, order, title, durationMinutes, isPublished: true, partNumber, partTitle },
        update: { title, durationMinutes, isPublished: true, partNumber, partTitle },
      });
      await prisma.chapterBlock.deleteMany({ where: { chapterId: chapter.id } });
      await prisma.chapterBlock.createMany({
        data: blocks.map((b, i) => ({
          chapterId: chapter.id,
          order: i + 1,
          kind: b.kind,
          content: b.content,
        })),
      });
      console.log(`  ✓ persisted (chapter ${chapter.id})`);
    }

    if (!DRY_RUN) {
      // Keep the book's totals honest with the real chapter list.
      const chapters = await prisma.chapter.findMany({
        where: { bookId: book.id },
        select: { durationMinutes: true },
      });
      await prisma.book.update({
        where: { id: book.id },
        data: {
          totalChapters: chapters.length,
          durationMinutes: chapters.reduce((a, c) => a + (c.durationMinutes ?? 0), 0),
        },
      });
      console.log(`\n✓ book totals updated (${chapters.length} capítulos)`);
    }
  } finally {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
