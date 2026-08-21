import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { productionGuideRegistry } from "./guide-catalog";
import type { GuideDefinition } from "@psico/types";
import { GuideTargetContextService } from "./guide-target-context.service";
import {
  GuideReaderApplicabilityService,
  GuideReaderContextStaleError,
} from "./guide-reader-applicability.service";
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
    /** The ONE authority, built per transaction by the helper below. */
    let targetContext: GuideTargetContextService;

    beforeAll(async () => {
      // Two independent environments, and DIFFERENT chapter numbering in each, so
      // nothing can accidentally line up by position.
      A = await makeEnv("c3r_env_a", { [EEC]: 1, [PQP]: 2 });
      B = await makeEnv("c3r_env_b", { [EEC]: 1, [PQP]: 2 });
      // Constructed once; every call threads the caller's transaction, so the
      // instance holds no snapshot of its own.
      targetContext = new GuideTargetContextService(
        new LearningCatalogResolver(A.prisma as unknown as PrismaService),
      );
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

    it("resolve() and resolveMany([pin]) give byte-identical answers", async () => {
      // After the refactor these SHARE a core, so this is a delegation ratchet
      // rather than independent evidence: it fails the moment someone gives
      // the single-pin path an implementation of its own again. The evidence
      // that the rules are RIGHT lives in the adversarial cases below.
      for (const env of [A, B]) {
        const pins = PINS.map((p) => ({
          guideKey: p.guideKey,
          guideVersion: p.guideVersion,
        }));
        const many = await env.prisma.$transaction((tx) =>
          targetContext.resolveMany(pins, tx),
        );
        for (const [i, pin] of PINS.entries()) {
          const one = await targetUnitOf(env, pin);
          const r = many[i]!;
          expect(r.ok).toBe(true);
          if (r.ok) expect(r.context.unitId).toBe(one);
        }
      }
    });

    it("every pin the registry can return resolves — the enumeration ratchet", async () => {
      // Kept as a ratchet: a definition added to the build whose targets are
      // not ingested would surface here rather than as an inert card.
      const pins = PINS.map((p) => ({
        guideKey: p.guideKey,
        guideVersion: p.guideVersion,
      }));
      const results = await A.prisma.$transaction((tx) =>
        targetContext.resolveMany(pins, tx),
      );
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it("the batch cost is independent of cardinality — 25 DISTINCT pins", async () => {
      // Repeating two pins to reach 25 would measure deduplication, not
      // scaling. These are 25 distinct definitions over 25 distinct target
      // sets, supplied through the registry seam.
      const synthetic = (n: number): GuideDefinition[] =>
        Array.from({ length: n }, (_, i) => ({
          ...productionGuideRegistry.getExact(
            PINS[0].guideKey,
            PINS[0].guideVersion,
          ),
          guideKey: `synthetic-${i}`,
          guideVersion: 1,
          steps: [
            {
              kind: "CONCEPT_EXPLORATION",
              stepKey: `s-${i}`,
              conceptKey: `synthetic-concept-${i}`,
            },
          ],
        })) as unknown as GuideDefinition[];

      const count = async (n: number): Promise<number> => {
        const defs = synthetic(n);
        const registry = {
          getExact: (k: string): GuideDefinition => {
            const d = defs.find((x) => x.guideKey === k);
            if (!d) throw new Error("unknown");
            return d;
          },
        };
        const pins = defs.map((d) => ({
          guideKey: d.guideKey,
          guideVersion: d.guideVersion,
        }));
        // The seam is on the CONSTRUCTOR now, so the spec builds a service
        // bound to its own catalog rather than passing one per call.
        const svcForRegistry = new GuideTargetContextService(
          new LearningCatalogResolver(A.prisma as unknown as PrismaService),
          registry,
        );
        let queries = 0;
        await A.prisma.$transaction(async (tx) => {
          const spy = new Proxy(tx, {
            get(target, prop, recv) {
              const v = Reflect.get(target, prop, recv);
              if (prop === "$queryRaw" || prop === "$queryRawUnsafe") {
                return (...args: unknown[]) => {
                  queries += 1;
                  return (v as (...a: unknown[]) => unknown).apply(
                    target,
                    args,
                  );
                };
              }
              if (typeof prop === "string" && !prop.startsWith("$")) {
                return new Proxy(v as object, {
                  get(m, mp, mr) {
                    const fn = Reflect.get(m, mp, mr);
                    if (typeof fn !== "function") return fn;
                    return (...args: unknown[]) => {
                      queries += 1;
                      return (fn as (...a: unknown[]) => unknown).apply(
                        m,
                        args,
                      );
                    };
                  },
                });
              }
              return v;
            },
          }) as typeof tx;
          await svcForRegistry.resolveMany(pins, spy);
        });
        return queries;
      };

      const two = await count(2);
      const twentyFive = await count(25);
      // The requirement: the cost does not grow with the number of pins.
      expect(twentyFive).toBe(two);
      // The honest number, named rather than rounded to a target: exercises,
      // concepts, units, published membership, contexts. Unreached lookups are
      // skipped, so a concept-only batch costs fewer.
      expect(two).toBeLessThanOrEqual(5);
    });

    it("a stale reader token fails the batch closed, rather than answering", async () => {
      const svc = new GuideReaderApplicabilityService(targetContext);
      const pins = [
        { guideKey: PINS[0].guideKey, guideVersion: PINS[0].guideVersion },
      ];
      // The honest context first, so the negative below is about the token alone.
      const real = await A.prisma.$queryRawUnsafe<Array<{ unitKey: string }>>(
        `SELECT u."unitKey" FROM "ContentUnit" u
         JOIN "Edition" e ON e."id" = u."editionId"
         JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
        WHERE ru."revisionId" = e."publishedRevisionId" AND e."slug" = $1 AND ru."order" = 1`,
        EEC,
      );
      const good = {
        bookSlug: EEC,
        chapterOrder: 1,
        unitKey: real[0]!.unitKey,
      };
      await expect(
        A.prisma.$transaction((tx) => svc.verdicts(tx, good, pins)),
      ).resolves.toEqual(["APPLIES"]);

      for (const bad of [
        { ...good, unitKey: "00000000-0000-5000-8000-000000000000" },
        { ...good, chapterOrder: 99 },
        { ...good, bookSlug: "no-such-book" },
      ]) {
        await expect(
          A.prisma.$transaction((tx) => svc.verdicts(tx, bad, pins)),
        ).rejects.toBeInstanceOf(GuideReaderContextStaleError);
      }
    });

    it("after a reorder the verdict follows the unit, not the number", async () => {
      const svc = new GuideReaderApplicabilityService(targetContext);
      const pins = [
        { guideKey: PINS[0].guideKey, guideVersion: PINS[0].guideVersion },
      ];
      const unitOf = async (order: number) =>
        (
          await A.prisma.$queryRawUnsafe<Array<{ unitKey: string }>>(
            `SELECT u."unitKey" FROM "ContentUnit" u
           JOIN "Edition" e ON e."id" = u."editionId"
           JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
          WHERE ru."revisionId" = e."publishedRevisionId" AND e."slug" = $1 AND ru."order" = $2`,
            EEC,
            order,
          )
        )[0]!.unitKey;

      const guideUnitKey = await unitOf(1);
      await swapOrders(A, EEC, 1, 2);
      try {
        // The guide's unit, at its NEW number: applies.
        await expect(
          A.prisma.$transaction((tx) =>
            svc.verdicts(
              tx,
              { bookSlug: EEC, chapterOrder: 2, unitKey: guideUnitKey },
              pins,
            ),
          ),
        ).resolves.toEqual(["APPLIES"]);
        // The unit that inherited the OLD number: does not.
        const intruder = await unitOf(1);
        expect(intruder).not.toBe(guideUnitKey);
        await expect(
          A.prisma.$transaction((tx) =>
            svc.verdicts(
              tx,
              { bookSlug: EEC, chapterOrder: 1, unitKey: intruder },
              pins,
            ),
          ),
        ).resolves.toEqual(["UNAVAILABLE"]);
      } finally {
        await swapOrders(A, EEC, 1, 2);
      }
    });

    it("the other book's pin is never applicable here, and duplicates keep their place", async () => {
      const svc = new GuideReaderApplicabilityService(targetContext);
      const real = await A.prisma.$queryRawUnsafe<Array<{ unitKey: string }>>(
        `SELECT u."unitKey" FROM "ContentUnit" u
         JOIN "Edition" e ON e."id" = u."editionId"
         JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
        WHERE ru."revisionId" = e."publishedRevisionId" AND e."slug" = $1 AND ru."order" = 1`,
        EEC,
      );
      const reader = {
        bookSlug: EEC,
        chapterOrder: 1,
        unitKey: real[0]!.unitKey,
      };
      const pins = [
        { guideKey: PINS[1].guideKey, guideVersion: PINS[1].guideVersion },
        { guideKey: PINS[0].guideKey, guideVersion: PINS[0].guideVersion },
        { guideKey: PINS[1].guideKey, guideVersion: PINS[1].guideVersion },
        { guideKey: "no-such-guide", guideVersion: 1 },
        { guideKey: PINS[0].guideKey, guideVersion: 99 },
      ];
      await expect(
        A.prisma.$transaction((tx) => svc.verdicts(tx, reader, pins)),
      ).resolves.toEqual([
        "UNAVAILABLE", // other book
        "APPLIES", // this unit's guide
        "UNAVAILABLE", // the duplicate keeps its position
        "UNAVAILABLE", // unknown pin, inert
        "UNAVAILABLE", // wrong version, inert
      ]);
    });

    it("the read path writes nothing", async () => {
      const svc = new GuideReaderApplicabilityService(targetContext);
      const before = await A.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT (SELECT count(*) FROM "ContentUnit") + (SELECT count(*) FROM "RevisionUnit") AS n`,
      );
      const real = await A.prisma.$queryRawUnsafe<Array<{ unitKey: string }>>(
        `SELECT u."unitKey" FROM "ContentUnit" u
         JOIN "Edition" e ON e."id" = u."editionId"
         JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
        WHERE ru."revisionId" = e."publishedRevisionId" AND e."slug" = $1 AND ru."order" = 1`,
        EEC,
      );
      await A.prisma.$transaction((tx) =>
        svc.verdicts(
          tx,
          { bookSlug: EEC, chapterOrder: 1, unitKey: real[0]!.unitKey },
          [{ guideKey: PINS[0].guideKey, guideVersion: PINS[0].guideVersion }],
        ),
      );
      const after = await A.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT (SELECT count(*) FROM "ContentUnit") + (SELECT count(*) FROM "RevisionUnit") AS n`,
      );
      expect(String(after[0]!.n)).toBe(String(before[0]!.n));
    });

    /**
     * The adversarial cases — the ones that actually discriminate.
     *
     * Enumerating the two published pins proves the batch works on data that
     * is already correct. These construct data that is WRONG in each specific
     * way the rules exist to catch, and require the batch to refuse exactly
     * where the single-pin authority refuses.
     */
    describe("adversarial targets", () => {
      const base = () =>
        productionGuideRegistry.getExact(
          PINS[0].guideKey,
          PINS[0].guideVersion,
        );

      /** A registry serving exactly one synthetic definition. */
      const only = (def: GuideDefinition) => ({
        getExact: (k: string, v: number): GuideDefinition => {
          if (k !== def.guideKey || v !== def.guideVersion) {
            throw new Error("unknown");
          }
          return def;
        },
      });

      const withSteps = (steps: unknown[]): GuideDefinition =>
        ({
          ...base(),
          guideKey: "adversarial",
          guideVersion: 1,
          steps,
        }) as unknown as GuideDefinition;

      /** A service bound to a catalog holding exactly this definition. */
      const serviceFor = (def: GuideDefinition) =>
        new GuideTargetContextService(
          new LearningCatalogResolver(A.prisma as unknown as PrismaService),
          only(def),
        );

      async function outcome(def: GuideDefinition) {
        const [r] = await A.prisma.$transaction((tx) =>
          serviceFor(def).resolveMany(
            [{ guideKey: def.guideKey, guideVersion: def.guideVersion }],
            tx,
          ),
        );
        return r!;
      }

      /** What the SINGLE-pin authority does with the same definition. */
      async function authority(
        def: GuideDefinition,
      ): Promise<string | "THREW"> {
        try {
          return (
            await A.prisma.$transaction((tx) => targetContext.resolve(def, tx))
          ).unitId;
        } catch {
          return "THREW";
        }
      }

      it("a recall item whose declared concept lives elsewhere is refused", async () => {
        // The exact rule the first batch dropped. The item resolves, its unit
        // resolves — and its OWN catalog names a concept owned by a different
        // unit, which makes the item's editorial claim incoherent.
        const other = await A.prisma.$queryRawUnsafe<
          Array<{ conceptKey: string }>
        >(
          `SELECT c."conceptKey" FROM "Concept" c
             JOIN "ConceptLink" l ON l."conceptId" = c."id"
             JOIN "ContentUnit" u ON u."id" = l."unitId"
             JOIN "Edition" e ON e."id" = u."editionId"
            WHERE e."slug" = $1 LIMIT 1`,
          PQP,
        );
        if (other.length === 0) return; // nothing to contradict WITH
        const item = await A.prisma.$queryRawUnsafe<
          Array<{ id: string; content: unknown }>
        >(
          `SELECT e."id", e."content" FROM "Exercise" e WHERE e."type" = 'QUIZ' LIMIT 1`,
        );
        if (item.length === 0) return;
        const ROLLBACK = Symbol("rollback");
        let batch: unknown = null;
        let single: unknown = null;
        try {
          await A.prisma.$transaction(async (tx) => {
            // Point the item's INTERNAL catalog at the other book's concept.
            await tx.$executeRawUnsafe(
              `UPDATE "Exercise" SET "content" = jsonb_set("content"::jsonb, '{conceptKey}', to_jsonb($2::text))
                 WHERE "id" = $1`,
              item[0]!.id,
              other[0]!.conceptKey,
            );
            const def = withSteps([
              {
                kind: "ACTIVE_RECALL",
                stepKey: "r",
                completionPolicy: "objective_recall",
                itemKey: item[0]!.id,
              },
            ]);
            const svc = serviceFor(def);
            [batch] = await svc.resolveMany(
              [{ guideKey: def.guideKey, guideVersion: def.guideVersion }],
              tx,
            );
            single = await svc.resolve(def, tx).catch(() => "THREW");
            throw ROLLBACK;
          });
        } catch (e) {
          if (e !== ROLLBACK) throw e;
        }
        expect((batch as { ok: boolean }).ok).toBe(false);
        expect(single).toBe("THREW");
      });

      it("an ACTIVE_RECALL step pointing at a non-QUIZ is refused", async () => {
        const ex = await A.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "Exercise" WHERE "type" <> 'QUIZ' LIMIT 1`,
        );
        if (ex.length === 0) return;
        const def = withSteps([
          {
            kind: "ACTIVE_RECALL",
            stepKey: "r",
            completionPolicy: "objective_recall",
            itemKey: ex[0]!.id,
          },
        ]);
        expect((await outcome(def)).ok).toBe(false);
        expect(await authority(def)).toBe("THREW");
      });

      it("a CATALOG_PRACTICE step pointing at a QUIZ is refused", async () => {
        const quiz = await A.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "Exercise" WHERE "type" = 'QUIZ' LIMIT 1`,
        );
        if (quiz.length === 0) return;
        const def = withSteps([
          { kind: "CATALOG_PRACTICE", stepKey: "p", exerciseKey: quiz[0]!.id },
        ]);
        expect((await outcome(def)).ok).toBe(false);
        expect(await authority(def)).toBe("THREW");
      });

      it("a concept with no owning unit is refused", async () => {
        const def = withSteps([
          {
            kind: "CONCEPT_EXPLORATION",
            stepKey: "c",
            conceptKey: "no-such-concept",
          },
        ]);
        expect((await outcome(def)).ok).toBe(false);
        expect(await authority(def)).toBe("THREW");
      });

      it("targets that disagree about the unit are a MISMATCH, not a pick", async () => {
        const eecConcept = await A.prisma.$queryRawUnsafe<
          Array<{ conceptKey: string }>
        >(
          `SELECT c."conceptKey" FROM "Concept" c
             JOIN "ConceptLink" l ON l."conceptId" = c."id"
             JOIN "ContentUnit" u ON u."id" = l."unitId"
             JOIN "Edition" e ON e."id" = u."editionId"
            WHERE e."slug" = $1 LIMIT 1`,
          EEC,
        );
        const pqpConcept = await A.prisma.$queryRawUnsafe<
          Array<{ conceptKey: string }>
        >(
          `SELECT c."conceptKey" FROM "Concept" c
             JOIN "ConceptLink" l ON l."conceptId" = c."id"
             JOIN "ContentUnit" u ON u."id" = l."unitId"
             JOIN "Edition" e ON e."id" = u."editionId"
            WHERE e."slug" = $1 LIMIT 1`,
          PQP,
        );
        if (!eecConcept.length || !pqpConcept.length) return;
        const def = withSteps([
          {
            kind: "CONCEPT_EXPLORATION",
            stepKey: "a",
            conceptKey: eecConcept[0]!.conceptKey,
          },
          {
            kind: "CONCEPT_EXPLORATION",
            stepKey: "b",
            conceptKey: pqpConcept[0]!.conceptKey,
          },
        ]);
        const r = await outcome(def);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("GUIDE_CONTEXT_MISMATCH");
        expect(await authority(def)).toBe("THREW");
      });

      it("a concept owned by TWO units is ambiguous, and never picked", async () => {
        // Reachable, not hypothetical: `ConceptLink` has no unique constraint
        // tying a concept to one unit, so the ambiguity can be constructed —
        // and must be refused rather than resolved to a first match.
        const rows = await A.prisma.$queryRawUnsafe<
          Array<{ conceptId: string; conceptKey: string }>
        >(
          `SELECT c."id" AS "conceptId", c."conceptKey" FROM "Concept" c
             JOIN "ConceptLink" l ON l."conceptId" = c."id"
             JOIN "ContentUnit" u ON u."id" = l."unitId"
             JOIN "Edition" e ON e."id" = u."editionId"
            WHERE e."slug" = $1 LIMIT 1`,
          EEC,
        );
        const other = await A.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT u."id" FROM "ContentUnit" u
             JOIN "Edition" e ON e."id" = u."editionId"
            WHERE e."slug" = $1 LIMIT 1`,
          PQP,
        );
        if (!rows.length || !other.length) return;
        const def = withSteps([
          {
            kind: "CONCEPT_EXPLORATION",
            stepKey: "c",
            conceptKey: rows[0]!.conceptKey,
          },
        ]);
        const ROLLBACK = Symbol("rollback");
        let batch: unknown = null;
        let single: unknown = null;
        try {
          await A.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              `INSERT INTO "ConceptLink" ("id","conceptId","unitId","role") VALUES ($1,$2,$3,'PRIMARY')`,
              `probe-${Date.now()}`,
              rows[0]!.conceptId,
              other[0]!.id,
            );
            const svc = serviceFor(def);
            [batch] = await svc.resolveMany(
              [{ guideKey: def.guideKey, guideVersion: def.guideVersion }],
              tx,
            );
            single = await svc.resolve(def, tx).catch(() => "THREW");
            throw ROLLBACK;
          });
        } catch (e) {
          if (e !== ROLLBACK) throw e;
        }
        expect((batch as { ok: boolean }).ok).toBe(false);
        expect(single).toBe("THREW");
      });

      it("a unit outside the published revision is not servable content", async () => {
        const def = withSteps([
          {
            kind: "CATALOG_PRACTICE",
            stepKey: "p",
            exerciseKey: (
              await A.prisma.$queryRawUnsafe<Array<{ id: string }>>(
                `SELECT e."id" FROM "Exercise" e WHERE e."type" <> 'QUIZ' LIMIT 1`,
              )
            )[0]!.id,
          },
        ]);
        // It resolves today…
        expect((await outcome(def)).ok).toBe(true);
        // …and stops the moment its unit leaves the published manifest.
        const ROLLBACK = Symbol("rollback");
        let batch: unknown = null;
        try {
          await A.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              `UPDATE "Edition" SET "publishedRevisionId" = NULL WHERE "slug" = $1`,
              EEC,
            );
            [batch] = await serviceFor(def).resolveMany(
              [{ guideKey: def.guideKey, guideVersion: def.guideVersion }],
              tx,
            );
            throw ROLLBACK;
          });
        } catch (e) {
          if (e !== ROLLBACK) throw e;
        }
        expect((batch as { ok: boolean }).ok).toBe(false);
      });

      it("a target in another book is never this reader's, and stays a target", async () => {
        // The Parejas pin resolves fine — it simply belongs elsewhere. The
        // distinction matters: "resolved, other unit" is UNAVAILABLE, while
        // "unresolvable" is a different fact the report keeps apart.
        const [r] = await A.prisma.$transaction((tx) =>
          targetContext.resolveMany(
            [
              {
                guideKey: PINS[1].guideKey,
                guideVersion: PINS[1].guideVersion,
              },
            ],
            tx,
          ),
        );
        expect(r!.ok).toBe(true);
        const eecUnit = await targetUnitOf(A, PINS[0]);
        if (r!.ok) expect(r!.context.unitId).not.toBe(eecUnit);
      });

      it("a storage failure propagates — it never becomes UNAVAILABLE", async () => {
        // The distinction the whole verdict rests on: "the catalog says this
        // guide is not for here" and "the database did not answer" are
        // different facts. Collapsing them would show a chapter's cards as
        // inapplicable during an outage.
        const svc = new GuideReaderApplicabilityService(targetContext);
        const real = await A.prisma.$queryRawUnsafe<Array<{ unitKey: string }>>(
          `SELECT u."unitKey" FROM "ContentUnit" u
             JOIN "Edition" e ON e."id" = u."editionId"
             JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
            WHERE ru."revisionId" = e."publishedRevisionId" AND e."slug" = $1 AND ru."order" = 1`,
          EEC,
        );
        const reader = {
          bookSlug: EEC,
          chapterOrder: 1,
          unitKey: real[0]!.unitKey,
        };
        const pins = [
          { guideKey: PINS[0].guideKey, guideVersion: PINS[0].guideVersion },
        ];
        const boom = new Error("STORAGE");
        await expect(
          A.prisma.$transaction(async (tx) => {
            let seen = 0;
            const failing = new Proxy(tx, {
              get(target, prop, recv) {
                const v = Reflect.get(target, prop, recv);
                if (prop === "concept") {
                  // Fail one query in the middle of the batch.
                  return {
                    findMany: () => {
                      seen += 1;
                      return Promise.reject(boom);
                    },
                  };
                }
                return v;
              },
            }) as typeof tx;
            return svc.verdicts(failing, reader, pins);
          }),
        ).rejects.toBe(boom);
      });

      it("EXPLICIT_CONFIRMATION alone anchors to nothing", async () => {
        const def = withSteps([
          { kind: "EXPLICIT_CONFIRMATION", stepKey: "x", prompt: "¿Seguimos?" },
        ]);
        const r = await outcome(def);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("GUIDE_CONTEXT_UNRESOLVED");
        expect(await authority(def)).toBe("THREW");
      });
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
