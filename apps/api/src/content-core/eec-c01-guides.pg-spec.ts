import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaService } from "../prisma";
import { backfillContentCore } from "./backfill";
import { activateBookLearningCatalog } from "./learning-activation";
import { ExperienceAdminService } from "../experience/experience-admin.service";
import { seedPracticeHeadings } from "./test-support/seed-practice-headings";
import {
  loadManifests,
  planGuides,
  validateManifests,
  type GuideManifest,
} from "./eec-c01-guides-cli";
import {
  createDrafts,
  previewReport,
  runApplyTargets,
  verifyDrafts,
} from "./eec-c01-guides-apply";
import { productionGuideDiscoveryCatalog } from "../guide/guide-discovery-catalog";

/**
 * EEC-C01 — the guided suite, end to end, against real PostgreSQL.
 *
 * The unit tests prove the manifests are well formed. This proves the only
 * thing they cannot: that running the CLI against a database actually produces
 * five DRAFT experiences, each pinned to its OWN guide, sharing one content
 * unit, invisible to a reader, and previewable without a grading datum.
 *
 * The fixture is deliberately the shape production is in — a legacy chapter,
 * backfilled into Content Core, with the editorial headings the catalogs anchor
 * to — because every failure this suite is meant to catch is a failure of the
 * chain, not of any one function. Prose is filler except for the anchor
 * fingerprints, which are the short phrases the manifests already carry.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "eec_c01_guides_db";
const API_DIR = process.cwd();
const ROOT = join(API_DIR, "../..");
const MANIFEST_DIR = join(ROOT, "artifacts/eec/C01/v1.0/feelverse/guides");
const CHAPTER_FILE = join(ROOT, "content/books/eec/C01/chapter.md");

const BOOK = "emociones-en-construccion";
const PILOT = "eec-c1-cuerpo-antes-que-mente";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("EEC-C01 · manifests → targets → five DRAFTs (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let service: ExperienceAdminService;
  let manifests: GuideManifest[];
  let canonicalSha: string;
  let userId: string;
  let unitId: string;

  beforeAll(async () => {
    manifests = loadManifests(MANIFEST_DIR);
    canonicalSha = createHash("sha256")
      .update(readFileSync(CHAPTER_FILE, "utf8"), "utf8")
      .digest("hex");

    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const book = await prisma.book.create({
      data: { slug: BOOK, title: "Emociones en Construcción", plan: "FREE" },
    });
    const chapter = await prisma.chapter.create({
      data: {
        bookId: book.id,
        order: 1,
        title: "Capítulo 1",
        isPublished: true,
      },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: chapter.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "Apertura.",
      },
    });
    // The anchors the manifests declare: the heading, then a paragraph carrying
    // the fingerprint. Both are what `plan` counts, and `expectedMatchCount: 1`
    // is only meaningful if the fixture can actually be counted.
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
    // The activation is book-wide and the concept catalog names chapters 2 and
    // 3, so they have to exist or it refuses the whole run. Filler prose: this
    // suite is about chapter 1, and the other two only need to be resolvable.
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
    // Parejas as well, and not for decoration: the shipped catalog's PUBLISHED
    // claims are resolved as a SET, so one definition whose chapter cannot be
    // placed refuses binding writes in every chapter — including this one.
    const other = await prisma.book.create({
      data: {
        slug: "parejas-que-perduran",
        title: "Parejas que Perduran",
        plan: "FREE",
      },
    });
    for (const o of [1, 2]) {
      const ch = await prisma.chapter.create({
        data: {
          bookId: other.id,
          order: o,
          title: `PQP ${o}`,
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
      // The book's chapter 1 is platform order 2 — its practices anchor there.
      if (o === 2)
        await seedPracticeHeadings(prisma, ch.id, "parejas-que-perduran");
    }
    await backfillContentCore(prisma);

    // Parejas' own targets, for the same reason: without them its shipped
    // definition has no chapter, and the set fails closed.
    await activateBookLearningCatalog(prisma, "parejas-que-perduran");

    const operator = await prisma.user.create({
      data: {
        email: "eec-c01-guides@example.test",
        name: "CMS",
        plan: "FREE",
        role: "ADMIN",
      },
    });
    userId = operator.id;
    service = new ExperienceAdminService(prisma as unknown as PrismaService);
  }, 300_000);

  afterAll(async () => {
    try {
      if (prisma) await prisma.$disconnect();
    } catch {
      /* the drop below is what matters */
    }
    try {
      if (pool) await pool.end();
    } catch {
      /* idem */
    }
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  }, 120_000);

  // ── The manifests, against the chapter that is actually in the database ───

  it("1 · the manifests validate against the canonical chapter", () => {
    expect(validateManifests(manifests, canonicalSha)).toEqual([]);
  });

  it("2 · plan is read-only and resolves one unit for all five", async () => {
    const before = await prisma.chapterExperienceVersion.count();
    const plan = await planGuides(prisma, manifests, "test", false);
    expect(await prisma.chapterExperienceVersion.count()).toBe(before);
    expect(plan.publishedRevisionNumber).toBeGreaterThan(0);
    expect(plan.contentUnitId).toBeTruthy();
    // A test database mints its own chapter id, so the declared key — derived
    // from production's — is expected NOT to match here. `main.ts` refuses this
    // on a deployed box; here it is the normal case.
    expect(plan.unitKeyMatches).toBe(false);
    expect(plan.drafts.map((d) => d.action)).toEqual(Array(5).fill("CREATE"));
    unitId = plan.contentUnitId;
  }, 60_000);

  it("3 · every anchor resolves to exactly one heading and one fingerprint", async () => {
    const plan = await planGuides(prisma, manifests, "test", false);
    for (const a of plan.anchors) {
      expect({
        ...a,
        headingMatches: a.headingMatches,
        fingerprintMatches: a.fingerprintMatches,
      }).toEqual({
        guideKey: a.guideKey,
        headingMatches: 1,
        fingerprintMatches: 1,
      });
    }
  }, 60_000);

  // ── Targets ───────────────────────────────────────────────────────────────

  it("4 · apply-targets dry-run writes nothing", async () => {
    const before = [
      await prisma.concept.count(),
      await prisma.exercise.count(),
    ];
    const r = await runApplyTargets(prisma, manifests, false);
    expect(r.applied).toBe(false);
    expect([
      await prisma.concept.count(),
      await prisma.exercise.count(),
    ]).toEqual(before);
  }, 60_000);

  it("5 · apply-targets materialises every concept, practice and recall", async () => {
    expect((await runApplyTargets(prisma, manifests, true)).ok).toBe(true);
    for (const m of manifests) {
      expect(
        await prisma.concept.findUnique({
          where: { conceptKey: m.conceptKey },
        }),
      ).toBeTruthy();
      expect(
        await prisma.exercise.findUnique({ where: { id: m.practiceKey } }),
      ).toBeTruthy();
      expect(
        await prisma.exercise.findUnique({ where: { id: m.recallKey } }),
      ).toBeTruthy();
    }
    const plan = await planGuides(prisma, manifests, "test", false);
    expect(plan.targets.every((t) => t.action === "VERIFY")).toBe(true);
  }, 120_000);

  it("5b · with the targets gone, apply-targets creates them", async () => {
    // The backfill already materialises this book's catalog, so the case above
    // proves the activation VERIFIES. That leaves the branch that actually
    // writes untested — so here the chapter's targets are removed first and the
    // same command has to put them back.
    const keys = manifests.flatMap((m) => [m.practiceKey, m.recallKey]);
    const conceptKeys = manifests.map((m) => m.conceptKey);
    await prisma.exercise.deleteMany({ where: { id: { in: keys } } });
    await prisma.conceptLink.deleteMany({
      where: { concept: { conceptKey: { in: conceptKeys } } },
    });
    await prisma.concept.deleteMany({
      where: { conceptKey: { in: conceptKeys } },
    });

    const plan = await planGuides(prisma, manifests, "test", false);
    expect(plan.targets.filter((t) => t.action === "CREATE")).toHaveLength(15);

    const r = await runApplyTargets(prisma, manifests, true);
    expect(r.ok).toBe(true);
    expect(
      (r.stats as { conceptsCreated: number; exercisesCreated: number })
        .conceptsCreated,
    ).toBeGreaterThan(0);
    expect(
      (r.stats as { exercisesCreated: number }).exercisesCreated,
    ).toBeGreaterThan(0);

    const after = await planGuides(prisma, manifests, "test", false);
    expect(after.targets.every((t) => t.action === "VERIFY")).toBe(true);
  }, 180_000);

  it("6 · replaying apply-targets is a no-op", async () => {
    const before = [
      await prisma.concept.count(),
      await prisma.exercise.count(),
    ];
    expect((await runApplyTargets(prisma, manifests, true)).ok).toBe(true);
    expect([
      await prisma.concept.count(),
      await prisma.exercise.count(),
    ]).toEqual(before);
  }, 120_000);

  // ── The five drafts ───────────────────────────────────────────────────────

  it("7 · create-drafts dry-run creates nothing", async () => {
    const r = await createDrafts(
      prisma,
      service,
      manifests,
      userId,
      false,
      unitId,
    );
    expect(r.drafts.map((d) => d.action)).toEqual(Array(5).fill("SKIPPED"));
    expect(await prisma.chapterExperienceVersion.count()).toBe(0);
  }, 60_000);

  it("8 · create-drafts lands five DRAFTs, each on its own guide", async () => {
    const r = await createDrafts(
      prisma,
      service,
      manifests,
      userId,
      true,
      unitId,
    );
    // Asserted on the detail, not just the verdict: a refusal here carries the
    // code that says WHY, and losing it to a bare `false` is a wasted run.
    expect(
      r.drafts.map((d) => `${d.action}${d.detail ? ` ${d.detail}` : ""}`),
    ).toEqual(Array(5).fill("CREATED"));
    expect(r.ok).toBe(true);

    const rows = await prisma.chapterExperienceVersion.findMany({
      select: {
        experienceKey: true,
        guideKey: true,
        status: true,
        contentUnitId: true,
      },
      orderBy: { experienceKey: "asc" },
    });
    expect(rows).toHaveLength(5);
    expect(rows.every((x) => x.status === "DRAFT")).toBe(true);
    expect(new Set(rows.map((x) => x.contentUnitId)).size).toBe(1);
    // The point of the explicit pin: five drafts, five DIFFERENT guides, and
    // not one of them the pilot the V1 fallback would have supplied.
    expect(new Set(rows.map((x) => x.guideKey)).size).toBe(5);
    expect(rows.map((x) => x.guideKey)).not.toContain(PILOT);
    for (const m of manifests) {
      expect(
        rows.find((x) => x.experienceKey === m.experienceKey)?.guideKey,
      ).toBe(m.guideKey);
    }
  }, 180_000);

  it("9 · replaying create-drafts is a no-op, not a second row", async () => {
    const r = await createDrafts(
      prisma,
      service,
      manifests,
      userId,
      true,
      unitId,
    );
    expect(r.ok).toBe(true);
    expect(r.drift).toBe(false);
    expect(r.drafts.map((d) => d.action)).toEqual(Array(5).fill("NOOP"));
    expect(await prisma.chapterExperienceVersion.count()).toBe(5);
  }, 120_000);

  it("10 · a row whose guide disagrees stops the batch instead of being overwritten", async () => {
    // The disagreement is introduced in the MANIFEST, not in the database: the
    // stored row is tied to its reservation by a composite foreign key, so
    // rewriting its guide by hand is not a state the system can reach. What can
    // happen is a manifest that names a different guide than the row already
    // bound — an editor's change, arriving after the draft exists — and that is
    // exactly the case this branch exists for.
    const drifted = manifests.map((m, i) =>
      i === 0 ? { ...m, guideKey: manifests[1].guideKey } : m,
    );
    const before = await prisma.chapterExperienceVersion.findMany({
      select: { id: true, experienceKey: true, guideKey: true, status: true },
      orderBy: { experienceKey: "asc" },
    });

    const r = await createDrafts(
      prisma,
      service,
      drifted,
      userId,
      true,
      unitId,
    );
    expect(r.ok).toBe(false);
    expect(r.drift).toBe(true);
    expect(r.drafts[0].action).toBe("DRIFT");
    // The whole set is inspected — a report that stopped at the first problem
    // would send an operator round the loop once per manifest — but nothing is
    // written, and `applied` says so.
    expect(r.drafts).toHaveLength(5);
    expect(r.applied).toBe(false);

    // Untouched. Refusing IS the behaviour.
    expect(
      await prisma.chapterExperienceVersion.findMany({
        select: { id: true, experienceKey: true, guideKey: true, status: true },
        orderBy: { experienceKey: "asc" },
      }),
    ).toEqual(before);
  }, 120_000);

  // ── What must be true afterwards, including what must NOT ────────────────

  it("11 · verify-drafts passes with the flag off", async () => {
    const r = await verifyDrafts(prisma, manifests, false);
    expect(r.checks.fiveDrafts).toBe(true);
    expect(r.checks.allDraft).toBe(true);
    expect(r.checks.versionOne).toBe(true);
    expect(r.checks.pinsMatchManifests).toBe(true);
    expect(r.checks.sameUnit).toBe(true);
    expect(r.checks.flagOff).toBe(true);
    expect(r.checks.pilotUntouched).toBe(true);
    expect(r.checks.noDraftClaimsPilotGuide).toBe(true);
    expect(r.checks.noCorrectOptionInDefinitions).toBe(true);
    expect(r.ok).toBe(true);
  }, 60_000);

  it("12 · verify-drafts refuses to pass while the route is lit", async () => {
    expect((await verifyDrafts(prisma, manifests, true)).checks.flagOff).toBe(
      false,
    );
  }, 60_000);

  it("13 · the drafts are invisible: discovery is dark and V1 still gets the pilot", () => {
    // The kill switch is OFF in tests, so a reader is offered nothing…
    expect(productionGuideDiscoveryCatalog.listContext(BOOK, 1)).toEqual([]);
    // …and the V1 adapter keeps answering with the historical pilot, which is
    // the compatibility this whole phase is built around.
    expect(
      productionGuideDiscoveryCatalog.getExactContext(BOOK, 1)?.guideKey,
    ).toBe(PILOT);
  });

  it("14 · a published experience is not among them", async () => {
    expect(
      await prisma.chapterExperienceVersion.count({
        where: { status: "PUBLISHED" },
      }),
    ).toBe(0);
  }, 60_000);

  // ── The preview an editor would open ─────────────────────────────────────

  it("15 · preview-report describes five previews with no grading datum", async () => {
    const r = await previewReport(prisma, manifests);
    expect(r.ok).toBe(true);
    expect(r.previews).toHaveLength(5);
    for (const p of r.previews) {
      expect(p.correctOptionKeyExposed).toBe(false);
      expect(p.publicRecallOptionsPresent).toBe(true);
      expect(p.anchorResolved).toBe(true);
      expect(p.sceneCount).toBeGreaterThanOrEqual(7);
      expect(p.sceneKinds[0]).toBe("INTRO");
      expect(p.sceneKinds[p.sceneKinds.length - 1]).toBe("SUMMARY");
      expect(p.previewEndpointOrUrl).toContain(p.draftId);
    }
  }, 60_000);

  it("16 · the correct answer stays server-side, in the catalog only", async () => {
    const stored = await prisma.chapterExperienceVersion.findMany({
      select: { definitionJson: true },
    });
    expect(JSON.stringify(stored)).not.toContain("correctOptionKey");
    // Not because it does not exist — because it lives where a client cannot
    // read it.
    const recall = await prisma.exercise.findUniqueOrThrow({
      where: { id: manifests[0].recallKey },
      select: { content: true },
    });
    expect(JSON.stringify(recall.content)).toContain("correctOptionKey");
  }, 60_000);
});
