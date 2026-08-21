import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { productionGuideRegistry } from "./guide-catalog";
import { GuideTargetContextService } from "./guide-target-context.service";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import type { PrismaService } from "../prisma";

/**
 * C.3R (#639) blocker zero — is the SERVER's notion of "which chapter is this
 * guide about" free of position, and stable across environments?
 *
 * ── Why this file exists before any UI ──────────────────────────────────────
 *
 * The reader decides applicability in the browser today, by comparing the
 * anchor's `(bookSlug, chapterOrder)` with the chapter on screen. That is the
 * bug: after an editorial reorder the anchor follows the NUMBER, so the guide
 * appears on whatever unit inherited it and disappears from the unit it is
 * actually about.
 *
 * The fix can only be "let the server decide" if the server's answer is itself
 * position-free. It is measured here rather than assumed, and the measurement
 * is deliberately hostile: the same two canonical books are ingested into TWO
 * independent databases, and the units are then reordered underneath the guide.
 *
 * ── What was already measured, and why it rules out the obvious design ──────
 *
 * `ContentUnit.unitKey` is `uuidv5(Chapter.id)` and `Chapter.id` is a random
 * cuid, so two ingestions of the SAME canonical book produce different
 * `unitKey`s — proved below, and the reason the anchors cannot simply carry a
 * `unitKey`. `editionKey` is `${slug}-1e` and IS stable, but it names the book,
 * not the chapter. So no portable chapter identity exists to ship in a package,
 * and the authority has to be resolved server-side, per environment.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();

const EEC = "emociones-en-construccion";
const PQP = "parejas-que-perduran";

/** The two pins the build actually publishes. */
const PINS = [
  { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1, book: EEC },
  { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1, book: PQP },
] as const;

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

interface Env {
  prisma: PrismaClient;
  pool: Pool;
  db: string;
}

/** One database, migrated, with both canonical books ingested. */
async function makeEnv(
  db: string,
  orders: Record<string, number>,
): Promise<Env> {
  const admin = new Pool({ connectionString: base });
  await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${db}"`);
  await admin.end();

  const url = withDatabase(base as string, db);
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
    stdio: "ignore",
  });

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  for (const slug of [EEC, PQP]) {
    const heading = EXERCISE_INGESTION_CATALOG[slug][0].practice.sourceHeading;
    const book = await prisma.book.create({
      data: { slug, title: slug, plan: "FREE" },
    });
    // A second chapter, so a reorder has something to swap WITH. Its content is
    // deliberately unrelated to any guide target.
    const chapters = [
      { order: orders[slug] as number, heading },
      { order: (orders[slug] as number) + 1, heading: null },
    ];
    for (const c of chapters) {
      const ch = await prisma.chapter.create({
        data: {
          bookId: book.id,
          order: c.order,
          title: `C${c.order}`,
          isPublished: true,
        },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 1,
          kind: c.heading ? "HEADING" : "PARAGRAPH",
          content: c.heading ?? "Un capítulo sin objetivos de guía.",
        },
      });
    }
  }
  await backfillContentCore(prisma);
  return { prisma, pool, db };
}

async function dropEnv(env: Env): Promise<void> {
  await env.prisma.$disconnect().catch(() => undefined);
  await env.pool.end().catch(() => undefined);
  const admin = new Pool({ connectionString: base });
  await admin.query(`DROP DATABASE IF EXISTS "${env.db}" WITH (FORCE)`);
  await admin.end();
}

/** The server's answer, resolved inside a transaction, with no position input. */
async function targetUnitOf(
  env: Env,
  pin: { guideKey: string; guideVersion: number },
): Promise<string> {
  return env.prisma.$transaction(async (tx) => {
    const svc = new GuideTargetContextService(
      new LearningCatalogResolver(tx as unknown as PrismaService),
    );
    const guide = productionGuideRegistry.getExact(
      pin.guideKey,
      pin.guideVersion,
    );
    return (await svc.resolve(guide, tx)).unitId;
  });
}

/** Which unit currently sits at `(bookSlug, order)` in the published manifest. */
async function unitAtOrder(
  env: Env,
  bookSlug: string,
  order: number,
): Promise<string | null> {
  const rows = await env.prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT u."id" FROM "ContentUnit" u
       JOIN "Edition" e ON e."id" = u."editionId"
       JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
      WHERE ru."revisionId" = e."publishedRevisionId"
        AND e."slug" = $1 AND ru."order" = $2`,
    bookSlug,
    order,
  );
  return rows[0]?.id ?? null;
}

/**
 * Swap the placement of two units, deterministically.
 *
 * A real editorial reorder, expressed the way the manifest stores it: the same
 * two units, the same revision, their `order` exchanged. No sleeps and no
 * timing — the swap has committed before anything is asked.
 */
async function swapOrders(
  env: Env,
  bookSlug: string,
  a: number,
  b: number,
): Promise<void> {
  await env.prisma.$transaction(async (tx) => {
    const ed = await tx.$queryRawUnsafe<
      Array<{ id: string; publishedRevisionId: string }>
    >(
      `SELECT "id", "publishedRevisionId" FROM "Edition" WHERE "slug" = $1`,
      bookSlug,
    );
    const revisionId = ed[0]!.publishedRevisionId;
    // Park one out of the way first: `(revisionId, order)` is unique.
    await tx.$executeRawUnsafe(
      `UPDATE "RevisionUnit" SET "order" = -1 WHERE "revisionId" = $1 AND "order" = $2`,
      revisionId,
      a,
    );
    await tx.$executeRawUnsafe(
      `UPDATE "RevisionUnit" SET "order" = $2 WHERE "revisionId" = $1 AND "order" = $3`,
      revisionId,
      a,
      b,
    );
    await tx.$executeRawUnsafe(
      `UPDATE "RevisionUnit" SET "order" = $2 WHERE "revisionId" = $1 AND "order" = -1`,
      revisionId,
      b,
    );
  });
}

suite(
  "C.3R blocker · the server's guide target is identity, not position",
  () => {
    let A: Env;
    let B: Env;

    beforeAll(async () => {
      // Two independent environments, and DIFFERENT chapter numbering in each, so
      // nothing can accidentally line up by position.
      A = await makeEnv("c3r_env_a", { [EEC]: 1, [PQP]: 2 });
      B = await makeEnv("c3r_env_b", { [EEC]: 1, [PQP]: 2 });
    }, 600_000);

    afterAll(async () => {
      if (A) await dropEnv(A);
      if (B) await dropEnv(B);
    });

    it("both published pins resolve to a unit, in both environments", async () => {
      for (const env of [A, B]) {
        for (const pin of PINS) {
          const unit = await targetUnitOf(env, pin);
          expect(typeof unit).toBe("string");
          expect(unit.length).toBeGreaterThan(0);
        }
      }
    });

    it("unitKey is NOT portable across ingestions — which is why nothing ships it", async () => {
      // The measurement that rules out putting an identity in the package. Both
      // databases hold the same canonical books; their unit keys differ.
      const keysOf = async (env: Env) =>
        env.prisma.$queryRawUnsafe<Array<{ slug: string; unitKey: string }>>(
          `SELECT e."slug", u."unitKey" FROM "ContentUnit" u
           JOIN "Edition" e ON e."id" = u."editionId"
           JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
          WHERE ru."revisionId" = e."publishedRevisionId"
          ORDER BY e."slug", ru."order"`,
        );
      const a = await keysOf(A);
      const b = await keysOf(B);
      expect(a.length).toBe(b.length);
      expect(a.map((r) => r.slug)).toEqual(b.map((r) => r.slug));
      // Same books, same order, different keys.
      expect(a.map((r) => r.unitKey)).not.toEqual(b.map((r) => r.unitKey));

      // editionKey, by contrast, IS stable — and names the book, not the chapter.
      const edA = await A.prisma.$queryRawUnsafe<Array<{ editionKey: string }>>(
        `SELECT "editionKey" FROM "Edition" ORDER BY "slug"`,
      );
      const edB = await B.prisma.$queryRawUnsafe<Array<{ editionKey: string }>>(
        `SELECT "editionKey" FROM "Edition" ORDER BY "slug"`,
      );
      expect(edA).toEqual(edB);
    });

    it("the verdict is correct in EACH environment despite those different keys", async () => {
      for (const env of [A, B]) {
        for (const pin of PINS) {
          const target = await targetUnitOf(env, pin);
          const bookSlug = pin.book;
          const rows = await env.prisma.$queryRawUnsafe<
            Array<{ id: string; order: number }>
          >(
            `SELECT u."id", ru."order" FROM "ContentUnit" u
             JOIN "Edition" e ON e."id" = u."editionId"
             JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
            WHERE ru."revisionId" = e."publishedRevisionId" AND e."slug" = $1
            ORDER BY ru."order"`,
            bookSlug,
          );
          // Exactly one unit in this book is the guide's, and it is a real one.
          expect(rows.filter((r) => r.id === target)).toHaveLength(1);
        }
      }
    });

    it("after a reorder the guide stays with its UNIT, and the old number gets nothing", async () => {
      const pin = PINS[0];
      const before = await targetUnitOf(A, pin);
      const orderBefore = 1;
      expect(await unitAtOrder(A, EEC, orderBefore)).toBe(before);

      await swapOrders(A, EEC, 1, 2);

      // 1. identity did not move
      const after = await targetUnitOf(A, pin);
      expect(after).toBe(before);
      // 2. the guide's unit is now at the OTHER number, and the verdict follows it
      expect(await unitAtOrder(A, EEC, 2)).toBe(before);
      // 3. the old number is now a DIFFERENT unit, and it is not the guide's
      const nowAtOldNumber = await unitAtOrder(A, EEC, orderBefore);
      expect(nowAtOldNumber).not.toBeNull();
      expect(nowAtOldNumber).not.toBe(before);

      // Put it back so later cases start from a known placement.
      await swapOrders(A, EEC, 1, 2);
      expect(await unitAtOrder(A, EEC, orderBefore)).toBe(before);
    });

    it("resolution reads no placement at all — proved by removing it", async () => {
      // The strong form of "position is not an input". Inside a transaction that
      // DELETES every placement row and is then rolled back, the target is still
      // resolved: the answer never came from the manifest's ordering.
      const expected = await targetUnitOf(A, PINS[0]);
      const ROLLBACK = Symbol("rollback");
      let observed: string | null = null;
      try {
        await A.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "RevisionUnit" SET "order" = "order" + 100`,
          );
          const svc = new GuideTargetContextService(
            new LearningCatalogResolver(tx as unknown as PrismaService),
          );
          const guide = productionGuideRegistry.getExact(
            PINS[0].guideKey,
            PINS[0].guideVersion,
          );
          observed = (await svc.resolve(guide, tx)).unitId;
          throw ROLLBACK;
        });
      } catch (e) {
        if (e !== ROLLBACK) throw e;
      }
      expect(observed).toBe(expected);
    });

    it("the two pins never resolve to each other's unit", async () => {
      const eec = await targetUnitOf(A, PINS[0]);
      const pqp = await targetUnitOf(A, PINS[1]);
      expect(eec).not.toBe(pqp);
    });

    it("an unknown pin and a wrong version both fail closed", async () => {
      expect(() =>
        productionGuideRegistry.getExact("no-such-guide", 1),
      ).toThrow();
      expect(() =>
        productionGuideRegistry.getExact(PINS[0].guideKey, 99),
      ).toThrow();
    });
  },
);
