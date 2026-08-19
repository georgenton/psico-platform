import { execSync } from "node:child_process";
import { PrismaClient, type Prisma } from "@prisma/client";
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
  BACKFILL_ANOMALY,
  measureReservations,
} from "./experience-reservation-backfill";
import {
  decideReservationAuthority,
  EXPERIENCE_BINDING_SHAPE,
  probeBindingSchema,
  type BindingSchemaProbe,
} from "./experience-binding-schema";
import { codeOwnedClaimsByUnit } from "./experience-code-owned-identity";
import { GUIDE_READER_ANCHOR } from "@psico/types";

/** The lineage every fixture here works with, taken from the catalog. */
const EEC_GUIDE_KEY = GUIDE_READER_ANCHOR.guideKey;

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

    /**
     * This suite models the BRIDGE phase, and says so to the schema.
     *
     * `migrate deploy` applies every migration in the tree, so on the cutover
     * branch this disposable database also gets the constraint that ENDS the
     * bridge — the one that makes a row with null binding columns illegal.
     * Those rows are the whole subject here: they are what the previous binary
     * writes while both are live.
     *
     * Dropping it is not weakening a guarantee. It is stating which phase these
     * tests are about, in a throwaway database, with `IF EXISTS` so the same
     * file runs unchanged on the branch where the constraint does not exist yet.
     * That the constraint refuses those rows is asserted where it belongs, in
     * `experience-binding-cutover.pg-spec.ts`.
     */
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ChapterExperienceVersion" DROP CONSTRAINT IF EXISTS "ChapterExperienceVersion_binding_shape_check"',
    );
    // The other half of the cutover, for the same reason. `NOT NULL` and the
    // CHECK land in ONE migration precisely so no replica can observe one
    // without the other — which is also why rewinding one here means rewinding
    // both, or this database would be in the half-applied shape the authority
    // detector calls FAIL_CLOSED.
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ChapterExperienceVersion" ALTER COLUMN "contentUnitId" DROP NOT NULL',
    );

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

  /**
   * Insert exactly what the PREVIOUS binary writes: no identity, no lineage.
   *
   * Raw SQL, and that is the point rather than a convenience. On the cutover
   * branch the generated Prisma client is built from a schema where
   * `contentUnitId` is NOT NULL, so a row without it is not expressible through
   * the client AT ALL — the create input has no shape for it. The DDL was
   * rewound above; the client cannot be. Writing the statement the old binary's
   * client would have produced is the faithful way to reproduce its rows.
   */
  async function insertLegacyRow(
    def: ChapterExperienceDefinition,
    status: "DRAFT" | "PUBLISHED" = "DRAFT",
  ): Promise<string> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "ChapterExperienceVersion"
        ("id", "experienceKey", "experienceVersion", "bookSlug", "chapterOrder",
         "status", "definitionJson", "createdByUserId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${def.experienceKey}, ${def.experienceVersion},
              ${def.bookSlug}, ${def.chapterOrder},
              ${status}::"ExperienceVersionStatus",
              ${JSON.stringify(def)}::jsonb, ${userId}, now(), now())
      RETURNING "id"`;
    return rows[0]!.id;
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
    also?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<BindingSchemaProbe> {
    let probe: BindingSchemaProbe | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        for (const stmt of ddl) await tx.$executeRawUnsafe(stmt);
        probe = await probeBindingSchema(tx);
        // Anything else that has to be observed while the mutation still
        // exists. Outside the transaction it is gone.
        await also?.(tx);
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
      columnTypes: true,
      reservationNotNull: true,
      indexMethod: true,
      // The cutover's half. C.3A deliberately leaves the column nullable: the
      // previous binary is still writing rows without it.
      identityNotNull: false,
      // Nullable in BOTH phases — archiving releases the guide by nulling it.
      versionGuideNullable: true,
      // NOT NULL in both. It is the lineage.
      versionExperienceKeyNotNull: true,
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

  it("a NULLABLE reservation guideKey is refused, names and keys intact", async () => {
    // The negative control the fingerprint was missing. Every index keeps its
    // name, every foreign key keeps its shape — and the bijection acquires a
    // hole: a row meaning "this lineage reserves nothing", one allowed per
    // chapter by the unique index, invisible to the composite key because
    // MATCH SIMPLE stops evaluating it.
    const probe = await probeWith([
      `ALTER TABLE "ExperienceGuideReservation" ALTER COLUMN "guideKey" DROP NOT NULL`,
    ]);
    expect(probe.reservationNotNull).toBe(false);
    // Everything that USED to be checked still passes.
    expect(probe.guideUnique).toBe(true);
    expect(probe.tripleUnique).toBe(true);
    expect(probe.compositeFk).toBe(true);
    expect(probe.reservationPk).toBe(true);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("a widened column type is not the contract", async () => {
    const probe = await probeWith([
      `ALTER TABLE "ExperienceGuideReservation" ALTER COLUMN "guideKey" TYPE VARCHAR(255)`,
    ]);
    expect(probe.columnTypes).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("the SIXTH column's type is pinned too: reservation.experienceKey", async () => {
    // The one the earlier fingerprint left out. It is half of the primary key
    // and one of the three columns the composite foreign key resolves against,
    // so a type change here is a change to the bijection's own key — while
    // every NAME survives: the primary key, both uniques and all three foreign
    // keys are still present and still validated.
    const probe = await probeWith([
      `ALTER TABLE "ExperienceGuideReservation" ALTER COLUMN "experienceKey" TYPE VARCHAR(255)`,
    ]);
    expect(probe.columnTypes).toBe(false);
    expect(probe.reservationPk).toBe(true);
    expect(probe.guideUnique).toBe(true);
    expect(probe.tripleUnique).toBe(true);
    expect(probe.compositeFk).toBe(true);
    expect(probe.reservationUnitFk).toBe(true);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("adding and dropping an UNGOVERNED column changes no authority", async () => {
    // This used to be a failure, and it was a false positive with teeth:
    // `attisdropped` tombstones are permanent, so ONE unrelated column dropped
    // by any migration — including ones that predate this contract — would have
    // made the detector refuse a perfectly correct schema, with the CMS down
    // and no predicate naming why.
    //
    // Nothing governed moved: `scratch` is in no key, no index, no foreign key
    // and no CHECK, and every predicate here resolves columns by NAME with
    // dropped ones excluded.
    //
    // The tombstone count is read INSIDE the same transaction, before the
    // rollback — outside it the mutation is gone and the assertion would pass
    // over a schema that never had a tombstone at all.
    let tombstones = -1;
    const probe = await probeWith(
      [
        `ALTER TABLE "ExperienceGuideReservation" ADD COLUMN "scratch" TEXT`,
        `ALTER TABLE "ExperienceGuideReservation" DROP COLUMN "scratch"`,
        `ALTER TABLE "ChapterExperienceVersion" ADD COLUMN "scratch2" TEXT`,
        `ALTER TABLE "ChapterExperienceVersion" DROP COLUMN "scratch2"`,
      ],
      async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) AS count FROM pg_attribute
           WHERE attrelid IN (to_regclass('public."ExperienceGuideReservation"'),
                              to_regclass('public."ChapterExperienceVersion"'))
             AND attisdropped`;
        tombstones = Number(row?.count ?? -1);
      },
    );
    expect(tombstones).toBe(2);
    expect(decideReservationAuthority(probe)).toBe("BRIDGE");
  });

  it("but dropping a GOVERNED column is caught by what it took with it", async () => {
    // The case the tombstone rule was reaching for, decided from the governed
    // structure instead: dropping `guideKey` takes the unique index, the triple
    // and the composite foreign key with it.
    const probe = await probeWith([
      `ALTER TABLE "ExperienceGuideReservation" DROP COLUMN "guideKey" CASCADE`,
    ]);
    expect(probe.columnTypes).toBe(false);
    expect(probe.guideUnique).toBe(false);
    expect(probe.tripleUnique).toBe(false);
    expect(probe.compositeFk).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("a premature contentUnitId NOT NULL is half of C.3C, not a bridge", async () => {
    // The cutover's two halves land in ONE migration. This shape is that
    // migration stopped in the middle, read from the side where the CHECK is
    // the part still missing — and reporting BRIDGE would hand a writer a
    // schema whose rules nobody had finished installing.
    const probe = await probeWith([
      `DELETE FROM "ChapterExperienceVersion" WHERE "contentUnitId" IS NULL`,
      `ALTER TABLE "ChapterExperienceVersion" ALTER COLUMN "contentUnitId" SET NOT NULL`,
    ]);
    expect(probe.identityNotNull).toBe(true);
    expect(probe.finalCheckExactPresent).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("a NOT NULL version guideKey would make ARCHIVED unreachable", async () => {
    // Archiving RELEASES the guide by setting this column to null. Tightened,
    // the release becomes impossible — and it would fail at the first archive
    // an editor attempted, not at deploy time.
    const probe = await probeWith([
      `DELETE FROM "ChapterExperienceVersion" WHERE "guideKey" IS NULL`,
      `ALTER TABLE "ChapterExperienceVersion" ALTER COLUMN "guideKey" SET NOT NULL`,
    ]);
    expect(probe.versionGuideNullable).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("a nullable version experienceKey is refused", async () => {
    // Nullable, a row could belong to no lineage while still naming a unit and
    // a guide — and MATCH SIMPLE would stop evaluating the composite foreign
    // key for exactly that row.
    const probe = await probeWith([
      `ALTER TABLE "ChapterExperienceVersion" ALTER COLUMN "experienceKey" DROP NOT NULL`,
    ]);
    expect(probe.versionExperienceKeyNotNull).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
  });

  it("the reservation's key columns cannot go nullable at all, and if the key went first it fails closed", async () => {
    // A finding worth stating rather than asserting around: PostgreSQL itself
    // refuses to make `contentUnitId` or `experienceKey` nullable while the
    // primary key stands. Their NOT NULL is guaranteed twice over, and the one
    // reservation column that CAN drift is `guideKey` — covered above.
    for (const col of ["contentUnitId", "experienceKey"]) {
      await expect(
        probeWith([
          `ALTER TABLE "ExperienceGuideReservation" ALTER COLUMN "${col}" DROP NOT NULL`,
        ]),
      ).rejects.toThrow(/is in a primary key/);
    }

    // And the route that WOULD reach it — dropping the key first — is refused
    // by the detector, with the nullability itself also reported.
    const probe = await probeWith([
      `ALTER TABLE "ExperienceGuideReservation" DROP CONSTRAINT "ExperienceGuideReservation_pkey" CASCADE`,
      `ALTER TABLE "ExperienceGuideReservation" ALTER COLUMN "experienceKey" DROP NOT NULL`,
    ]);
    expect(probe.reservationNotNull).toBe(false);
    expect(probe.reservationPk).toBe(false);
    expect(decideReservationAuthority(probe)).toBe("FAIL_CLOSED");
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

  /**
   * Block until some backend is WAITING on the edition row lock.
   *
   * Not a sleep: a sleep is a guess about timing, this is a query about state,
   * and it fails loudly rather than passing early. Draining the event loop
   * instead is not enough — with two microtasks the writer has barely issued
   * its first statement, so a build that takes NO edition lock reads the
   * manifest AFTER the holder commits and the assertion passes for the wrong
   * reason. Waiting on `pg_stat_activity` makes the block itself the
   * precondition.
   *
   * The statement it looks for is the one the binding path issues under
   * `lock: "for-update"`, so a build that stopped taking it never satisfies
   * this.
   */
  async function waitForEditionLockWaiter(): Promise<void> {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const waiting = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM pg_stat_activity
         WHERE wait_event_type = 'Lock'
           AND state = 'active'
           AND query LIKE '%FROM "Edition"%FOR UPDATE%'`;
      if (Number(waiting[0]?.n ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(
      "no backend ever waited on the edition row — the write is not taking " +
        "the lock a concurrent reorder takes",
    );
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

      // Wait for the binder to be OBSERVABLY blocked on the edition row before
      // letting the publish commit. Draining the event loop instead lets a
      // build that takes no lock read the manifest after the commit and pass
      // for the wrong reason.
      await waitForEditionLockWaiter();
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

  // ── The pin follows the LINEAGE, never the number ────────────────────────

  it("saving after a reorder keeps identity, column and stored pin", async () => {
    // The bug this replaces: `saveDraft` re-derived the guide from
    // `getExactContext(row.bookSlug, row.chapterOrder)` — a question about a
    // NUMBER. After a reorder that number belongs to another unit, so saving an
    // untouched draft either rebound it to that unit's guide or died on
    // NO_GUIDE_FOR_CHAPTER for a chapter it never left.
    const created = await service.createDraft(userId, await eecDraft());
    let restore: string | null = null;
    try {
      const moved = await republishWithNewUnitAtOrder(BOOK_A, 1);
      restore = moved.previousRevisionId;

      await service.saveDraft(created.id, await eecDraft());

      const row = await prisma.chapterExperienceVersion.findUniqueOrThrow({
        where: { id: created.id },
        select: {
          contentUnitId: true,
          guideKey: true,
          definitionJson: true,
        },
      });
      expect(row.contentUnitId).toBe(unitA);
      expect(row.guideKey).toBe(EEC_GUIDE_KEY);
      expect(
        (row.definitionJson as { guidePin: { guideKey: string } }).guidePin
          .guideKey,
      ).toBe(EEC_GUIDE_KEY);
      // And the unit that inherited the number is untouched by any of it.
      expect(row.contentUnitId).not.toBe(moved.newUnitId);
      const reservations = await prisma.experienceGuideReservation.findMany({
        select: { contentUnitId: true, guideKey: true },
      });
      expect(reservations).toEqual([
        { contentUnitId: unitA, guideKey: EEC_GUIDE_KEY },
      ]);
    } finally {
      if (restore) await restorePublishedRevision(BOOK_A, restore);
    }
  });

  it("the next version after a reorder keeps the SOURCE's pin", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.publish(created.id);
    let restore: string | null = null;
    try {
      const moved = await republishWithNewUnitAtOrder(BOOK_A, 1);
      restore = moved.previousRevisionId;

      const next = await service.createNextDraft(userId, EEC_GUIDE_KEY, 1);

      const row = await prisma.chapterExperienceVersion.findUniqueOrThrow({
        where: { id: next.id },
        select: {
          experienceVersion: true,
          contentUnitId: true,
          guideKey: true,
          definitionJson: true,
        },
      });
      expect(row.experienceVersion).toBe(2);
      expect(row.contentUnitId).toBe(unitA);
      expect(row.guideKey).toBe(EEC_GUIDE_KEY);
      expect(
        (row.definitionJson as { guidePin: { guideKey: string } }).guidePin
          .guideKey,
      ).toBe(EEC_GUIDE_KEY);
      expect(row.contentUnitId).not.toBe(moved.newUnitId);
      // One reservation, shared by both versions of the lineage.
      expect(await prisma.experienceGuideReservation.count()).toBe(1);
    } finally {
      if (restore) await restorePublishedRevision(BOOK_A, restore);
    }
  });

  it("a client-supplied pin is not a rebind", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.saveDraft(
      created.id,
      await eecDraft({
        guidePin: { guideKey: `${EEC_GUIDE_KEY}-otra`, guideVersion: 1 },
      }),
    );
    const row = await prisma.chapterExperienceVersion.findUniqueOrThrow({
      where: { id: created.id },
      select: { guideKey: true, definitionJson: true },
    });
    expect(row.guideKey).toBe(EEC_GUIDE_KEY);
    expect(
      (row.definitionJson as { guidePin: { guideKey: string } }).guidePin
        .guideKey,
    ).toBe(EEC_GUIDE_KEY);
  });

  // ── The shipped catalog is placed by identity too ────────────────────────

  it("a shipped definition is placed by its guide's targets, not its number", async () => {
    // The stable authority: `guidePin` → the guide's catalog targets →
    // one editorial context → `ContentUnit.id`. No position anywhere.
    const claims = await prisma.$transaction((tx) => codeOwnedClaimsByUnit(tx));
    expect(claims.get(unitA)?.map((c) => c.guideKey)).toEqual([EEC_GUIDE_KEY]);
    expect(claims.get(unitB)).toHaveLength(1);

    // And it FOLLOWS the unit when the number moves.
    let restore: string | null = null;
    try {
      const moved = await republishWithNewUnitAtOrder(BOOK_A, 1);
      restore = moved.previousRevisionId;
      const after = await prisma.$transaction((tx) =>
        codeOwnedClaimsByUnit(tx),
      );
      expect(after.get(unitA)?.map((c) => c.guideKey)).toEqual([EEC_GUIDE_KEY]);
      // The unit that took the number claims nothing.
      expect(after.get(moved.newUnitId)).toBeUndefined();
    } finally {
      if (restore) await restorePublishedRevision(BOOK_A, restore);
    }
  });

  // ── One snapshot for the whole list ──────────────────────────────────────

  /**
   * A service whose `listForChapter` pauses between resolving the chapter and
   * reading its rows.
   *
   * The pause has to be INSIDE the transaction — that is the whole point — so
   * it is injected through the client rather than arranged around the call. A
   * barrier outside would only prove that two separate transactions see two
   * different worlds, which nobody doubts.
   */
  function serviceThatPausesBeforeRows(hold: {
    reached: () => void;
    gate: Promise<void>;
  }): ExperienceAdminService {
    const bind = <T extends object>(target: T, prop: PropertyKey): unknown => {
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    };
    const client = new Proxy(prisma as object, {
      get(target, prop) {
        if (prop !== "$transaction") return bind(target, prop);
        return (
          fn: (tx: unknown) => Promise<unknown>,
          options?: Record<string, unknown>,
        ) =>
          (
            prisma.$transaction as unknown as (
              f: (tx: unknown) => Promise<unknown>,
              o?: Record<string, unknown>,
            ) => Promise<unknown>
          )(async (tx) => {
            const paused = new Proxy(tx as object, {
              get(t, p) {
                if (p !== "chapterExperienceVersion") return bind(t, p);
                const delegate = Reflect.get(t, p) as object;
                return new Proxy(delegate, {
                  get(d, m) {
                    if (m !== "findMany") return bind(d, m);
                    return async (args: unknown) => {
                      hold.reached();
                      await hold.gate;
                      return (
                        Reflect.get(d, m) as (a: unknown) => Promise<unknown>
                      ).call(d, args);
                    };
                  },
                });
              },
            });
            return fn(paused);
          }, options);
      },
    });
    return new ExperienceAdminService(client as unknown as PrismaService);
  }

  /** Publish a manifest that DROPS a unit from the structure entirely. */
  async function republishWithoutUnit(
    bookSlug: string,
    dropUnitId: string,
  ): Promise<{ previousRevisionId: string }> {
    return prisma.$transaction(async (tx) => {
      const edition = await tx.edition.findFirstOrThrow({
        where: { slug: bookSlug },
        select: { id: true, publishedRevisionId: true },
      });
      const previousRevisionId = edition.publishedRevisionId!;
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
      const kept = (
        await tx.revisionUnit.findMany({
          where: { revisionId: previousRevisionId },
          select: { unitId: true, unitVersionId: true, order: true },
        })
      ).filter((entry) => entry.unitId !== dropUnitId);
      for (const entry of kept) {
        await tx.revisionUnit.create({
          data: {
            revisionId: next.id,
            unitId: entry.unitId,
            unitVersionId: entry.unitVersionId,
            order: entry.order,
          },
        });
      }
      await tx.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: next.id },
      });
      return { previousRevisionId };
    });
  }

  it("a reorder mid-read gives one snapshot, never half of each", async () => {
    // The three reads that build this list — the authority, the chapter's
    // identity, and the rows plus the shipped claims for it — must describe ONE
    // instant. Under READ COMMITTED a publish landing between them produces an
    // answer that never corresponded to any state of the database: here, a
    // chapter that resolves and holds a row while its shipped definition has
    // already become unplaceable, which surfaces as the admin list REFUSING.
    await service.createDraft(userId, await eecDraft());
    const b = barrier();
    let restore: string | null = null;
    try {
      const listing = serviceThatPausesBeforeRows({
        reached: b.arrive,
        gate: b.gate,
      }).listForChapter(BOOK_A, 1);

      await b.reached;
      restore = (await republishWithoutUnit(BOOK_A, unitA)).previousRevisionId;
      b.open();

      const result = await listing;
      // The pre-reorder world, whole: the chapter is unitA, its row is there,
      // and the shipped definition that lives in it is there too.
      expect(result.contentUnitId).toBe(unitA);
      expect(
        result.experiences.filter((e) => e.source === "database"),
      ).toHaveLength(1);
      expect(
        result.experiences.filter((e) => e.source === "code"),
      ).toHaveLength(1);
    } finally {
      if (restore) await restorePublishedRevision(BOOK_A, restore);
    }
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
    await insertLegacyRow({ ...def, experienceVersion: version }, status);
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
    await insertLegacyRow(await eecDraft({ experienceKey: "eec-c1-intrusa" }));

    const measured = await measureReservations(prisma);
    expect(measured.anomalies.map((a) => a.kind)).toContain(
      "CODE_OWNED_GUIDE_COLLISION",
    );
    await expect(applyReservations(prisma)).rejects.toBeInstanceOf(
      BackfillAbort,
    );
    // And the code-owned claim is never MATERIALISED. Not because the foreign
    // key would trap it — `RESTRICT` only refuses a delete while something
    // REFERENCES the row — but because a reservation is the record of an
    // editorial decision, and a shipped definition is a fact about the build.
    // Its authority stays in the catalog, resolved fresh on every read.
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

  it("checks the edition even when the position no longer resolves", async () => {
    // The correction. The edition id used to come from
    // `resolveChapterIdentity(bookSlug, chapterOrder)`, so whenever that failed
    // the cross-edition check was SKIPPED — and the rows most worth checking
    // are exactly the ones whose position stopped resolving.
    //
    // This row names a unit of book A while claiming to be in book B, at a
    // position book B does not have. Both are true at once, and only the second
    // used to be noticed.
    await service.createDraft(userId, await eecDraft());
    // The stored definition moves with the columns — otherwise the row is
    // caught one check earlier, for disagreeing with itself, and this test
    // would be measuring that instead.
    await prisma.$executeRaw`
      UPDATE "ChapterExperienceVersion"
         SET "bookSlug" = ${BOOK_B},
             "chapterOrder" = 97,
             "definitionJson" = jsonb_set(
               jsonb_set("definitionJson", '{bookSlug}', to_jsonb(${BOOK_B}::text)),
               '{chapterOrder}', to_jsonb(97))`;

    const measured = await measureReservations(prisma);
    expect(measured.anomalies.map((a) => a.kind)).toEqual([
      "ROW_IDENTITY_CROSS_EDITION",
    ]);
    await expect(applyReservations(prisma)).rejects.toBeInstanceOf(
      BackfillAbort,
    );
  });

  it("a row whose book has no edition at all is an anomaly", async () => {
    await service.createDraft(userId, await eecDraft());
    await prisma.$executeRaw`
      UPDATE "ChapterExperienceVersion"
         SET "bookSlug" = 'libro-inexistente',
             "definitionJson" = jsonb_set(
               "definitionJson", '{bookSlug}', to_jsonb('libro-inexistente'::text))`;

    const measured = await measureReservations(prisma);
    expect(measured.anomalies.map((a) => a.kind)).toEqual([
      "ROW_BOOK_HAS_NO_EDITION",
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
      await insertLegacyRow({ ...def, experienceKey: key }, "PUBLISHED");
    }

    await expect(applyReservations(prisma)).rejects.toBeInstanceOf(
      BackfillAbort,
    );
    // Nothing partial: not one reservation, not one filled column.
    const final = await state();
    expect(final.reservations).toHaveLength(0);
    expect(final.rows.every((r) => r.contentUnitId === null)).toBe(true);
  });

  it("measure is READ ONLY, so the database refuses a lock or a write", async () => {
    // Not a promise in a comment. `SET TRANSACTION … READ ONLY` is the first
    // statement, and PostgreSQL then rejects both halves at the statement.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        return tx.$queryRaw`SELECT "id" FROM "Edition" FOR UPDATE`;
      }),
    ).rejects.toThrow(/read-only transaction/i);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        return tx.experienceGuideReservation.create({
          data: {
            contentUnitId: unitA,
            experienceKey: "no",
            guideKey: EEC_GUIDE_KEY,
          },
        });
      }),
    ).rejects.toThrow(/read-only transaction/i);
  });

  it("a reorder in flight does NOT block measure", async () => {
    // Measuring is something an operator should be able to do while the CMS is
    // in use. A report that had to stop editorial writes in order to describe
    // them would be its own small outage — and taking `FOR UPDATE` here is the
    // shape that would cause it.
    await insertPreBridgeRow(1, "PUBLISHED");
    const b = barrier();
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Edition" WHERE "slug" = ${BOOK_A} FOR UPDATE`;
      b.arrive();
      await b.gate;
    });

    await b.reached;
    // Completes WHILE the edition row is held by somebody else.
    const report = await measureReservations(prisma);
    expect(report.applied).toBe(false);
    expect(report.rowsLegacy).toBe(1);

    b.open();
    await holder;
  });

  it("a reorder cannot hand a legacy row to whichever unit takes its number", async () => {
    // This test used to assert the opposite, and the opposite was the bug.
    //
    // `republishWithNewUnitAtOrder` puts a BRAND NEW unit at order 1 and pushes
    // the incumbent down a slot. Under the old rule the legacy row adopted
    // whatever now sat at its `chapterOrder`, so it was permanently reserved
    // against a unit it had never had anything to do with — an inference the
    // cutover's CHECK then froze, indistinguishable from an editor's choice.
    //
    // The row's guide has not moved. Its targets still name `unitA`, so that is
    // where the reservation belongs, and the new occupant of the number gets
    // nothing. The edition lock still matters — the run must still wait — but
    // what it protects is the manifest read, not a guess.
    await insertPreBridgeRow(1, "PUBLISHED");
    const b = barrier();
    let restore: string | null = null;
    let newUnitId: string | null = null;
    try {
      const republish = republishWithNewUnitAtOrder(BOOK_A, 1, {
        reached: b.arrive,
        gate: b.gate,
      });
      await b.reached;

      let settled = false;
      const apply = applyReservations(prisma).then(
        (r) => {
          settled = true;
          return r;
        },
        (e) => {
          settled = true;
          throw e;
        },
      );

      await waitForEditionLockWaiter();
      expect(settled).toBe(false);

      b.open();
      const moved = await republish;
      restore = moved.previousRevisionId;
      newUnitId = moved.newUnitId;
      const report = await apply;

      expect(report.applied).toBe(true);
      // The unit the row's own GUIDE names — not the one now at its number.
      const reservations = await prisma.experienceGuideReservation.findMany({
        select: { contentUnitId: true },
      });
      expect(reservations).toEqual([{ contentUnitId: unitA }]);
      expect(reservations[0]!.contentUnitId).not.toBe(newUnitId);
      const rows = await prisma.chapterExperienceVersion.findMany({
        select: { contentUnitId: true },
      });
      expect(rows).toEqual([{ contentUnitId: unitA }]);
      // Identity came from the guide; the number is now an observation that
      // disagrees, and the report says so without acting on it.
      expect(report.rowsIdentityFromGuideContext).toBe(1);
      expect(report.rowsWithPositionDrift).toBe(1);
      expect(report.rowsPositionCorroborated).toBe(0);
    } finally {
      if (restore) await restorePublishedRevision(BOOK_A, restore);
    }
  });

  it("counts what a run would create, not how many lineages there are", async () => {
    await insertPreBridgeRow(1, "PUBLISHED");
    const before = await measureReservations(prisma);
    expect(before.groups).toBe(1);
    expect(before.reservationsExisting).toBe(0);
    expect(before.reservationsToCreate).toBe(1);
    // Identity from the guide, and the position happens to agree — which is
    // corroboration, not authority.
    expect(before.rowsIdentityFromGuideContext).toBe(1);
    expect(before.rowsPositionCorroborated).toBe(1);
    expect(before.rowsWithPositionDrift).toBe(0);

    await applyReservations(prisma);

    // Same lineage, reservation now present: nothing left to create. The row
    // is materialised now, and its stored unit is verified against the guide
    // rather than merely trusted.
    const after = await measureReservations(prisma);
    expect(after.groups).toBe(1);
    expect(after.reservationsExisting).toBe(1);
    expect(after.reservationsToCreate).toBe(0);
    expect(after.rowsIdentityFromGuideContext).toBe(1);
    expect(after.rowsAlreadyMaterialised).toBe(1);
    expect(after.rowsLegacy).toBe(0);

    const replay = await applyReservations(prisma);
    expect(replay.reservationsCreated).toBe(0);
    expect(replay.reservationsReplayed).toBe(1);
    expect(replay.columnsFilled).toBe(0);
  });

  it("the backfill and a create are serialised by the GLOBAL lock", async () => {
    const legacy = await eecDraft({ experienceKey: "eec-c1-legado" });
    await insertLegacyRow(legacy, "PUBLISHED");

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

  /**
   * C.3B identity (#639) — where a legacy row's chapter comes from.
   *
   * Every case here is the same question asked from a different angle: when the
   * row states one thing (its exact `guidePin`) and the number it carries states
   * another, which one becomes the reservation? The answer has to be the pin,
   * because `--apply` is followed by a CHECK that freezes whatever it wrote.
   */
  describe("C.3B · legacy identity comes from the guide, not the number", () => {
    it("a legacy row is placed by its own guide, with the position agreeing", async () => {
      await insertPreBridgeRow(1, "PUBLISHED");
      const report = await measureReservations(prisma);

      expect(report.rowsLegacy).toBe(1);
      expect(report.rowsIdentityFromGuideContext).toBe(1);
      // The number happens to point at the same unit. That is corroboration, and
      // the counter that records it is not the counter identity came from.
      expect(report.rowsPositionCorroborated).toBe(1);
      expect(report.rowsWithPositionDrift).toBe(0);
      expect(report.rowsWithUnresolvedPosition).toBe(0);
      expect(report.anomalies).toEqual([]);

      await applyReservations(prisma);
      const reservations = await prisma.experienceGuideReservation.findMany({
        select: { contentUnitId: true, guideKey: true },
      });
      expect(reservations).toEqual([
        { contentUnitId: unitA, guideKey: EEC_GUIDE_KEY },
      ]);
    });

    it("a position that no longer resolves does not change the identity", async () => {
      // The old rule made this an anomaly — the row had nothing else to go on.
      // Now the number is an observation that happens to be missing, and the
      // pin still names the chapter, so the row is placed and simply reported as
      // having an unresolved position.
      await insertPreBridgeRow(1, "PUBLISHED");
      await prisma.$executeRawUnsafe(
        `UPDATE "ChapterExperienceVersion" SET "chapterOrder" = 99`,
      );
      // The definition has to keep describing the row, or a different anomaly
      // fires first and this would pass for the wrong reason.
      await prisma.$executeRawUnsafe(
        `UPDATE "ChapterExperienceVersion"
            SET "definitionJson" = jsonb_set("definitionJson"::jsonb, '{chapterOrder}', '99')`,
      );

      const report = await measureReservations(prisma);
      expect(report.anomalies).toEqual([]);
      expect(report.rowsIdentityFromGuideContext).toBe(1);
      expect(report.rowsWithUnresolvedPosition).toBe(1);
      expect(report.rowsPositionCorroborated).toBe(0);

      await applyReservations(prisma);
      const reservations = await prisma.experienceGuideReservation.findMany({
        select: { contentUnitId: true },
      });
      expect(reservations).toEqual([{ contentUnitId: unitA }]);
    });

    it("a guide the registry does not have fails closed, and writes nothing", async () => {
      await insertPreBridgeRow(1, "PUBLISHED");
      await prisma.$executeRawUnsafe(
        `UPDATE "ChapterExperienceVersion"
            SET "definitionJson" = jsonb_set("definitionJson"::jsonb,
                                             '{guidePin,guideKey}', '"no-such-guide"')`,
      );
      const report = await measureReservations(prisma);
      expect(report.anomalies.map((a) => a.kind)).toEqual([
        BACKFILL_ANOMALY.guideContextUnresolved,
      ]);
      await expect(applyReservations(prisma)).rejects.toBeInstanceOf(
        BackfillAbort,
      );
      expect(await prisma.experienceGuideReservation.count()).toBe(0);
    });

    it("a guideVersion nobody published fails closed — the pin is BOTH halves", async () => {
      // Resolving by `guideKey` alone would silently answer about whichever
      // version happens to be current, which is a different guide's targets.
      await insertPreBridgeRow(1, "PUBLISHED");
      await prisma.$executeRawUnsafe(
        `UPDATE "ChapterExperienceVersion"
            SET "definitionJson" = jsonb_set("definitionJson"::jsonb,
                                             '{guidePin,guideVersion}', '99')`,
      );
      const report = await measureReservations(prisma);
      expect(report.anomalies.map((a) => a.kind)).toEqual([
        BACKFILL_ANOMALY.guideContextUnresolved,
      ]);
      expect(await prisma.experienceGuideReservation.count()).toBe(0);
    });

    it("a stored unit in the RIGHT edition that is not the guide's unit fails closed", async () => {
      // The contradiction the edition check cannot see. A sibling unit inside the
      // same edition passes every structural test — foreign key, edition, column
      // pairing — and is still not the chapter this row's guide lives in.
      await insertPreBridgeRow(1, "PUBLISHED");
      await applyReservations(prisma);

      const editionA = await prisma.edition.findFirstOrThrow({
        where: { slug: BOOK_A },
        select: { id: true },
      });
      const sibling = await prisma.contentUnit.create({
        data: { editionId: editionA.id, unitKey: `sibling-${Date.now()}` },
      });
      // Move BOTH the reservation and the row, so the only thing wrong is the
      // disagreement with the guide.
      await prisma.$executeRawUnsafe(
        `UPDATE "ExperienceGuideReservation" SET "contentUnitId" = $1`,
        sibling.id,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "ChapterExperienceVersion" SET "contentUnitId" = $1`,
        sibling.id,
      );

      const report = await measureReservations(prisma);
      expect(report.anomalies.map((a) => a.kind)).toEqual([
        BACKFILL_ANOMALY.guideContextIdentityMismatch,
      ]);
      // Not repaired — refused.
      await expect(applyReservations(prisma)).rejects.toBeInstanceOf(
        BackfillAbort,
      );
      const still = await prisma.experienceGuideReservation.findMany({
        select: { contentUnitId: true },
      });
      expect(still).toEqual([{ contentUnitId: sibling.id }]);
    });

    it("a materialised row whose stored unit is in another book fails closed", async () => {
      await insertPreBridgeRow(1, "PUBLISHED");
      await applyReservations(prisma);
      expect(await prisma.experienceGuideReservation.count()).toBe(1);

      // Move the row's identity to a unit its guide has nothing to do with —
      // and take the reservation with it, so the ONLY thing wrong is the
      // disagreement with the guide.
      await prisma.$executeRawUnsafe(
        `UPDATE "ExperienceGuideReservation" SET "contentUnitId" = $1`,
        unitB,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "ChapterExperienceVersion" SET "contentUnitId" = $1`,
        unitB,
      );

      const report = await measureReservations(prisma);
      // The edition check fires first here — unitB belongs to the other book —
      // which is itself the right refusal. Either way nothing is repaired.
      expect(report.anomalies.length).toBeGreaterThan(0);
      expect(
        report.anomalies.every(
          (a) =>
            a.kind === BACKFILL_ANOMALY.identityCrossEdition ||
            a.kind === BACKFILL_ANOMALY.guideContextIdentityMismatch,
        ),
      ).toBe(true);
      await expect(applyReservations(prisma)).rejects.toBeInstanceOf(
        BackfillAbort,
      );
    });

    it("measure holds READ ONLY: it cannot write even when asked directly", async () => {
      // Not a source assertion. The transaction measure opens refuses writes
      // because PostgreSQL refuses them, and this is what that looks like.
      await insertPreBridgeRow(1, "PUBLISHED");
      await measureReservations(prisma);
      expect(await prisma.experienceGuideReservation.count()).toBe(0);
      const rows = await prisma.chapterExperienceVersion.findMany({
        select: { contentUnitId: true, guideKey: true },
      });
      expect(rows).toEqual([{ contentUnitId: null, guideKey: null }]);
    });
  });
});
