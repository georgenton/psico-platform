import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { resolveEnvironment } from "../shared/psico-environment";
import { backfillContentCore } from "./backfill";
import { activateBookLearningCatalog } from "./learning-activation";
import { seedPracticeHeadings } from "./test-support/seed-practice-headings";
import { loadManifests } from "./eec-c01-guides-cli";

/**
 * The throwaway environment the browser walkthrough runs against.
 *
 * The five experiences have to be PUBLISHED for anybody to walk them, and the
 * one place that must never happen is production. So this builds an equivalent
 * chapter somewhere else: the same anchors, the same practice headings, the
 * same Content Core backfill, and then the ordinary CLI publishes there.
 *
 * It refuses to run on a deployed box before it opens a connection. A guard
 * that runs after connecting has already told production something.
 *
 *   PSICO_ENV=development DATABASE_URL=… node dist/content-core/eec-c01-e2e-seed.js
 *
 * The prose is filler except the anchor fingerprints, which are the short
 * phrases the manifests already carry: what the guides need from the chapter is
 * that their passage resolves to exactly one block, not the manuscript.
 */

const BOOK = "emociones-en-construccion";
const ROOT = join(process.cwd(), "../..");
const MANIFEST_DIR = join(ROOT, "artifacts/eec/C01/v1.0/feelverse/guides");

export const SEED_REFUSED_ON_DEPLOYED = "EEC_C01_E2E_SEED_REFUSED_ON_DEPLOYED";

async function main(): Promise<void> {
  const env = resolveEnvironment();
  if (env === "production" || env === "staging") {
    throw new Error(SEED_REFUSED_ON_DEPLOYED);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const manifests = loadManifests(MANIFEST_DIR);

  const book = await prisma.book.create({
    data: { slug: BOOK, title: "Emociones en Construcción", plan: "FREE" },
  });
  const chapter = await prisma.chapter.create({
    data: {
      bookId: book.id,
      order: 1,
      title: "¿Realmente sabemos qué es una emoción?",
      isPublished: true,
    },
  });
  await prisma.chapterBlock.create({
    data: {
      chapterId: chapter.id,
      order: 0,
      kind: "PARAGRAPH",
      content:
        "Este capítulo compara varias formas de explicar qué es una emoción.",
    },
  });

  // Each guide's anchor: its heading, then a paragraph carrying its
  // fingerprint. `expectedMatchCount: 1` is only meaningful if there is
  // exactly one of each to count.
  let order = 1;
  for (const m of manifests) {
    for (const a of [m.anchors.primary, m.anchors.secondary]) {
      if (!a) continue;
      await prisma.chapterBlock.create({
        data: {
          chapterId: chapter.id,
          order: order++,
          kind: "HEADING",
          content: a.heading,
        },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: chapter.id,
          order: order++,
          kind: "PARAGRAPH",
          content: `${a.fingerprint} …`,
        },
      });
    }
  }
  await seedPracticeHeadings(prisma, chapter.id, BOOK);

  // The concept catalog names chapters 2 and 3, and the activation is
  // book-wide: without them it refuses the whole run.
  for (const other of [2, 3]) {
    const ch = await prisma.chapter.create({
      data: {
        bookId: book.id,
        order: other,
        title: `Capítulo ${other}`,
        isPublished: true,
      },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "Contenido.",
      },
    });
  }

  // Parejas as well: the shipped catalog's PUBLISHED claims are resolved as a
  // set, so one definition that cannot be placed refuses binding writes in
  // every chapter, this one included.
  const pqp = await prisma.book.create({
    data: {
      slug: "parejas-que-perduran",
      title: "Parejas que Perduran",
      plan: "FREE",
    },
  });
  for (const o of [1, 2]) {
    const ch = await prisma.chapter.create({
      data: { bookId: pqp.id, order: o, title: `PQP ${o}`, isPublished: true },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "Contenido.",
      },
    });
    if (o === 2)
      await seedPracticeHeadings(prisma, ch.id, "parejas-que-perduran");
  }

  await backfillContentCore(prisma);
  await activateBookLearningCatalog(prisma, "parejas-que-perduran");

  console.log(
    JSON.stringify(
      { seeded: true, environment: env, bookSlug: BOOK, chapterOrder: 1 },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
  await pool.end();
}

/* c8 ignore start — process wiring */
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
/* c8 ignore stop */
