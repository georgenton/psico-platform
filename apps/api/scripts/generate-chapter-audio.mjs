/**
 * generate-chapter-audio.mjs — Modo Guía narration pipeline.
 *
 * For each chapter of a book: read its narratable ChapterBlocks, synthesize a
 * spoken narration with OpenAI TTS, upload the mp3 to Cloudflare R2 (public
 * bucket), and upsert the `Audio` row that `LectorService.getAudio()` serves.
 *
 * The output is real, playable audio for Modo Guía. It is a stand-in that can
 * be swapped for professional human recordings later WITHOUT any code change:
 * just re-run this (or a sibling upload script) so the `Audio.fileUrl` points
 * at the new object.
 *
 * Usage (local against prod, or Railway shell):
 *   # env: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   #      R2_BUCKET_NAME, R2_PUBLIC_URL, OPENAI_API_KEY
 *   node scripts/generate-chapter-audio.mjs --dry-run                 # parse + estimate, no TTS/upload/DB
 *   node scripts/generate-chapter-audio.mjs                           # all chapters
 *   node scripts/generate-chapter-audio.mjs --only 1                  # a single chapter
 *   node scripts/generate-chapter-audio.mjs --voice nova --model tts-1-hd
 *
 * Notes:
 *   - R2 is a PUBLIC bucket (covers live there too); getAudio() returns the raw
 *     public URL. So we store the full `${R2_PUBLIC_URL}/${key}` in fileUrl.
 *   - Idempotent per chapter: existing Audio rows for the chapter are deleted
 *     and one fresh row is created. The R2 object key is stable, so re-runs
 *     overwrite the same object.
 *   - Narratable blocks: PARAGRAPH, HEADING, QUOTE, PAUSE. EXERCISE (mock) and
 *     VIDEO (caption) are skipped.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// ─── Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const DRY_RUN = Boolean(flag("dry-run"));
const BOOK_SLUG = flag("book") && flag("book") !== true ? flag("book") : "emociones-en-construccion";
const ONLY = flag("only") && flag("only") !== true ? Number(flag("only")) : null;
const VOICE = flag("voice") && flag("voice") !== true ? flag("voice") : "nova";
const MODEL = flag("model") && flag("model") !== true ? flag("model") : "tts-1";
const CONCURRENCY = 4;
const MAX_CHARS = 3800; // OpenAI TTS hard limit is 4096; stay safely under.
const NARRATABLE = new Set(["PARAGRAPH", "HEADING", "QUOTE", "PAUSE"]);

// ─── Text prep ───────────────────────────────────────────────────────────────
/** Join narratable blocks into one narration string. Headings get a period so
 *  the voice pauses; blocks are separated by blank lines. */
function buildNarration(blocks) {
  const parts = [];
  for (const b of blocks) {
    if (!NARRATABLE.has(b.kind)) continue;
    let text = (b.content ?? "").trim();
    if (!text) continue;
    if (b.kind === "HEADING" && !/[.?!…:]$/.test(text)) text += ".";
    parts.push(text);
  }
  return parts.join("\n\n");
}

/** Split narration into <= MAX_CHARS chunks on paragraph, then sentence
 *  boundaries — never mid-word. */
function chunkText(text) {
  const paras = text.split(/\n\n+/);
  const chunks = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };
  for (const para of paras) {
    if (para.length > MAX_CHARS) {
      // Paragraph too big: split by sentence.
      const sentences = para.match(/[^.!?…]+[.!?…]*\s*/g) ?? [para];
      for (const s of sentences) {
        if ((cur + s).length > MAX_CHARS) push();
        cur += s;
      }
      continue;
    }
    if ((cur + "\n\n" + para).length > MAX_CHARS) push();
    cur += (cur ? "\n\n" : "") + para;
  }
  push();
  return chunks;
}

function wordCount(text) {
  return (text.match(/\S+/g) ?? []).length;
}

// ─── OpenAI TTS ──────────────────────────────────────────────────────────────
async function synthesize(chunk) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      voice: VOICE,
      input: chunk,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TTS ${res.status}: ${body.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Synthesize chunks with bounded concurrency, preserving order. */
async function synthesizeAll(chunks) {
  const out = new Array(chunks.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= chunks.length) return;
      out[i] = await synthesize(chunks[i]);
      process.stdout.write(`    · chunk ${i + 1}/${chunks.length} ok\n`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker),
  );
  return Buffer.concat(out);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  let prisma = null;
  let pool = null;
  let s3 = null;
  if (!DRY_RUN) {
    for (const k of [
      "DATABASE_URL",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_PUBLIC_URL",
      "OPENAI_API_KEY",
    ]) {
      if (!process.env[k]) {
        console.error(`Missing env: ${k}`);
        process.exit(1);
      }
    }
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { default: pg } = await import("pg");
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  try {
    // Chapters — DRY_RUN reads from DB too if DATABASE_URL is set, else needs it.
    if (DRY_RUN && !process.env.DATABASE_URL) {
      console.error("--dry-run still needs DATABASE_URL to read the blocks.");
      process.exit(1);
    }
    if (DRY_RUN && !prisma) {
      const { PrismaClient } = await import("@prisma/client");
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const { default: pg } = await import("pg");
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    }

    const book = await prisma.book.findUnique({
      where: { slug: BOOK_SLUG },
      select: { id: true, title: true },
    });
    if (!book) {
      console.error(`Book not found: ${BOOK_SLUG}`);
      process.exit(1);
    }

    const chapters = await prisma.chapter.findMany({
      where: { bookId: book.id, ...(ONLY ? { order: ONLY } : {}) },
      select: { id: true, order: true, title: true },
      orderBy: { order: "asc" },
    });

    for (const ch of chapters) {
      const blocks = await prisma.chapterBlock.findMany({
        where: { chapterId: ch.id },
        select: { kind: true, content: true, order: true },
        orderBy: { order: "asc" },
      });
      const narration = buildNarration(blocks);
      const chunks = chunkText(narration);
      const words = wordCount(narration);
      const estSec = Math.round((words / 150) * 60); // ~150 wpm Spanish narration
      const key = `audio/${BOOK_SLUG}/cap-${ch.order}.mp3`;

      console.log(
        `\n[cap ${ch.order}] "${ch.title}" · ${narration.length} chars · ${words} words · ${chunks.length} chunk(s) · ~${Math.round(estSec / 60)} min · key=${key}`,
      );

      if (DRY_RUN) continue;

      const buf = await synthesizeAll(chunks);
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: buf,
          ContentType: "audio/mpeg",
        }),
      );

      // Store the R2 object KEY (not a full URL). getAudio() presigns it — R2
      // is not served publicly here, so a raw URL would 403/400.
      await prisma.audio.deleteMany({ where: { chapterId: ch.id } });
      await prisma.audio.create({
        data: {
          chapterId: ch.id,
          title: `Cap. ${ch.order} · ${ch.title}`,
          fileUrl: key,
          durationSeconds: estSec,
          transcription: narration,
        },
      });
      console.log(
        `  ✓ ${(buf.length / 1024 / 1024).toFixed(1)} MB uploaded · Audio row created · key=${key}`,
      );
    }

    console.log(`\n✓ done (${chapters.length} chapter(s))`);
  } finally {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
