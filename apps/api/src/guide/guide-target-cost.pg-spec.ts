import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GuideDefinition } from "@psico/types";
import type { PrismaService } from "../prisma";
import type { AuthenticatedUser } from "../auth";
import { backfillContentCore } from "../content-core/backfill";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import { LearningEventRepository } from "../learning/learning-event.repository";
import { productionGuideRegistry } from "./guide-catalog";
import { GuideTargetContextService } from "./guide-target-context.service";
import { GuideReaderApplicabilityService } from "./guide-reader-applicability.service";
import { GuideDiscoveryService } from "./guide-discovery.service";
import { GuideRolloutService } from "./guide-rollout.service";
import { GuideLifecycleService } from "./guide-lifecycle.service";
import { GuideSessionRepository } from "./guide-session.repository";
import { GuideSessionStepRepository } from "./guide-session-step.repository";
import { GuideCommandReceiptRepository } from "./guide-command-receipt.repository";

/**
 * C.3R (#639) — what the batch actually costs, by target COMPOSITION.
 *
 * ── Why this file exists, and what the earlier measurement got wrong ────────
 *
 * The cost claim was measured twice before and both times the fixture answered
 * a smaller question than the sentence it supported.
 *
 * The first version filled the list with pins the registry did not know. Those
 * are answered before a single query is issued, so the batch resolved ONE pin
 * whether it was asked about 2 or 25: "the cost does not grow" was true of a
 * batch that never grew. The second version fixed the registry but kept
 * `conceptKey`s that no catalog row matched, so the batch stopped after its
 * first lookup — a real query, and then nothing. Both produced a flat line by
 * measuring a path that was never walked.
 *
 * So the fixtures here are REACHABLE: concepts, exercises and recall items are
 * really inserted, really linked to real units of a really published revision,
 * and every synthetic pin is asserted to RESOLVE before anything is counted.
 * A test that can only pass by placing every pin cannot go quiet again.
 *
 * ── What is being claimed, precisely ────────────────────────────────────────
 *
 * NOT "the batch always costs N". Different compositions reach different
 * lookups, and collapsing them into one number is how a bound becomes folklore.
 * What is claimed, and measured:
 *
 *   1. for a GIVEN composition, the cost does not grow with the number of pins;
 *   2. the families of lookups are finite (exercises, concepts, units, published
 *      membership, contexts), so a maximum exists;
 *   3. that maximum is measured rather than asserted.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise. Its own
 * disposable database: every row below is synthetic and nothing outlives it.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "c3r_cost_db";

const EEC = "emociones-en-construccion";
const PQP = "parejas-que-perduran";

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

/** One real chapter, and the published unit the backfill derived from it. */
interface Place {
  chapterId: string;
  unitId: string;
  bookSlug: string;
  order: number;
}

suite("C.3R · batch cost by target composition", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  const places: Place[] = [];
  let user: { userId: string };

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "ignore",
    });

    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    // Two books, two chapters each: four distinct units, so a batch can be
    // spread across units rather than piling onto one.
    for (const [slug, first] of [
      [EEC, 1],
      [PQP, 2],
    ] as const) {
      const heading =
        EXERCISE_INGESTION_CATALOG[slug][0].practice.sourceHeading;
      const book = await prisma.book.create({
        data: { slug, title: slug, plan: "FREE" },
      });
      for (const c of [
        { order: first, heading },
        { order: first + 1, heading: null },
      ]) {
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

    const chapters = await prisma.chapter.findMany({
      select: { id: true, order: true, book: { select: { slug: true } } },
      orderBy: [{ bookId: "asc" }, { order: "asc" }],
    });
    for (const ch of chapters) {
      const unit = await prisma.contentUnit.findFirst({
        where: { unitKey: unitKeyFromLegacyChapterId(ch.id) },
        select: { id: true },
      });
      if (unit) {
        places.push({
          chapterId: ch.id,
          unitId: unit.id,
          bookSlug: ch.book.slug,
          order: ch.order,
        });
      }
    }
    expect(places.length).toBeGreaterThanOrEqual(2);

    const u = await prisma.user.create({
      data: { email: "c3r-cost@example.test", name: "Coste", plan: "FREE" },
    });
    user = { userId: u.id };
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  // ── Reachable synthetic targets ───────────────────────────────────────────

  /** A concept that really exists and really owns exactly one unit. */
  async function makeConcept(key: string, unitId: string): Promise<string> {
    const c = await prisma.concept.upsert({
      where: { conceptKey: key },
      update: {},
      create: { conceptKey: key, label: key },
      select: { id: true },
    });
    const existing = await prisma.conceptLink.findFirst({
      where: { conceptId: c.id, unitId },
      select: { id: true },
    });
    if (!existing) {
      await prisma.conceptLink.create({ data: { conceptId: c.id, unitId } });
    }
    return key;
  }

  /** A completable practice: a non-QUIZ exercise on a real chapter. */
  async function makeExercise(place: Place, n: number): Promise<string> {
    const ex = await prisma.exercise.create({
      data: {
        chapterId: place.chapterId,
        order: 900 + n,
        title: `práctica ${n}`,
        type: "REFLECTION",
        content: { prompt: "Escribe una línea." },
      },
      select: { id: true },
    });
    return ex.id;
  }

  /**
   * A recall item whose OWN catalog names a concept in the same unit.
   *
   * The binding is the part that matters: a QUIZ whose declared concept lives
   * elsewhere is refused, so getting this right is what makes the recall path
   * reachable rather than merely present.
   */
  async function makeRecallItem(place: Place, n: number): Promise<string> {
    const conceptKey = await makeConcept(
      `cost-recall-concept-${n}`,
      place.unitId,
    );
    const ex = await prisma.exercise.create({
      data: {
        chapterId: place.chapterId,
        order: 800 + n,
        title: `recuerdo ${n}`,
        type: "QUIZ",
        // OBJECTIVE, not self-assessed: an `ACTIVE_RECALL` step demands a
        // gradable item, and a self-assessed one is refused. Getting this
        // wrong is what the pre-assertion caught the first time this file ran.
        content: {
          recallMode: "objective",
          conceptKey,
          options: [
            { key: "a", label: "Sí" },
            { key: "b", label: "No" },
          ],
          correctOptionKey: "a",
        },
      },
      select: { id: true },
    });
    return ex.id;
  }

  type Composition = "concept" | "exercise" | "recall" | "mixed";

  /** N distinct definitions of one composition, each on its own targets. */
  async function definitions(
    kind: Composition,
    n: number,
    tag: string,
  ): Promise<GuideDefinition[]> {
    const shipped = productionGuideRegistry.getExact(
      "eec-c1-cuerpo-antes-que-mente",
      1,
    );
    const out: GuideDefinition[] = [];
    for (let i = 0; i < n; i += 1) {
      // Spread across every unit the fixture has: distinct pins, distinct
      // targets and — where the fixture allows it — distinct units.
      const place = places[i % places.length] as Place;
      const steps: unknown[] = [];
      if (kind === "concept" || kind === "mixed") {
        steps.push({
          kind: "CONCEPT_EXPLORATION",
          stepKey: `c-${i}`,
          conceptKey: await makeConcept(
            `cost-${tag}-concept-${i}`,
            place.unitId,
          ),
        });
      }
      if (kind === "exercise" || kind === "mixed") {
        steps.push({
          kind: "CATALOG_PRACTICE",
          stepKey: `p-${i}`,
          exerciseKey: await makeExercise(place, Number(`${tag.length}${i}`)),
        });
      }
      if (kind === "recall" || kind === "mixed") {
        steps.push({
          kind: "ACTIVE_RECALL",
          stepKey: `r-${i}`,
          itemKey: await makeRecallItem(place, Number(`${tag.length}9${i}`)),
        });
      }
      out.push({
        ...shipped,
        guideKey: `cost-${tag}-${kind}-${i}`,
        guideVersion: 1,
        steps,
      } as unknown as GuideDefinition);
    }
    return out;
  }

  /** A registry bound at construction, serving exactly these definitions. */
  function registryFor(defs: readonly GuideDefinition[]) {
    const byKey = new Map(defs.map((d) => [d.guideKey, d]));
    return {
      getExact: (guideKey: string): GuideDefinition => {
        const d = byKey.get(guideKey);
        if (!d) throw new Error(`unknown ${guideKey}`);
        return d;
      },
    };
  }

  /** Count every model call and raw query issued on one transaction client. */
  function countingTx(tx: object, bump: () => void): object {
    return new Proxy(tx, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (prop === "$queryRaw" || prop === "$queryRawUnsafe") {
          return (...args: unknown[]) => {
            bump();
            return (v as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        if (typeof prop === "string" && prop.startsWith("$")) return v;
        if (typeof v !== "object" || v === null) return v;
        return new Proxy(v, {
          get(m, mp, mr) {
            const fn = Reflect.get(m, mp, mr);
            if (typeof fn !== "function") return fn;
            return (...args: unknown[]) => {
              bump();
              return (fn as (...a: unknown[]) => unknown).apply(m, args);
            };
          },
        });
      },
    });
  }

  /** The whole client, counted — for paths that open their own transaction. */
  function countingClient(bump: () => void): PrismaService {
    return new Proxy(prisma, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (prop === "$transaction" && typeof v === "function") {
          return (fn: unknown, opts: unknown) =>
            (v as (...a: unknown[]) => unknown).call(
              target,
              typeof fn === "function"
                ? (tx: object) =>
                    (fn as (t: unknown) => unknown)(countingTx(tx, bump))
                : fn,
              opts,
            );
        }
        return typeof v === "function" ? v.bind(target) : v;
      },
    }) as unknown as PrismaService;
  }

  const measured: Record<string, number> = {};

  /**
   * Resolve `defs` and count. Refuses to report a number for a batch that did
   * not actually place every pin — the guard that keeps this file honest.
   */
  async function costOfResolving(defs: GuideDefinition[]): Promise<number> {
    const svc = new GuideTargetContextService(
      new LearningCatalogResolver(prisma as unknown as PrismaService),
      registryFor(defs),
    );
    const pins = defs.map((d) => ({
      guideKey: d.guideKey,
      guideVersion: d.guideVersion,
    }));

    // PRE-ASSERTION: every synthetic pin resolves. Without this the batch can
    // go quiet — an unknown pin or an unmatched concept short-circuits it —
    // and the flat line would say nothing at all.
    const check = await prisma.$transaction((tx) => svc.resolveMany(pins, tx));
    for (const [i, r] of check.entries()) {
      expect(
        r.ok,
        `pin ${i} (${pins[i]!.guideKey}) must be reachable, got ${
          r.ok ? "ok" : r.code
        }`,
      ).toBe(true);
    }

    let queries = 0;
    await prisma.$transaction(async (tx) => {
      await svc.resolveMany(
        pins,
        countingTx(tx, () => (queries += 1)) as never,
      );
    });
    return queries;
  }

  async function pair(kind: Composition, small: number, large: number) {
    const a = await costOfResolving(await definitions(kind, small, `s${kind}`));
    const b = await costOfResolving(await definitions(kind, large, `l${kind}`));
    return { small: a, large: b };
  }

  // ── resolveMany, by composition ──────────────────────────────────────────

  it("concept-only: the cost does not grow from 2 to 25", async () => {
    const r = await pair("concept", 2, 25);
    expect(r.large).toBe(r.small);
    measured.TARGET_QUERIES_CONCEPT_2 = r.small;
    measured.TARGET_QUERIES_CONCEPT_25 = r.large;
  }, 240_000);

  it("exercise-only: the cost does not grow from 2 to 25", async () => {
    const r = await pair("exercise", 2, 25);
    expect(r.large).toBe(r.small);
    measured.TARGET_QUERIES_EXERCISE_2 = r.small;
    measured.TARGET_QUERIES_EXERCISE_25 = r.large;
  }, 240_000);

  it("recall-only: the cost does not grow from 2 to 25", async () => {
    const r = await pair("recall", 2, 25);
    expect(r.large).toBe(r.small);
    measured.TARGET_QUERIES_RECALL_2 = r.small;
    measured.TARGET_QUERIES_RECALL_25 = r.large;
  }, 240_000);

  it("mixed — every lookup family reached — does not grow from 6 to 24", async () => {
    // The composition that walks all five families: exercises (practice and
    // item rows), concepts (the steps' own AND the items' declared bindings),
    // units, published membership, contexts.
    const r = await pair("mixed", 6, 24);
    expect(r.large).toBe(r.small);
    measured.TARGET_QUERIES_MIXED_SMALL = r.small;
    measured.TARGET_QUERIES_MIXED_LARGE = r.large;
    // The bound is the worst composition MEASURED, named explicitly rather
    // than taken from whatever the map happens to hold — a max over every key
    // would change meaning the day a test is reordered.
    const bound = Math.max(
      measured.TARGET_QUERIES_CONCEPT_2 ?? 0,
      measured.TARGET_QUERIES_CONCEPT_25 ?? 0,
      measured.TARGET_QUERIES_EXERCISE_2 ?? 0,
      measured.TARGET_QUERIES_EXERCISE_25 ?? 0,
      measured.TARGET_QUERIES_RECALL_2 ?? 0,
      measured.TARGET_QUERIES_RECALL_25 ?? 0,
      r.small,
      r.large,
    );
    measured.TARGET_QUERY_BOUND_MAX_MEASURED = bound;
    // Five families of lookup exist, so five is the ceiling the code can reach:
    // exercises, concepts, units, published membership, contexts.
    expect(bound).toBeLessThanOrEqual(5);
    for (const [k, v] of Object.entries(measured)) {
      // eslint-disable-next-line no-console
      console.log(`${k}=${v}`);
    }
    expect(r.small).toBeLessThanOrEqual(bound);
  }, 240_000);

  // ── Card states, end to end inside the RepeatableRead ────────────────────

  async function cardStateCost(defs: GuideDefinition[]): Promise<number> {
    const pins = defs.map((d) => ({
      guideKey: d.guideKey,
      guideVersion: d.guideVersion,
    }));
    const place = places[0] as Place;
    const unit = await prisma.contentUnit.findUniqueOrThrow({
      where: { id: place.unitId },
      select: { unitKey: true },
    });
    const reader = {
      bookSlug: place.bookSlug,
      chapterOrder: place.order,
      unitKey: unit.unitKey,
    };

    let queries = 0;
    const client = countingClient(() => (queries += 1));
    const registry = registryFor(defs);
    const svc = new GuideLifecycleService(
      client,
      new LearningCatalogResolver(client),
      new ContentAccessService(client),
      new GuideTargetContextService(
        new LearningCatalogResolver(client),
        registry,
      ),
      new GuideSessionRepository(client as never),
      new GuideSessionStepRepository(client as never),
      new GuideCommandReceiptRepository(client as never),
      new LearningEventRepository(client as never),
      new GuideReaderApplicabilityService(
        new GuideTargetContextService(
          new LearningCatalogResolver(client),
          registry,
        ),
      ),
    );
    await svc.resolveExperienceCardStates(user.userId, pins, reader);
    return queries;
  }

  it("card states: concept-only 2 and 25 cost the same", async () => {
    const two = await cardStateCost(await definitions("concept", 2, "csc2"));
    const twentyFive = await cardStateCost(
      await definitions("concept", 25, "csc25"),
    );
    expect(twentyFive).toBe(two);
    measured.CARD_STATE_QUERIES_CONCEPT_2 = two;
    measured.CARD_STATE_QUERIES_CONCEPT_25 = twentyFive;
  }, 240_000);

  it("card states: mixed 6 and 24 cost the same, and set the bound", async () => {
    const small = await cardStateCost(await definitions("mixed", 6, "csm6"));
    const large = await cardStateCost(await definitions("mixed", 24, "csm24"));
    expect(large).toBe(small);
    measured.CARD_STATE_QUERIES_MIXED_SMALL = small;
    measured.CARD_STATE_QUERIES_MIXED_LARGE = large;
    const bound = Math.max(
      measured.CARD_STATE_QUERIES_CONCEPT_2 ?? 0,
      measured.CARD_STATE_QUERIES_CONCEPT_25 ?? 0,
      small,
      large,
    );
    measured.CARD_STATE_QUERY_BOUND_MAX_MEASURED = bound;
    for (const k of [
      "CARD_STATE_QUERIES_CONCEPT_2",
      "CARD_STATE_QUERIES_CONCEPT_25",
      "CARD_STATE_QUERIES_MIXED_SMALL",
      "CARD_STATE_QUERIES_MIXED_LARGE",
      "CARD_STATE_QUERY_BOUND_MAX_MEASURED",
    ]) {
      // eslint-disable-next-line no-console
      console.log(`${k}=${measured[k]}`);
    }
  }, 240_000);

  // ── Discovery: ONE pin, so this is a path cost and not a scaling claim ────

  it("discovery costs a measured amount for each path — not a scaling claim", async () => {
    const place = places.find((p) => p.bookSlug === EEC && p.order === 1);
    if (!place) throw new Error("fixture: EEC chapter 1 missing");

    const shipped = productionGuideRegistry.getExact(
      "eec-c1-cuerpo-antes-que-mente",
      1,
    );
    // The SAME published pin, served two ways: the shipped definition (which
    // already walks every family) and a concept-only one. Discovery takes its
    // pin from the published index, so the registry seam is what lets the
    // composition vary while the pin stays the one the index names.
    const conceptOnly = {
      ...shipped,
      steps: [
        {
          kind: "CONCEPT_EXPLORATION",
          stepKey: "solo-concepto",
          conceptKey: await makeConcept("cost-discovery-concept", place.unitId),
        },
      ],
    } as unknown as GuideDefinition;

    const run = async (def: GuideDefinition): Promise<number> => {
      let queries = 0;
      const client = countingClient(() => (queries += 1));
      const svcTargets = new GuideTargetContextService(
        new LearningCatalogResolver(client),
        { getExact: () => def },
      );
      const discovery = new GuideDiscoveryService(
        client,
        new GuideRolloutService({ mode: "on", pilotUserIds: [] }),
        svcTargets,
        new ContentAccessService(client),
        new GuideReaderApplicabilityService(svcTargets),
      );
      const answer = await discovery.discover(
        {
          userId: user.userId,
          email: "c3r-cost@example.test",
          plan: "FREE",
          role: "USER",
        } as unknown as AuthenticatedUser,
        { bookSlug: EEC, chapterOrder: 1 },
      );
      // Only a path that ANSWERED is worth timing.
      expect(answer.available).toBe(true);
      return queries;
    };

    const conceptCost = await run(conceptOnly);
    const maxPathCost = await run(shipped);
    // eslint-disable-next-line no-console
    console.log(`DISCOVERY_QUERIES_CONCEPT=${conceptCost}`);
    // eslint-disable-next-line no-console
    console.log(`DISCOVERY_QUERIES_MAX_PATH=${maxPathCost}`);
    expect(conceptCost).toBeGreaterThan(0);
    expect(maxPathCost).toBeGreaterThanOrEqual(conceptCost);
  }, 240_000);
});
