import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaService } from "../prisma";
import type { ChapterExperienceDefinition } from "@psico/types";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { productionExperienceRepository } from "./experience-production-catalog";
import { ExperienceAdminService } from "./experience-admin.service";
import {
  applyReservations,
  BackfillAbort,
  measureReservations,
} from "./experience-reservation-backfill";

/**
 * C.3A (#639) — the binding bridge, against real PostgreSQL.
 *
 * Everything here is about two writers meeting. That cannot be modelled with a
 * mock: the guarantee is half advisory lock and half composite foreign key, and
 * only one of those exists in TypeScript. Races are forced with barriers, never
 * with sleeps, and every assertion ends by reading BOTH tables — which promise
 * resolved first is not the question.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "c3a_experience_binding_db";

const BOOK_A = "emociones-en-construccion";
const BOOK_B = "parejas-que-perduran";
const HEADING_A = EXERCISE_INGESTION_CATALOG[BOOK_A][0].practice.sourceHeading;
const HEADING_B = EXERCISE_INGESTION_CATALOG[BOOK_B][0].practice.sourceHeading;

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

/** A promise a test resolves when it decides the other side may continue. */
function barrier() {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let arrived!: () => void;
  const reached = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  return { gate, open, reached, arrive: arrived };
}

suite("C.3A · the binding bridge", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let service: ExperienceAdminService;
  let userId: string;
  let unitA: string;
  let unitB: string;

  /** The real EEC definition, as a draft. Its guide is the one A's chapter has. */
  async function eecDraft(
    over: Partial<ChapterExperienceDefinition> = {},
  ): Promise<ChapterExperienceDefinition> {
    const def = await productionExperienceRepository.getExact({
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 1,
    });
    if (!def) throw new Error("fixture missing: EEC v1");
    return { ...def, status: "DRAFT", ...over };
  }

  beforeAll(async () => {
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

    for (const [slug, title, heading, order] of [
      [BOOK_A, "Emociones en Construcción", HEADING_A, 1],
      [BOOK_B, "Parejas que Perduran", HEADING_B, 2],
    ] as const) {
      const book = await prisma.book.create({
        data: { slug, title, plan: "FREE" },
      });
      const ch = await prisma.chapter.create({
        data: { bookId: book.id, order, title: `C${order}`, isPublished: true },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "Intro.",
        },
      });
      await prisma.chapterBlock.create({
        data: { chapterId: ch.id, order: 1, kind: "HEADING", content: heading },
      });
    }
    await backfillContentCore(prisma);

    const u = await prisma.user.create({
      data: { email: "c3a-binding@example.test", name: "CMS", plan: "FREE" },
    });
    userId = u.id;
    service = new ExperienceAdminService(prisma as unknown as PrismaService);

    // The stable identities the whole suite reasons about, resolved once from
    // the published manifest — never from `chapterOrder`.
    unitA = await unitFor(BOOK_A, 1);
    unitB = await unitFor(BOOK_B, 2);
  }, 240_000);

  async function unitFor(bookSlug: string, order: number): Promise<string> {
    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: bookSlug },
      select: { publishedRevisionId: true },
    });
    const placed = await prisma.revisionUnit.findFirstOrThrow({
      where: { revisionId: edition.publishedRevisionId!, order },
      select: { unitId: true },
    });
    return placed.unitId;
  }

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
  }, 240_000);

  beforeEach(async () => {
    // Order matters, and the order is the constraint talking: a reservation
    // cannot be deleted while a row still references it, so the rows go first.
    await prisma.chapterExperienceVersion.deleteMany();
    await prisma.experienceGuideReservation.deleteMany();
  });

  /** Insert exactly what the PREVIOUS binary writes: no identity, no lineage. */
  async function insertLegacyRow(
    def: ChapterExperienceDefinition,
    status: "DRAFT" | "PUBLISHED" = "DRAFT",
  ): Promise<string> {
    const row = await prisma.chapterExperienceVersion.create({
      data: {
        experienceKey: def.experienceKey,
        experienceVersion: def.experienceVersion,
        bookSlug: def.bookSlug,
        chapterOrder: def.chapterOrder,
        status,
        definitionJson: def as unknown as never,
        createdByUserId: userId,
      },
      select: { id: true },
    });
    return row.id;
  }

  /** Both tables, as they finally stand. */
  async function state() {
    const [rows, reservations] = await Promise.all([
      prisma.chapterExperienceVersion.findMany({
        select: {
          experienceKey: true,
          experienceVersion: true,
          status: true,
          contentUnitId: true,
          guideKey: true,
        },
        orderBy: [{ experienceKey: "asc" }, { experienceVersion: "asc" }],
      }),
      prisma.experienceGuideReservation.findMany({
        select: { contentUnitId: true, experienceKey: true, guideKey: true },
        orderBy: [{ experienceKey: "asc" }],
      }),
    ]);
    return { rows, reservations };
  }

  // ── The bijection, under contention ──────────────────────────────────────

  it("two creates for the same guide: exactly one wins", async () => {
    const mine = await eecDraft();
    const theirs = await eecDraft({ experienceKey: "eec-c1-otra-travesia" });

    const results = await Promise.allSettled([
      service.createDraft(userId, mine),
      service.createDraft(userId, theirs),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const final = await state();
    expect(final.rows).toHaveLength(1);
    expect(final.reservations).toHaveLength(1);
    // Whoever won owns the guide, and the row carries the identity.
    expect(final.reservations[0]!.guideKey).toBe(
      "eec-c1-cuerpo-antes-que-mente",
    );
    expect(final.reservations[0]!.contentUnitId).toBe(unitA);
    expect(final.rows[0]!.contentUnitId).toBe(unitA);
  });

  it("the same lineage cannot hold two guides — structurally", async () => {
    await service.createDraft(userId, await eecDraft());

    // C.3A's API cannot even ask for this: `rebuildAsDraft` overwrites the pin
    // with the chapter's own, so selection does not exist yet. The rule still
    // has to hold the day C.4 lets an editor choose, and it holds in the
    // schema rather than in a service check — the primary key on
    // (contentUnitId, experienceKey) makes a second guide for one lineage
    // impossible to insert at all.
    await expect(
      prisma.experienceGuideReservation.create({
        data: {
          contentUnitId: unitA,
          experienceKey: "eec-c1-cuerpo-antes-que-mente",
          guideKey: "pqp-c1-contacto-sostenido",
        },
      }),
    ).rejects.toBeTruthy();

    const final = await state();
    expect(final.reservations).toHaveLength(1);
    expect(final.reservations[0]!.guideKey).toBe(
      "eec-c1-cuerpo-antes-que-mente",
    );
  });

  it("two lineages cannot hold one guide — structurally", async () => {
    await service.createDraft(userId, await eecDraft());
    await expect(
      prisma.experienceGuideReservation.create({
        data: {
          contentUnitId: unitA,
          experienceKey: "eec-c1-otra-travesia",
          guideKey: "eec-c1-cuerpo-antes-que-mente",
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("a reservation cannot be released while a version still uses it", async () => {
    await service.createDraft(userId, await eecDraft());
    // This is what makes "archiving releases the guide" a fact the database
    // keeps rather than a promise the service makes: releasing early is not
    // refused by a check, it is impossible.
    await expect(
      prisma.experienceGuideReservation.deleteMany({
        where: { contentUnitId: unitA },
      }),
    ).rejects.toBeTruthy();
  });

  it("versions of one lineage share the reservation", async () => {
    const first = await service.createDraft(userId, await eecDraft());
    await service.publish(first.id);
    await service.createNextDraft(userId, "eec-c1-cuerpo-antes-que-mente", 1);

    const final = await state();
    expect(final.rows).toHaveLength(2);
    // Two versions, ONE reservation: publishing v2 re-reserves nothing.
    expect(final.reservations).toHaveLength(1);
    expect(final.rows.every((r) => r.contentUnitId === unitA)).toBe(true);
  });

  it("different chapters progress in parallel", async () => {
    // Same guideKey would be a collision inside one chapter; across chapters it
    // is simply two chapters, and the chapter lock keys them apart.
    const a = await eecDraft();
    const b = await eecDraft({
      experienceKey: "pqp-c1-contacto-sostenido",
      bookSlug: BOOK_B,
      chapterOrder: 2,
      guidePin: { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 },
    });

    const [ra, rb] = await Promise.allSettled([
      service.createDraft(userId, a),
      service.createDraft(userId, b),
    ]);
    expect(ra.status).toBe("fulfilled");
    expect(rb.status).toBe("fulfilled");

    const final = await state();
    expect(final.reservations.map((r) => r.contentUnitId).sort()).toEqual(
      [unitA, unitB].sort(),
    );
  });

  // ── Living beside the previous binary ────────────────────────────────────

  it("a V0 row — null columns, no reservation — is legal and still seen", async () => {
    // Exactly what the previous binary writes: no identity, no lineage column,
    // no reservation, no lock. The composite FK is MATCH SIMPLE, so with nulls
    // it is not evaluated at all — which is what keeps the rollout legal.
    //
    // Same lineage as the code-owned definition on purpose: a legacy row of an
    // EXISTING experience is the realistic shape. A legacy row claiming the
    // same guide under a different key would be a pre-existing collision, and
    // that is a different test.
    await insertLegacyRow(await eecDraft({ experienceVersion: 7 }));

    // …and the bridge still refuses a NEW lineage on that guide, because it
    // scans the legacy row's JSON rather than only reading reservations.
    await expect(
      service.createDraft(
        userId,
        await eecDraft({ experienceKey: "eec-c1-otra-travesia" }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_GUIDE_BINDING_RESERVED",
      }),
    });

    const final = await state();
    expect(final.rows).toHaveLength(1);
    expect(final.rows[0]!.contentUnitId).toBeNull();
    expect(final.reservations).toHaveLength(0);
  });

  it("a pre-existing collision blocks every new write in that chapter", async () => {
    // Two legacy lineages already share the guide. C.3A does not repair it and
    // does not pick a winner: LEGACY_COLLISION_POLICY is fail-closed for new
    // writes while the published content keeps being served untouched.
    for (const key of ["eec-c1-una", "eec-c1-otra"]) {
      await insertLegacyRow(
        await eecDraft({ experienceKey: key, experienceVersion: 1 }),
        "PUBLISHED",
      );
    }

    await expect(
      service.createDraft(
        userId,
        await eecDraft({ experienceKey: "eec-c1-tercera" }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_BINDING_DIVERGENT",
      }),
    });

    const final = await state();
    expect(final.rows).toHaveLength(2);
    expect(final.reservations).toHaveLength(0);
  });

  it("a rollback leaves no phantom reservation", async () => {
    // A legacy row occupies the version number but reserves nothing, so the
    // create gets as far as inserting its reservation and THEN conflicts on
    // `(experienceKey, experienceVersion)`. Everything must go back together.
    const def = await eecDraft();
    await insertLegacyRow(def);

    await expect(service.createDraft(userId, def)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "EXPERIENCE_VERSION_EXISTS" }),
    });

    const final = await state();
    expect(final.reservations).toHaveLength(0);
    expect(final.rows).toHaveLength(1);
    expect(final.rows[0]!.contentUnitId).toBeNull();
  });

  // ── What a save and a publish may not do ─────────────────────────────────

  it("a save cannot move the binding", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    const hostile = await eecDraft({
      guidePin: { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 },
    });

    await service.saveDraft(created.id, hostile);

    const final = await state();
    expect(final.rows[0]!.guideKey).toBe("eec-c1-cuerpo-antes-que-mente");
    expect(final.reservations[0]!.guideKey).toBe(
      "eec-c1-cuerpo-antes-que-mente",
    );
  });

  it("publish revalidates the reservation under the lock", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    const published = await service.publish(created.id);
    expect(published.publishedAt).toBeTruthy();

    const final = await state();
    expect(final.rows[0]!.status).toBe("PUBLISHED");
    expect(final.rows[0]!.contentUnitId).toBe(unitA);
    expect(final.reservations).toHaveLength(1);
  });

  // ── Refusals that must leave nothing behind ──────────────────────────────

  it("an unresolved chapter identity has zero effects", async () => {
    const orphan = await eecDraft({ chapterOrder: 99 });
    await expect(service.createDraft(userId, orphan)).rejects.toBeTruthy();

    const final = await state();
    expect(final.rows).toHaveLength(0);
    expect(final.reservations).toHaveLength(0);
  });

  it("columns and reservation cannot diverge at all", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    // Not a check that runs and refuses: the composite foreign key means a row
    // pointing at a reservation that does not name it cannot be written.
    await expect(
      prisma.chapterExperienceVersion.update({
        where: { id: created.id },
        data: { guideKey: "pqp-c1-contacto-sostenido" },
      }),
    ).rejects.toBeTruthy();
  });

  it("columns disagreeing with the DEFINITION fail closed", async () => {
    // The one divergence the schema cannot prevent, because `definitionJson`
    // is JSON: the row's columns agree with a real reservation while the
    // definition inside it claims another guide. Nothing may be written into a
    // chapter in that state.
    const def = await eecDraft();
    await service.createDraft(userId, def);
    await prisma.chapterExperienceVersion.updateMany({
      where: { experienceKey: def.experienceKey },
      data: {
        definitionJson: {
          ...def,
          guidePin: { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 },
        } as unknown as never,
      },
    });

    await expect(
      service.createDraft(
        userId,
        await eecDraft({
          experienceKey: "eec-c1-tercera",
          experienceVersion: 1,
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_BINDING_DIVERGENT",
      }),
    });

    // And nothing was written while the contradiction stands.
    expect((await state()).reservations).toHaveLength(1);
  });

  // ── The C.3B command, prepared but never run against production ──────────

  it("measure is read-only and reports the groups it would create", async () => {
    const def = await eecDraft({ experienceKey: "eec-c1-legado" });
    await prisma.chapterExperienceVersion.create({
      data: {
        experienceKey: def.experienceKey,
        experienceVersion: 1,
        bookSlug: def.bookSlug,
        chapterOrder: def.chapterOrder,
        status: "PUBLISHED",
        definitionJson: def as unknown as never,
        createdByUserId: userId,
      },
    });

    const report = await measureReservations(prisma);
    expect(report.applied).toBe(false);
    expect(report.groups).toBe(1);
    expect(report.reservationsToCreate).toBe(1);
    expect((await state()).reservations).toHaveLength(0);
  });

  it("apply materialises the claims already in the data, and is replayable", async () => {
    const def = await eecDraft({ experienceKey: "eec-c1-legado" });
    for (const version of [1, 2]) {
      await prisma.chapterExperienceVersion.create({
        data: {
          experienceKey: def.experienceKey,
          experienceVersion: version,
          bookSlug: def.bookSlug,
          chapterOrder: def.chapterOrder,
          status: version === 1 ? "PUBLISHED" : "DRAFT",
          definitionJson: {
            ...def,
            experienceVersion: version,
          } as unknown as never,
          createdByUserId: userId,
        },
      });
    }

    const first = await applyReservations(prisma);
    expect(first.reservationsCreated).toBe(1);
    expect(first.columnsFilled).toBe(2);

    const again = await applyReservations(prisma);
    expect(again.reservationsCreated).toBe(0);

    const final = await state();
    expect(final.reservations).toHaveLength(1);
    expect(final.rows.every((r) => r.contentUnitId === unitA)).toBe(true);
    // The editorial binding itself was never rewritten.
    const stored = await prisma.chapterExperienceVersion.findFirstOrThrow({
      select: { definitionJson: true },
    });
    expect(
      (stored.definitionJson as { guidePin: { guideKey: string } }).guidePin
        .guideKey,
    ).toBe("eec-c1-cuerpo-antes-que-mente");
  });

  it("a legacy collision aborts the WHOLE backfill", async () => {
    const def = await eecDraft();
    for (const key of ["eec-c1-una", "eec-c1-otra"]) {
      await prisma.chapterExperienceVersion.create({
        data: {
          experienceKey: key,
          experienceVersion: 1,
          bookSlug: def.bookSlug,
          chapterOrder: def.chapterOrder,
          status: "PUBLISHED",
          definitionJson: { ...def, experienceKey: key } as unknown as never,
          createdByUserId: userId,
        },
      });
    }

    await expect(applyReservations(prisma)).rejects.toBeInstanceOf(
      BackfillAbort,
    );
    // Nothing partial: not one reservation, not one filled column.
    const final = await state();
    expect(final.reservations).toHaveLength(0);
    expect(final.rows.every((r) => r.contentUnitId === null)).toBe(true);
  });

  it("the backfill and a create are serialised by the GLOBAL lock", async () => {
    const legacy = await eecDraft({ experienceKey: "eec-c1-legado" });
    await prisma.chapterExperienceVersion.create({
      data: {
        experienceKey: legacy.experienceKey,
        experienceVersion: 1,
        bookSlug: legacy.bookSlug,
        chapterOrder: legacy.chapterOrder,
        status: "PUBLISHED",
        definitionJson: legacy as unknown as never,
        createdByUserId: userId,
      },
    });

    const b = barrier();
    // Hold the backfill open inside its transaction, with the global lock
    // taken, and try to create meanwhile. The create must not interleave.
    const backfill = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"experience:binding:global"}, 42))`;
      b.arrive();
      await b.gate;
      return "backfill-done";
    });

    await b.reached;
    let createSettled = false;
    const create = service.createDraft(userId, await eecDraft()).then(
      () => {
        createSettled = true;
      },
      () => {
        createSettled = true;
      },
    );

    // Nothing to sleep on: the assertion is that the create has NOT settled
    // while the lock is held, checked after the event loop has drained.
    await Promise.resolve();
    await Promise.resolve();
    expect(createSettled).toBe(false);

    b.open();
    await backfill;
    await create;
    expect(createSettled).toBe(true);
  });
});
