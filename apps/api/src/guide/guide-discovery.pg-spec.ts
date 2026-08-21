import { execFileSync } from "node:child_process";
import { ForbiddenException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../auth";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import type { PrismaService } from "../prisma";
import { GuideDiscoveryService } from "./guide-discovery.service";
import { GuideReaderApplicabilityService } from "./guide-reader-applicability.service";
import { GuideRolloutService } from "./guide-rollout.service";
import { GuideTargetContextService } from "./guide-target-context.service";

/**
 * C.3R (#639) — discovery decides applicability the way the READER's content is
 * served, against real PostgreSQL.
 *
 * ── What changed, and why it needed a database to see ───────────────────────
 *
 * Discovery already compared IDENTITIES: it resolved the guide's unit from its
 * targets and required the reader's unit to be that same unit. What it got
 * wrong was where the reader's unit came from. It walked the LEGACY tables —
 * `Chapter` by `(bookId, order)`, then `uuidv5(chapter.id)` — while the reader's
 * text is served from `RevisionUnit` on the edition's published revision.
 *
 * Two notions of "the chapter at position N" agree right up until an editorial
 * reorder, and then they don't: the manifest moves, the legacy row does not,
 * and discovery goes on offering the guide at a number whose text now belongs
 * to a different unit. No amount of mocking shows that. It needs a real
 * manifest, really reordered — which is what this file does.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "c3r_discovery_db";

const EEC = "emociones-en-construccion";
const PQP = "parejas-que-perduran";

/** The contexts the published discovery index actually pins. */
const EEC_CTX = { bookSlug: EEC, chapterOrder: 1 };
const PQP_CTX = { bookSlug: PQP, chapterOrder: 2 };

const USER = {
  userId: "u-discovery",
  email: "lector@example.com",
  plan: "FREE",
  role: "USER",
} as unknown as AuthenticatedUser;

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

suite("C.3R · discovery resolves the reader's unit from the manifest", () => {
  let prisma: PrismaClient;
  let pool: Pool;

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

    // Both canonical books, each with the guide-bearing chapter at the order
    // the discovery index pins, plus one neighbour so a reorder has something
    // to swap WITH.
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
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  /** The real service, wired the way the module wires it. */
  function makeService(client: PrismaClient = prisma): GuideDiscoveryService {
    const db = client as unknown as PrismaService;
    return new GuideDiscoveryService(
      db,
      new GuideRolloutService({ mode: "on", pilotUserIds: [] }),
      new GuideTargetContextService(new LearningCatalogResolver(db)),
      new ContentAccessService(db),
      new GuideReaderApplicabilityService(
        new GuideTargetContextService(new LearningCatalogResolver(db)),
      ),
    );
  }

  /** Which unit sits at `(slug, order)` in the PUBLISHED manifest right now. */
  async function unitAtOrder(
    slug: string,
    order: number,
  ): Promise<string | null> {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u."id" FROM "ContentUnit" u
         JOIN "Edition" e ON e."id" = u."editionId"
         JOIN "RevisionUnit" ru ON ru."unitId" = u."id"
        WHERE ru."revisionId" = e."publishedRevisionId"
          AND e."slug" = $1 AND ru."order" = $2`,
      slug,
      order,
    );
    return rows[0]?.id ?? null;
  }

  /**
   * A real editorial reorder: the same two units, the same revision, their
   * `order` exchanged. The legacy `Chapter` rows are deliberately left alone —
   * that divergence is the whole point.
   */
  async function swapOrders(slug: string, a: number, b: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const ed = await tx.$queryRawUnsafe<
        Array<{ publishedRevisionId: string }>
      >(`SELECT "publishedRevisionId" FROM "Edition" WHERE "slug" = $1`, slug);
      const rev = (ed[0] as { publishedRevisionId: string })
        .publishedRevisionId;
      // Park one out of the way first: `(revisionId, order)` is unique.
      for (const [from, to] of [
        [a, -1],
        [b, a],
        [-1, b],
      ] as const) {
        await tx.$executeRawUnsafe(
          `UPDATE "RevisionUnit" SET "order" = $3 WHERE "revisionId" = $1 AND "order" = $2`,
          rev,
          from,
          to,
        );
      }
    });
  }

  /** Every table discovery must never write to. */
  async function writeCounts(): Promise<Record<string, number>> {
    return {
      sessions: await prisma.guideSession.count(),
      steps: await prisma.guideSessionStep.count(),
      receipts: await prisma.guideCommandReceipt.count(),
      events: await prisma.learningEvent.count(),
      resonances: await prisma.resonance.count(),
      reservations: await prisma.experienceGuideReservation.count(),
    };
  }

  // ── The verdict itself ────────────────────────────────────────────────────

  it("the chapter the guide is about offers the EXACT pin", async () => {
    const res = await makeService().discover(USER, EEC_CTX);
    expect(res).toEqual({
      available: true,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
    // EXACT, never `latestStartableVersion`: the offered version is the one the
    // index pins, so a newer definition cannot start under an old offer.
    expect((res as { guideVersion: number }).guideVersion).toBe(1);
  });

  it("the other canonical book offers its own exact pin", async () => {
    await expect(makeService().discover(USER, PQP_CTX)).resolves.toEqual({
      available: true,
      guideKey: "pqp-c1-contacto-sostenido",
      guideVersion: 1,
    });
  });

  it("a different chapter of the same book offers nothing", async () => {
    // Order 2 of Emociones is a real, published unit — it is simply not the
    // unit this guide is about. The index has no pin there either, so the
    // negative is opaque for two independent reasons at once.
    await expect(
      makeService().discover(USER, { bookSlug: EEC, chapterOrder: 2 }),
    ).resolves.toEqual({ available: false });
  });

  it("a position that names no published unit offers nothing", async () => {
    await expect(
      makeService().discover(USER, { bookSlug: EEC, chapterOrder: 99 }),
    ).resolves.toEqual({ available: false });
  });

  it("a context the index does not pin offers nothing, and reads nothing", async () => {
    let opened = 0;
    const counting = new Proxy(prisma, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (prop === "$transaction" && typeof v === "function") {
          return (...args: unknown[]) => {
            opened += 1;
            return (v as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return typeof v === "function" ? v.bind(target) : v;
      },
    }) as PrismaClient;

    await expect(
      makeService(counting).discover(USER, {
        bookSlug: "libro-inexistente",
        chapterOrder: 1,
      }),
    ).resolves.toEqual({ available: false });
    // Not "no queries were counted" — no transaction was ever opened.
    expect(opened).toBe(0);
  });

  // ── The bug this fixes, with the manifest really moved ────────────────────

  it("after a real reorder the inherited NUMBER no longer offers the guide", async () => {
    const guideUnit = await unitAtOrder(EEC, 1);
    try {
      await swapOrders(EEC, 1, 2);
      // Order 1 now serves a DIFFERENT unit's text. The legacy `Chapter` row
      // still says order 1 is the guide's chapter, so the retired walk would
      // have said `available: true` here — offering a guided reading over a
      // chapter it is not about.
      expect(await unitAtOrder(EEC, 1)).not.toBe(guideUnit);
      await expect(makeService().discover(USER, EEC_CTX)).resolves.toEqual({
        available: false,
      });
    } finally {
      await swapOrders(EEC, 1, 2);
    }
    expect(await unitAtOrder(EEC, 1)).toBe(guideUnit);
  });

  it("the verdict follows the manifest, not the legacy Chapter row", async () => {
    // The manifest is untouched; only the legacy row is renumbered out of the
    // way. The reader's text has not moved, so the offer must not move either.
    const book = await prisma.book.findUnique({ where: { slug: EEC } });
    const chapters = await prisma.chapter.findMany({
      where: { bookId: (book as { id: string }).id },
      select: { id: true, order: true },
      orderBy: { order: "asc" },
    });
    const first = chapters[0] as { id: string; order: number };
    await prisma.chapter.update({
      where: { id: first.id },
      data: { order: 77 },
    });
    try {
      await expect(makeService().discover(USER, EEC_CTX)).resolves.toEqual({
        available: true,
        guideKey: "eec-c1-cuerpo-antes-que-mente",
        guideVersion: 1,
      });
    } finally {
      await prisma.chapter.update({
        where: { id: first.id },
        data: { order: first.order },
      });
    }
  });

  it("the discovery INDEX is still keyed by position — recorded, not fixed", async () => {
    // Honest boundary. C.3R makes the applicability VERDICT identity-based;
    // `productionGuideDiscoveryCatalog` is still a `(bookSlug, chapterOrder)`
    // map, so after a reorder the guide is offered at neither number: not at
    // the old one (the unit there is now someone else's) and not at the new one
    // (nothing pins that context). Refusing is the safe half; following the
    // unit needs an identity-keyed index, which is a separate surface.
    try {
      await swapOrders(EEC, 1, 2);
      await expect(
        makeService().discover(USER, { bookSlug: EEC, chapterOrder: 2 }),
      ).resolves.toEqual({ available: false });
    } finally {
      await swapOrders(EEC, 1, 2);
    }
  });

  // ── Verdict vs failure, against a real connection ─────────────────────────

  it("a storage failure propagates instead of becoming 'no guide here'", async () => {
    const svc = makeService();
    const applicability = (
      svc as unknown as { applicability: GuideReaderApplicabilityService }
    ).applicability;
    const spy = vi
      .spyOn(applicability, "resolveUnitByNavigation")
      .mockRejectedValue(new Error("connection terminated unexpectedly"));
    try {
      await expect(svc.discover(USER, EEC_CTX)).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    // And with the failure removed, the same call answers again — proving the
    // rejection was the injected failure and not a broken fixture.
    await expect(svc.discover(USER, EEC_CTX)).resolves.toMatchObject({
      available: true,
    });
  });

  it("an entitlement denial is a verdict, and it is opaque", async () => {
    const svc = makeService();
    const access = (svc as unknown as { access: ContentAccessService }).access;
    const spy = vi
      .spyOn(access, "assertCanReadUnit")
      .mockRejectedValue(new ForbiddenException("PRO_REQUIRED"));
    try {
      await expect(svc.discover(USER, EEC_CTX)).resolves.toEqual({
        available: false,
      });
    } finally {
      spy.mockRestore();
    }
  });

  // ── Read-only, and cheap ──────────────────────────────────────────────────

  it("discovery writes nothing at all", async () => {
    const before = await writeCounts();
    const svc = makeService();
    await svc.discover(USER, EEC_CTX);
    await svc.discover(USER, PQP_CTX);
    await svc.discover(USER, { bookSlug: EEC, chapterOrder: 2 });
    await svc.discover(USER, { bookSlug: EEC, chapterOrder: 99 });
    expect(await writeCounts()).toEqual(before);
  });

  it("the whole discovery path costs a fixed, measured number of reads", async () => {
    // End to end inside the real transaction: the batched target resolution,
    // the reader's unit, and the entitlement gate. Measured rather than
    // asserted from a reading of the code.
    let queries = 0;
    const countingTx = (tx: object): object =>
      new Proxy(tx, {
        get(target, prop, recv) {
          const v = Reflect.get(target, prop, recv);
          if (prop === "$queryRaw" || prop === "$queryRawUnsafe") {
            return (...args: unknown[]) => {
              queries += 1;
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
                queries += 1;
                return (fn as (...a: unknown[]) => unknown).apply(m, args);
              };
            },
          });
        },
      });

    const counting = new Proxy(prisma, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (prop === "$transaction" && typeof v === "function") {
          return (fn: unknown, opts: unknown) =>
            (v as (...a: unknown[]) => unknown).call(
              target,
              typeof fn === "function"
                ? (tx: object) =>
                    (fn as (t: unknown) => unknown)(countingTx(tx))
                : fn,
              opts,
            );
        }
        return typeof v === "function" ? v.bind(target) : v;
      },
    }) as PrismaClient;

    await makeService(counting).discover(USER, EEC_CTX);
    const first = queries;
    queries = 0;
    await makeService(counting).discover(USER, PQP_CTX);
    // The same shape for either book: nothing here scales with the content.
    expect(queries).toBe(first);
    // eslint-disable-next-line no-console
    console.log(`DISCOVERY_APPLICABILITY_QUERIES=${first}`);
    expect(first).toBeGreaterThan(0);
  });
});
