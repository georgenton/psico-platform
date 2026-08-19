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
import {
  decideReservationAuthority,
  EXPERIENCE_BINDING_SHAPE,
  probeBindingSchema,
  type BindingSchemaProbe,
} from "./experience-binding-schema";

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

  // ── The schema, read exactly ─────────────────────────────────────────────

  /**
   * Probe a MUTATED schema and throw the mutation away.
   *
   * Every negative control below describes a database that looks assembled and
   * enforces less than it appears to. None of them can be produced by running
   * the migrations, which is the point: they are what a hand-applied hotfix, a
   * half-finished cutover or a "helpful" index rebuild leave behind. DDL inside
   * a transaction is transactional in PostgreSQL, so the rollback is total.
   */
  const ROLLBACK = Symbol("rollback");
  async function probeWith(
    ddl: readonly string[],
  ): Promise<BindingSchemaProbe> {
    let probe: BindingSchemaProbe | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        for (const stmt of ddl) await tx.$executeRawUnsafe(stmt);
        probe = await probeBindingSchema(tx);
        throw ROLLBACK;
      });
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }
    if (probe === null) throw new Error("probe never ran");
    return probe;
  }

  it("reads the migrated schema as exactly the BRIDGE shape", async () => {
    const probe = await probeWith([]);
    expect(probe).toEqual({
      versionTable: true,
      reservationTable: true,
      unitTable: true,
      bindingColumns: true,
      // The cutover's half. C.3A deliberately leaves the column nullable: the
      // previous binary is still writing rows without it.
      identityNotNull: false,
      reservationPk: true,
      guideUnique: true,
      tripleUnique: true,
      versionUnitFk: true,
      reservationUnitFk: true,
      compositeFk: true,
      finalCheckNamePresent: false,
      finalCheckNameIsExact: false,
      finalCheckExactPresent: false,
    });
    expect(decideReservationAuthority(probe)).toBe("BRIDGE");
  });

  it("a foreign key over the right columns in the WRONG ORDER is not the one", async () => {
    // A perfectly valid three-column foreign key that permits exactly the
    // collision the real one forbids. A detector counting `array_length(conkey)`
    // would have called this BRIDGE.
    const probe = await probeWith([
      `ALTER TABLE "ChapterExperienceVersion" DROP CONSTRAINT "ChapterExperienceVersion_reservation_fkey"`,
      `CREATE UNIQUE INDEX "swapped_target" ON "ExperienceGuideReservation"("contentUnitId","guideKey","experienceKey")`,
      `ALTER TABLE "ChapterExperienceVersion" ADD CONSTRAINT "ChapterExperienceVersion_reservation_fkey"
         FOREIGN KEY ("contentUnitId","guideKey","experienceKey")
         REFERENCES "ExperienceGuideReservation"("contentUnitId","guideKey","experienceKey")
         ON DELETE RESTRICT ON UPDATE CASCADE`,
    ]);
    expect(probe.compositeFk).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("a PARTIAL unique index does not enforce the bijection", async () => {
    const probe = await probeWith([
      `DROP INDEX "ExperienceGuideReservation_contentUnitId_guideKey_key"`,
      `CREATE UNIQUE INDEX "ExperienceGuideReservation_contentUnitId_guideKey_key"
         ON "ExperienceGuideReservation"("contentUnitId","guideKey")
         WHERE "guideKey" <> 'x'`,
    ]);
    expect(probe.guideUnique).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("an INCLUDE column is not a key column", async () => {
    // Unique on `(contentUnitId)` alone, with `guideKey` merely carried. Its
    // column list reads right and its key is narrower than the rule needs.
    const probe = await probeWith([
      `DROP INDEX "ExperienceGuideReservation_contentUnitId_guideKey_key"`,
      `CREATE UNIQUE INDEX "ExperienceGuideReservation_contentUnitId_guideKey_key"
         ON "ExperienceGuideReservation"("contentUnitId") INCLUDE ("guideKey")`,
    ]);
    expect(probe.guideUnique).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("NOT VALID is present and proves nothing", async () => {
    const probe = await probeWith([
      `ALTER TABLE "ChapterExperienceVersion" DROP CONSTRAINT "ChapterExperienceVersion_reservation_fkey"`,
      `ALTER TABLE "ChapterExperienceVersion" ADD CONSTRAINT "ChapterExperienceVersion_reservation_fkey"
         FOREIGN KEY ("contentUnitId","experienceKey","guideKey")
         REFERENCES "ExperienceGuideReservation"("contentUnitId","experienceKey","guideKey")
         ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID`,
    ]);
    expect(probe.compositeFk).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("the referential ACTIONS are part of the shape", async () => {
    // CASCADE would let a reservation be deleted and take the version row with
    // it — silently discarding an editorial row to release a guide.
    const cascade = await probeWith([
      `ALTER TABLE "ChapterExperienceVersion" DROP CONSTRAINT "ChapterExperienceVersion_reservation_fkey"`,
      `ALTER TABLE "ChapterExperienceVersion" ADD CONSTRAINT "ChapterExperienceVersion_reservation_fkey"
         FOREIGN KEY ("contentUnitId","experienceKey","guideKey")
         REFERENCES "ExperienceGuideReservation"("contentUnitId","experienceKey","guideKey")
         ON DELETE CASCADE ON UPDATE CASCADE`,
    ]);
    expect(cascade.compositeFk).toBe(false);

    // SET NULL on the identity foreign key would quietly un-name the chapter an
    // archived row belongs to.
    const setNull = await probeWith([
      `ALTER TABLE "ChapterExperienceVersion" DROP CONSTRAINT "ChapterExperienceVersion_contentUnitId_fkey"`,
      `ALTER TABLE "ChapterExperienceVersion" ADD CONSTRAINT "ChapterExperienceVersion_contentUnitId_fkey"
         FOREIGN KEY ("contentUnitId") REFERENCES "ContentUnit"("id")
         ON DELETE SET NULL ON UPDATE CASCADE`,
    ]);
    expect(setNull.versionUnitFk).toBe(false);
    expect(decideReservationAuthority(setNull)).toBe("FAIL_CLOSED");
  });

  it("a CHECK wearing the cutover's name must BE the cutover's check", async () => {
    const probe = await probeWith([
      `ALTER TABLE "ChapterExperienceVersion"
         ADD CONSTRAINT "${EXPERIENCE_BINDING_SHAPE.finalCheckName}" CHECK (true)`,
    ]);
    expect(probe.finalCheckNamePresent).toBe(true);
    expect(probe.finalCheckNameIsExact).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("dropping the reservation table but keeping its residue is not LEGACY", async () => {
    // A rollback that removed the table and left the columns behind. Reporting
    // LEGACY_SCAN here would send this binary back to scanning JSON over a
    // schema that is half of something else.
    const probe = await probeWith([
      `ALTER TABLE "ChapterExperienceVersion" DROP CONSTRAINT "ChapterExperienceVersion_reservation_fkey"`,
      `DROP TABLE "ExperienceGuideReservation"`,
    ]);
    expect(probe.reservationTable).toBe(false);
    expect(probe.bindingColumns).toBe(true);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  // ── Identity is a fact the database keeps ────────────────────────────────

  it("a legacy row with no identity stays legal", async () => {
    // The whole rollout depends on this: the previous binary writes exactly
    // this shape, and neither the direct foreign key nor the composite one may
    // reject it.
    const id = await insertLegacyRow(await eecDraft());
    const row = await prisma.chapterExperienceVersion.findUniqueOrThrow({
      where: { id },
      select: { contentUnitId: true, guideKey: true },
    });
    expect(row).toEqual({ contentUnitId: null, guideKey: null });
  });

  it("a materialised row cannot name a unit that does not exist", async () => {
    await service.createDraft(userId, await eecDraft());
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "ChapterExperienceVersion" SET "contentUnitId" = 'unit_that_never_existed'`,
      ),
    ).rejects.toBeTruthy();
  });

  it("a chapter cannot be deleted out from under a row that names it", async () => {
    // RESTRICT on the DIRECT foreign key. The composite one cannot carry this:
    // MATCH SIMPLE stops evaluating it the moment `guideKey` goes null, which
    // is exactly what archiving does — so identity would be unprotected in the
    // one state where only identity is left.
    await service.createDraft(userId, await eecDraft());
    await expect(
      prisma.contentUnit.delete({ where: { id: unitA } }),
    ).rejects.toBeTruthy();
  });

  // ── Placement moves; the binding does not follow it ──────────────────────

  /**
   * Publish a manifest that puts `order` on a brand-new native unit, holding
   * the SAME edition row lock `publishDraftRevision` holds.
   *
   * This is the committed effect of a real publish — a new revision, its
   * manifest rows, and the pointer moved last — without dragging the CMS
   * entitlement gate into a test about locking. `open` lets the caller hold the
   * lock open while another transaction tries to bind.
   */
  async function republishWithNewUnitAtOrder(
    bookSlug: string,
    order: number,
    hold?: { reached: () => void; gate: Promise<void> },
  ): Promise<{ newUnitId: string; previousRevisionId: string }> {
    return prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ id: string; publishedRevisionId: string }>
        >`SELECT "id", "publishedRevisionId" FROM "Edition" WHERE "slug" = ${bookSlug} FOR UPDATE`;
        const edition = locked[0]!;
        if (hold) {
          hold.reached();
          await hold.gate;
        }

        const unit = await tx.contentUnit.create({
          data: {
            editionId: edition.id,
            unitKey: `native-${order}-${Date.now()}`,
          },
        });
        const version = await tx.contentUnitVersion.create({
          data: { unitId: unit.id, title: "Capítulo movido" },
        });
        const highest = await tx.revision.findFirstOrThrow({
          where: { editionId: edition.id },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const next = await tx.revision.create({
          data: {
            editionId: edition.id,
            number: highest.number + 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });
        const previous = await tx.revisionUnit.findMany({
          where: { revisionId: edition.publishedRevisionId },
          select: { unitId: true, unitVersionId: true, order: true },
        });
        // The incumbent moves one slot down; the new unit takes its number.
        for (const entry of previous) {
          await tx.revisionUnit.create({
            data: {
              revisionId: next.id,
              unitId: entry.unitId,
              unitVersionId: entry.unitVersionId,
              order: entry.order + 1000,
            },
          });
        }
        await tx.revisionUnit.create({
          data: {
            revisionId: next.id,
            unitId: unit.id,
            unitVersionId: version.id,
            order,
          },
        });
        await tx.edition.update({
          where: { id: edition.id },
          data: { publishedRevisionId: next.id },
        });
        return {
          newUnitId: unit.id,
          previousRevisionId: edition.publishedRevisionId,
        };
      },
      { timeout: 30_000 },
    );
  }

  /** Put the published pointer back, so the rest of the suite sees its fixture. */
  async function restorePublishedRevision(
    bookSlug: string,
    revisionId: string,
  ): Promise<void> {
    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: bookSlug },
      select: { id: true },
    });
    await prisma.edition.update({
      where: { id: edition.id },
      data: { publishedRevisionId: revisionId },
    });
  }

  it("a reorder mid-decision serialises: the binding lands on the unit that is really there", async () => {
    // The race this exists for. Without the edition row lock the binder reads
    // the manifest with nothing held, and a publish committing a moment later
    // leaves a row naming the unit that USED to be at that position.
    const b = barrier();
    let restore: string | null = null;
    try {
      const republish = republishWithNewUnitAtOrder(BOOK_A, 1, {
        reached: b.arrive,
        gate: b.gate,
      });
      await b.reached; // the publish holds the edition row

      let created = false;
      const create = service.createDraft(userId, await eecDraft()).then(
        (r) => {
          created = true;
          return r;
        },
        (e) => {
          created = true;
          throw e;
        },
      );

      // Nothing to sleep on: the claim is that the binder has NOT decided while
      // the publish holds the row, checked after the event loop drains.
      await Promise.resolve();
      await Promise.resolve();
      expect(created).toBe(false);

      b.open();
      const { newUnitId, previousRevisionId } = await republish;
      restore = previousRevisionId;
      await create;

      const { rows, reservations } = await state();
      // It bound to the unit the manifest names NOW — never to the old one.
      expect(rows[0]!.contentUnitId).toBe(newUnitId);
      expect(rows[0]!.contentUnitId).not.toBe(unitA);
      expect(reservations[0]!.contentUnitId).toBe(newUnitId);
    } finally {
      if (restore) await restorePublishedRevision(BOOK_A, restore);
    }
  });

  it("a row whose unit moved does not appear under the number it used to have", async () => {
    // `where: { bookSlug, chapterOrder }` — the old scope — would have listed
    // this row under whichever unit inherited its position. An editor would be
    // reading one chapter's experiences while looking at another's.
    await service.createDraft(userId, await eecDraft());
    let restore: string | null = null;
    try {
      const moved = await republishWithNewUnitAtOrder(BOOK_A, 1);
      restore = moved.previousRevisionId;

      const atOne = await service.listForChapter(BOOK_A, 1);
      expect(atOne.contentUnitId).toBe(moved.newUnitId);
      expect(atOne.experiences.filter((e) => e.source === "database")).toEqual(
        [],
      );

      // The original unit was pushed to 1001 by the helper; the row follows the
      // UNIT, not the number it was created under.
      const atMoved = await service.listForChapter(BOOK_A, 1001);
      expect(atMoved.contentUnitId).toBe(unitA);
      expect(
        atMoved.experiences.filter((e) => e.source === "database"),
      ).toHaveLength(1);
    } finally {
      if (restore) await restorePublishedRevision(BOOK_A, restore);
    }
  });

  it("saving a draft never follows a stale number onto another unit", async () => {
    // `chapterOrder` on a stored row is the position it was CREATED at, and
    // nothing updates it. Resolving a save by that number would move the draft
    // into whichever unit inherited it — taking its reservation along.
    const created = await service.createDraft(userId, await eecDraft());
    let restore: string | null = null;
    try {
      const moved = await republishWithNewUnitAtOrder(BOOK_A, 1);
      restore = moved.previousRevisionId;

      await service.saveDraft(created.id, await eecDraft());

      const { rows, reservations } = await state();
      expect(rows[0]!.contentUnitId).toBe(unitA);
      expect(rows[0]!.contentUnitId).not.toBe(moved.newUnitId);
      expect(reservations[0]!.contentUnitId).toBe(unitA);
    } finally {
      if (restore) await restorePublishedRevision(BOOK_A, restore);
    }
  });

  it("publishing never follows a stale number either", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    let restore: string | null = null;
    try {
      restore = (await republishWithNewUnitAtOrder(BOOK_A, 1))
        .previousRevisionId;
      await service.publish(created.id);
      const { rows } = await state();
      expect(rows[0]!.status).toBe("PUBLISHED");
      expect(rows[0]!.contentUnitId).toBe(unitA);
    } finally {
      if (restore) await restorePublishedRevision(BOOK_A, restore);
    }
  });

  it("a stale expectedContentUnitId is refused, not corrected", async () => {
    // The hint an editor's page was rendered with. After a reorder it names the
    // wrong unit, and the honest answer is a refusal the editor can see.
    await expect(
      service.createDraft(userId, await eecDraft(), unitB),
    ).rejects.toMatchObject({
      response: { code: "EXPERIENCE_CHAPTER_IDENTITY_UNRESOLVED" },
    });
    expect((await state()).rows).toEqual([]);
  });

  it("a matching expectedContentUnitId changes nothing", async () => {
    await service.createDraft(userId, await eecDraft(), unitA);
    const { rows } = await state();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.contentUnitId).toBe(unitA);
  });

  // ── The C.3B command, prepared but never run against production ──────────

  /**
   * A row exactly as the PREVIOUS binary left it.
   *
   * The lineage is the code-owned one on purpose. In this chapter that guide
   * belongs to a definition the build ships, so a legacy row claiming it under
   * ANY other key is a real collision — which is what `eec-c1-legado` used to
   * be here, and what the code-owned check now refuses. Reusing the key is the
   * actual migration path: code-owned v1, database v2.
   *
   * `definitionJson.status` matches the column because that is what `publish`
   * wrote: it re-validates the definition with `status: "PUBLISHED"` before
   * storing it. A fixture where they disagree describes a row nothing produced.
   */
  const LEGACY_KEY = "eec-c1-cuerpo-antes-que-mente";
  async function insertPreBridgeRow(
    version: number,
    status: "DRAFT" | "PUBLISHED",
  ): Promise<void> {
    const def = await eecDraft({
      experienceKey: LEGACY_KEY,
      experienceVersion: version,
      status,
    });
    await prisma.chapterExperienceVersion.create({
      data: {
        experienceKey: def.experienceKey,
        experienceVersion: version,
        bookSlug: def.bookSlug,
        chapterOrder: def.chapterOrder,
        status,
        definitionJson: def as unknown as never,
        createdByUserId: userId,
      },
    });
  }

  it("measure is read-only and reports the groups it would create", async () => {
    await insertPreBridgeRow(1, "PUBLISHED");

    const report = await measureReservations(prisma);
    expect(report.applied).toBe(false);
    expect(report.groups).toBe(1);
    expect(report.reservationsToCreate).toBe(1);
    expect((await state()).reservations).toHaveLength(0);
  });

  it("apply materialises the claims already in the data, and is replayable", async () => {
    await insertPreBridgeRow(1, "PUBLISHED");
    await insertPreBridgeRow(2, "DRAFT");

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

  it("a legacy row cannot take a guide a SHIPPED experience already holds", async () => {
    // The collision that would otherwise appear the day a deploy replaced the
    // catalog — which is the worst possible moment to find it. The row claims
    // this chapter's guide under a lineage the build does not ship.
    const def = await eecDraft({ experienceKey: "eec-c1-intrusa" });
    await prisma.chapterExperienceVersion.create({
      data: {
        experienceKey: def.experienceKey,
        experienceVersion: 1,
        bookSlug: def.bookSlug,
        chapterOrder: def.chapterOrder,
        status: "DRAFT",
        definitionJson: def as unknown as never,
        createdByUserId: userId,
      },
    });

    const measured = await measureReservations(prisma);
    expect(measured.anomalies.map((a) => a.kind)).toContain(
      "CODE_OWNED_GUIDE_COLLISION",
    );
    await expect(applyReservations(prisma)).rejects.toBeInstanceOf(
      BackfillAbort,
    );
    // And the code-owned claim is never MATERIALISED: a reservation nothing
    // references could never be released, because the foreign key that makes
    // releasing safe is the one that would block it forever.
    expect((await state()).reservations).toEqual([]);
  });

  it("a HALF materialised row stops the run instead of being completed", async () => {
    await insertPreBridgeRow(1, "DRAFT");
    // MATCH SIMPLE does not evaluate the composite key with a null column, so
    // the database lets this exist. Nothing else would catch it.
    await prisma.$executeRawUnsafe(
      `UPDATE "ChapterExperienceVersion" SET "guideKey" = '${LEGACY_KEY}'`,
    );

    const measured = await measureReservations(prisma);
    expect(measured.anomalies.map((a) => a.kind)).toEqual([
      "ROW_HALF_MATERIALISED",
    ]);
    await expect(applyReservations(prisma)).rejects.toBeInstanceOf(
      BackfillAbort,
    );
    expect((await state()).reservations).toEqual([]);
  });

  it("a definition that has drifted from its own row stops the run", async () => {
    await insertPreBridgeRow(1, "DRAFT");
    const def = await eecDraft({ experienceKey: LEGACY_KEY });
    await prisma.chapterExperienceVersion.updateMany({
      data: {
        definitionJson: {
          ...def,
          // The definition now describes a different chapter than the row does.
          chapterOrder: 7,
        } as unknown as never,
      },
    });

    const measured = await measureReservations(prisma);
    expect(measured.anomalies.map((a) => a.kind)).toEqual([
      "DEFINITION_DISAGREES_WITH_ROW",
    ]);
  });

  it("a moved unit is COUNTED, not treated as a contradiction", async () => {
    // `chapterOrder` is a locator nothing updates, so a reorder after C.3A
    // leaves a materialised row whose number is stale and whose identity is
    // right. Aborting on it would be a gate with no remedy — there is no CMS
    // action that could make the number agree again.
    await service.createDraft(userId, await eecDraft());
    let restore: string | null = null;
    try {
      restore = (await republishWithNewUnitAtOrder(BOOK_A, 1))
        .previousRevisionId;
      const measured = await measureReservations(prisma);
      expect(measured.anomalies).toEqual([]);
      expect(measured.rowsWithPositionDrift).toBe(1);
      expect(measured.rowsAlreadyMaterialised).toBe(1);
      expect(measured.rowsLegacy).toBe(0);
    } finally {
      if (restore) await restorePublishedRevision(BOOK_A, restore);
    }
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
