import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaService } from "../prisma";
import type { ChapterExperienceDefinition } from "@psico/types";
import { GuideTargetContextService } from "../guide/guide-target-context.service";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { productionExperienceRepository } from "./experience-production-catalog";
import { ExperienceAdminService } from "./experience-admin.service";
import {
  bindingLockKeys,
  bridgeBindingLockKeys,
} from "./experience-binding-lock";
import { readReservationAuthority } from "./experience-binding-reservation";
import { productionCodeOwnedClaims } from "./experience-code-owned-identity";
import { GUIDE_READER_ANCHOR, PAREJAS_READER_ANCHOR } from "@psico/types";
import { productionGuideRegistry } from "../guide/guide-catalog";
import type { ExperienceBindingCatalog } from "./experience-guide-options";
import { seedPracticeHeadings } from "../content-core/test-support/seed-practice-headings";

/**
 * C.3C+C.4 (#639) — the cutover: archive, rebind, and a fleet where the bridge
 * binary and this one are both live.
 *
 * The mixed fleet is the part that cannot be reasoned about on paper. V1 takes
 * `global → chapter`; V2 takes `chapter` only. They are safe together for
 * exactly one reason — the chapter key is byte-identical — and this file makes
 * a database prove it rather than a comment claim it.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "c3c_experience_cutover_db";

const EEC_PIN = {
  guideKey: GUIDE_READER_ANCHOR.guideKey,
  guideVersion: GUIDE_READER_ANCHOR.guideVersion,
};
const PQP_PIN = {
  guideKey: PAREJAS_READER_ANCHOR.guideKey,
  guideVersion: PAREJAS_READER_ANCHOR.guideVersion,
};

const BOOK_A = "emociones-en-construccion";
const BOOK_B = "parejas-que-perduran";
const HEADING_A = EXERCISE_INGESTION_CATALOG[BOOK_A][0].practice.sourceHeading;
const HEADING_B = EXERCISE_INGESTION_CATALOG[BOOK_B][0].practice.sourceHeading;

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

function barrier() {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let arrive!: () => void;
  const reached = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  return { gate, open, reached, arrive };
}

suite("C.3C+C.4 · cutover, archive and a mixed fleet", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let service: ExperienceAdminService;
  /** Same service, a menu with two guides in this chapter. See `twoGuideCatalog`. */
  let twoGuides: ExperienceAdminService;
  let userId: string;
  let unitA: string;

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
    // El catálogo de ejercicios ancla cada práctica a un encabezado editorial.
    // Se siembran desde el propio catálogo para que añadir una microguía no
    // rompa un fixture que no tiene nada que ver con ella.
    for (const ch of await prisma.chapter.findMany({
      select: { id: true, bookId: true },
    })) {
      const b = await prisma.book.findUnique({
        where: { id: ch.bookId },
        select: { slug: true },
      });
      if (b) await seedPracticeHeadings(prisma, ch.id, b.slug);
    }
    await backfillContentCore(prisma);

    const u = await prisma.user.create({
      data: { email: "c3c-cutover@example.test", name: "CMS", plan: "FREE" },
    });
    userId = u.id;
    service = new ExperienceAdminService(prisma as unknown as PrismaService);
    twoGuides = new ExperienceAdminService(
      prisma as unknown as PrismaService,
      // The real shipped-claim resolver: this fixture ingests the catalog, so
      // it answers. Only the guide MENU is substituted.
      productionCodeOwnedClaims,
      twoGuideCatalog,
      // C.3R — the REAL target authority, over the same substituted menu.
      //
      // Not a stub: this is `GuideTargetContextService` itself, issuing its own
      // SQL against this fixture's ingested catalog. Only the registry seam is
      // swapped, so `ALT` (the real definition under a second key) is placed by
      // resolving its actual targets — the same rules, the same queries, the
      // same failure modes as production. A stub here would have made every
      // identity assertion below a statement about the stub.
      new GuideTargetContextService(
        new LearningCatalogResolver(prisma as unknown as PrismaService),
        twoGuideCatalog,
      ),
    );

    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: BOOK_A },
      select: { publishedRevisionId: true },
    });
    const placed = await prisma.revisionUnit.findFirstOrThrow({
      where: { revisionId: edition.publishedRevisionId!, order: 1 },
      select: { unitId: true },
    });
    unitA = placed.unitId;
  }, 240_000);

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
    await prisma.chapterExperienceVersion.deleteMany();
    await prisma.experienceGuideReservation.deleteMany();
  });

  async function state() {
    const [rows, reservations] = await Promise.all([
      prisma.chapterExperienceVersion.findMany({
        select: {
          experienceKey: true,
          experienceVersion: true,
          status: true,
          contentUnitId: true,
          guideKey: true,
          definitionJson: true,
        },
        orderBy: [{ experienceKey: "asc" }, { experienceVersion: "asc" }],
      }),
      prisma.experienceGuideReservation.findMany({
        select: { contentUnitId: true, experienceKey: true, guideKey: true },
      }),
    ]);
    return { rows, reservations };
  }

  // ── The schema is the authority ──────────────────────────────────────────

  it("reports STRUCTURAL once the constraint exists AND is validated", async () => {
    const authority = await prisma.$transaction((tx) =>
      readReservationAuthority(tx),
    );
    expect(authority).toBe("STRUCTURAL");
  });

  it("the CHECK is validated, not merely present", async () => {
    // A `NOT VALID` constraint is present and proves nothing about existing
    // rows, which is why the detector treats that shape as FAIL_CLOSED.
    const rows = await prisma.$queryRaw<{ convalidated: boolean }[]>`
      SELECT c.convalidated FROM pg_constraint c
       WHERE c.conname = 'ChapterExperienceVersion_binding_shape_check'`;
    expect(rows[0]?.convalidated).toBe(true);
  });

  it("refuses a reserving row with no identity — the cutover shape", async () => {
    // Exactly the write the previous binary made all through C.3A. After the
    // migration it is no longer legal, which is what makes the backfill a
    // precondition rather than a nicety.
    //
    // Raw SQL because the client cannot express it any more: generated from
    // this schema, `contentUnitId` is required and the create input has no
    // shape for its absence. That refusal happens one layer earlier and is a
    // different guarantee — the DATABASE's answer is the one being asserted,
    // and it has to hold for statements no Prisma client wrote.
    const def = await eecDraft();
    await expect(
      prisma.$executeRaw`
        INSERT INTO "ChapterExperienceVersion"
          ("id", "experienceKey", "experienceVersion", "bookSlug",
           "chapterOrder", "status", "definitionJson", "createdByUserId",
           "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${def.experienceKey}, 1,
                ${def.bookSlug}, ${def.chapterOrder},
                'DRAFT'::"ExperienceVersionStatus",
                ${JSON.stringify(def)}::jsonb, ${userId}, now(), now())`,
    ).rejects.toBeTruthy();
  });

  it("refuses an ARCHIVED row that kept its guide, and one that lost its unit", async () => {
    // The two halves of the CHECK, from the side that would break them.
    const def = await eecDraft({ experienceKey: "eec-c1-forma" });
    const insert = (
      status: string,
      unit: string | null,
      guide: string | null,
    ) =>
      prisma.$executeRaw`
        INSERT INTO "ChapterExperienceVersion"
          ("id", "experienceKey", "experienceVersion", "bookSlug",
           "chapterOrder", "status", "contentUnitId", "guideKey",
           "definitionJson", "createdByUserId", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${def.experienceKey}, 1,
                ${def.bookSlug}, ${def.chapterOrder},
                ${status}::"ExperienceVersionStatus", ${unit}, ${guide},
                ${JSON.stringify(def)}::jsonb, ${userId}, now(), now())`;

    // ARCHIVED must give the guide back.
    await expect(
      insert("ARCHIVED", unitA, EEC_PIN.guideKey),
    ).rejects.toBeTruthy();
    // …and must keep its identity: history does not evaporate.
    await expect(insert("ARCHIVED", null, null)).rejects.toBeTruthy();
  });

  it("accepts the shape the BRIDGE binary writes", async () => {
    /**
     * Forward compatibility, from the other side. During the C.3C rollout the
     * bridge binary is still serving, and every row it writes carries identity
     * and lineage columns because C.3A made it. Those rows must satisfy the
     * constraint that just appeared — otherwise the deploy would start
     * rejecting writes from a binary that is still live.
     */
    const def = await eecDraft({ experienceKey: "eec-c1-puente" });
    await prisma.experienceGuideReservation.create({
      data: {
        contentUnitId: unitA,
        experienceKey: def.experienceKey,
        guideKey: def.guidePin.guideKey,
      },
    });
    const row = await prisma.chapterExperienceVersion.create({
      data: {
        experienceKey: def.experienceKey,
        experienceVersion: 1,
        bookSlug: def.bookSlug,
        chapterOrder: def.chapterOrder,
        contentUnitId: unitA,
        guideKey: def.guidePin.guideKey,
        status: "DRAFT",
        definitionJson: def as unknown as never,
        createdByUserId: userId,
      },
      select: { id: true, status: true },
    });
    expect(row.status).toBe("DRAFT");
  });

  it("V1 never turns an ARCHIVED row into an editable draft", async () => {
    /**
     * The forward-compat guard C.3A shipped, verified against a row that could
     * not exist until now. The bridge binary reads the COLUMN and requires
     * DRAFT positively, so an archived row is inert to it — the failure mode
     * this ordering exists to prevent.
     */
    const created = await service.createDraft(userId, await eecDraft());
    await service.archiveDraft(created.id);

    const listed = await service.listForChapter(BOOK_A, 1);
    const archived = listed.experiences.find((e) => e.id === created.id);
    expect(archived?.status).toBe("ARCHIVED");
    // Not folded into DRAFT anywhere along the way.
    expect(
      listed.experiences.some(
        (e) => e.id === created.id && e.status === "DRAFT",
      ),
    ).toBe(false);
  });

  // ── Selection ────────────────────────────────────────────────────────────

  it("offers only guides whose passage is in this chapter, with availability", async () => {
    const before = await service.listSelectableGuides(BOOK_A, 1, null);
    // Six guided readings anchor to this chapter now — the V1 pilot plus the
    // five microguides — and the other book's guide is not an option here at
    // all. That last part is what this test is about; the count is not.
    expect(before.map((o) => o.guideKey)).toEqual([
      "eec-c1-cuerpo-antes-que-mente",
      "eec-c1-teorias-como-lentes",
      "eec-c1-rostro-como-pista",
      "eec-c1-alarma-antes-del-relato",
      "eec-c1-emocion-informa-no-manda",
      "eec-c1-construida-no-significa-falsa",
    ]);
    expect(before.map((o) => o.guideKey)).not.toContain(
      "pqp-c1-contacto-sostenido",
    );
    // The code-owned experience already holds the pilot's guide.
    const pilot = before.find(
      (o) => o.guideKey === "eec-c1-cuerpo-antes-que-mente",
    );
    expect(pilot!.availability).toBe("RESERVED_BY_ANOTHER_EXPERIENCE");

    // …and from the owner's own point of view it reads as theirs.
    const mine = await service.listSelectableGuides(
      BOOK_A,
      1,
      "eec-c1-cuerpo-antes-que-mente",
    );
    expect(
      mine.find((o) => o.guideKey === "eec-c1-cuerpo-antes-que-mente")!
        .availability,
    ).toBe("OWNED_BY_THIS_EXPERIENCE");
  });

  // ── Archive ──────────────────────────────────────────────────────────────

  it("archiving keeps identity and history, and gives the guide back", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.archiveDraft(created.id);

    const final = await state();
    const row = final.rows[0]!;
    expect(row.status).toBe("ARCHIVED");
    // Identity survives: a chapter does not stop being this row's chapter.
    expect(row.contentUnitId).toBe(unitA);
    // The binding is what archiving returns.
    expect(row.guideKey).toBeNull();
    // The historical claim stays readable in the definition.
    expect(
      (row.definitionJson as { guidePin: { guideKey: string } }).guidePin
        .guideKey,
    ).toBe("eec-c1-cuerpo-antes-que-mente");
    // Nothing holds the guide any more.
    expect(final.reservations).toHaveLength(0);
  });

  it("an ARCHIVED row still protects its chapter, with no reservation left", async () => {
    // The reason the DIRECT foreign key exists. Once `guideKey` is null the
    // composite key is not evaluated at all (MATCH SIMPLE), so if identity were
    // only guarded by that one, an archived row's `contentUnitId` would be an
    // unchecked string and the unit it names could be deleted underneath it.
    const created = await service.createDraft(userId, await eecDraft(), unitA);
    await service.archiveDraft(created.id);
    expect(await prisma.experienceGuideReservation.count()).toBe(0);

    const row = await prisma.chapterExperienceVersion.findUniqueOrThrow({
      where: { id: created.id },
      select: { contentUnitId: true, guideKey: true },
    });
    expect(row).toEqual({ contentUnitId: unitA, guideKey: null });

    await expect(
      prisma.contentUnit.delete({ where: { id: unitA } }),
    ).rejects.toBeTruthy();
  });

  it("archiving one version does not release a guide another still uses", async () => {
    const first = await service.createDraft(userId, await eecDraft());
    await service.publish(first.id);
    const next = await service.createNextDraft(
      userId,
      "eec-c1-cuerpo-antes-que-mente",
      1,
    );

    await service.archiveDraft(next.id);

    const final = await state();
    // The published v1 still reserves, so the row survives.
    expect(final.reservations).toHaveLength(1);
    expect(
      final.rows.find((r) => r.status === "ARCHIVED")?.guideKey,
    ).toBeNull();
    expect(final.rows.find((r) => r.status === "PUBLISHED")?.guideKey).toBe(
      "eec-c1-cuerpo-antes-que-mente",
    );
  });

  it("archived is terminal: no edit, no publish, no second archive", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.archiveDraft(created.id);

    await expect(
      service.saveDraft(created.id, await eecDraft()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_VERSION_NOT_DRAFT",
      }),
    });
    await expect(service.publish(created.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_VERSION_NOT_DRAFT",
      }),
    });
    await expect(service.archiveDraft(created.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_ALREADY_ARCHIVED",
      }),
    });
  });

  it("a PUBLISHED version is never archived", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.publish(created.id);
    await expect(service.archiveDraft(created.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_VERSION_NOT_DRAFT",
      }),
    });
  });

  it("an archived version number is never reused", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.archiveDraft(created.id);

    // The row is still there, so the unique on (key, version) still holds it.
    await expect(
      service.createDraft(userId, await eecDraft()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "EXPERIENCE_VERSION_EXISTS" }),
    });
    expect((await state()).rows).toHaveLength(1);
  });

  // ── Rebind ───────────────────────────────────────────────────────────────

  it("under STRUCTURAL the list is scoped by identity, never by position", async () => {
    // The BRIDGE spec asserts the mixed scope; this asserts the cutover one,
    // where position must not be consulted AT ALL. Without it, the negative
    // control "STRUCTURAL reads by bookSlug/chapterOrder" passes unnoticed:
    // the bridge test exercises a different branch.
    const created = await service.createDraft(userId, await eecDraft(), unitA);

    // Publish a manifest that puts a NEW unit at order 1 and pushes the
    // incumbent to 1001 — the same committed effect as a reorder.
    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: BOOK_A },
      select: { id: true, publishedRevisionId: true },
    });
    const previousRevisionId = edition.publishedRevisionId!;
    try {
      const unit = await prisma.contentUnit.create({
        data: { editionId: edition.id, unitKey: `native-structural-scope` },
      });
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title: "Capítulo movido" },
      });
      const highest = await prisma.revision.findFirstOrThrow({
        where: { editionId: edition.id },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const next = await prisma.revision.create({
        data: {
          editionId: edition.id,
          number: highest.number + 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      for (const entry of await prisma.revisionUnit.findMany({
        where: { revisionId: previousRevisionId },
        select: { unitId: true, unitVersionId: true, order: true },
      })) {
        await prisma.revisionUnit.create({
          data: {
            revisionId: next.id,
            unitId: entry.unitId,
            unitVersionId: entry.unitVersionId,
            order: entry.order + 1000,
          },
        });
      }
      await prisma.revisionUnit.create({
        data: {
          revisionId: next.id,
          unitId: unit.id,
          unitVersionId: version.id,
          order: 1,
        },
      });
      await prisma.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: next.id },
      });

      // Chapter 1 is now a different unit. The row belongs to the OLD one.
      const atOne = await service.listForChapter(BOOK_A, 1);
      expect(atOne.contentUnitId).toBe(unit.id);
      expect(atOne.experiences.filter((e) => e.source === "database")).toEqual(
        [],
      );

      // And it is listed where its unit actually went.
      const atMoved = await service.listForChapter(BOOK_A, 1001);
      expect(atMoved.contentUnitId).toBe(unitA);
      const rows = atMoved.experiences.filter((e) => e.source === "database");
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(created.id);
    } finally {
      await prisma.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: previousRevisionId },
      });
    }
  });

  it("rebinding to a guide whose passage is elsewhere is refused", async () => {
    // The same rule the selector applies, applied again where it matters. A
    // card bound here would publish cleanly and open for nobody.
    const created = await service.createDraft(userId, await eecDraft());
    await expect(
      service.rebindDraft(created.id, {
        guideKey: PQP_PIN.guideKey,
        guideVersion: PQP_PIN.guideVersion,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_GUIDE_PIN_NOT_RUNNABLE_HERE",
      }),
    });
    expect((await state()).reservations[0]!.guideKey).toBe(EEC_PIN.guideKey);
  });

  it("rebinding to a guide the registry does not have is refused", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await expect(
      service.rebindDraft(created.id, {
        guideKey: `${EEC_PIN.guideKey}-inexistente`,
        guideVersion: 1,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_GUIDE_PIN_NOT_REGISTERED",
      }),
    });
  });

  // ── A→B, with two guides that genuinely live in this chapter ─────────────

  /**
   * The production catalog anchors exactly ONE guide per chapter, so with it
   * there is no chapter in which "move from A to B" is even expressible — a
   * rebind's success path could ship without a test having run it once.
   *
   * The answer is not a second production guide invented for a test suite. It
   * is the injected catalog: same service, same transaction, same locks, same
   * constraints — only the menu differs. `ALT` is the real definition under a
   * second key, anchored to the same chapter.
   */
  const ALT_PIN = { guideKey: `${EEC_PIN.guideKey}-alterna`, guideVersion: 1 };
  const twoGuideCatalog: ExperienceBindingCatalog = {
    anchors: [
      GUIDE_READER_ANCHOR,
      { ...GUIDE_READER_ANCHOR, guideKey: ALT_PIN.guideKey },
    ],
    getExact: (guideKey, guideVersion) =>
      guideKey === ALT_PIN.guideKey
        ? {
            ...productionGuideRegistry.getExact(
              EEC_PIN.guideKey,
              EEC_PIN.guideVersion,
            ),
            guideKey: ALT_PIN.guideKey,
          }
        : productionGuideRegistry.getExact(guideKey, guideVersion),
  };
  /** Everything that describes one lineage's binding, read from all three places. */
  async function bindingOf(experienceKey: string) {
    const rows = await prisma.chapterExperienceVersion.findMany({
      where: { experienceKey },
      select: {
        experienceVersion: true,
        guideKey: true,
        contentUnitId: true,
        definitionJson: true,
      },
      orderBy: { experienceVersion: "asc" },
    });
    const reservation = await prisma.experienceGuideReservation.findUnique({
      where: {
        contentUnitId_experienceKey: { contentUnitId: unitA, experienceKey },
      },
      select: { guideKey: true },
    });
    return {
      reservation: reservation?.guideKey ?? null,
      columns: rows.map((r) => r.guideKey),
      // Tolerant on purpose: the rollback test deliberately stores a
      // definition with no pin, and a helper that threw there would report a
      // fixture problem where the assertion about rollback should be.
      json: rows.map(
        (r) =>
          (r.definitionJson as { guidePin?: { guideKey?: string } } | null)
            ?.guidePin?.guideKey ?? null,
      ),
    };
  }

  it("moves a never-published draft from A to B, in all three places at once", async () => {
    const created = await twoGuides.createDraft(userId, await eecDraft());
    expect(await bindingOf(EEC_PIN.guideKey)).toEqual({
      reservation: EEC_PIN.guideKey,
      columns: [EEC_PIN.guideKey],
      json: [EEC_PIN.guideKey],
    });

    await twoGuides.rebindDraft(created.id, ALT_PIN);

    // Reservation, promoted column and stored definition — no divergence, and
    // the column moved by CASCADE rather than by a second write.
    expect(await bindingOf(EEC_PIN.guideKey)).toEqual({
      reservation: ALT_PIN.guideKey,
      columns: [ALT_PIN.guideKey],
      json: [ALT_PIN.guideKey],
    });
    // Still exactly one reservation: a move, not an acquire-then-release.
    expect(await prisma.experienceGuideReservation.count()).toBe(1);
  });

  it("every unpublished version of the lineage moves together", async () => {
    // `ON UPDATE CASCADE` moves the COLUMNS of every referencing row. A
    // definition left naming the old pin would be the divergence the cascade
    // cannot fix, so the service rewrites them all — not only the one clicked.
    const first = await twoGuides.createDraft(userId, await eecDraft());
    await twoGuides.createNextDraft(userId, EEC_PIN.guideKey, 1);

    await twoGuides.rebindDraft(first.id, ALT_PIN);

    const after = await bindingOf(EEC_PIN.guideKey);
    expect(after.columns).toEqual([ALT_PIN.guideKey, ALT_PIN.guideKey]);
    expect(after.json).toEqual([ALT_PIN.guideKey, ALT_PIN.guideKey]);
  });

  it("refuses when the destination belongs to another lineage", async () => {
    const mine = await twoGuides.createDraft(userId, await eecDraft());
    // A second lineage takes B first.
    await twoGuides.createDraft(
      userId,
      await eecDraft({
        experienceKey: `${EEC_PIN.guideKey}-vecina`,
        guidePin: ALT_PIN,
      }),
    );

    await expect(twoGuides.rebindDraft(mine.id, ALT_PIN)).rejects.toMatchObject(
      {
        response: expect.objectContaining({
          code: "EXPERIENCE_GUIDE_BINDING_RESERVED",
        }),
      },
    );
    expect((await bindingOf(EEC_PIN.guideKey)).reservation).toBe(
      EEC_PIN.guideKey,
    );
  });

  it("a rebind after a reorder follows the UNIT, not the number", async () => {
    // Both halves of C.4 have to survive the thing C.3A exists for. The draft
    // stays in the unit it was created in, its reservation moves with it, and
    // the unit that inherited its old number is untouched by any of it.
    const created = await twoGuides.createDraft(
      userId,
      await eecDraft(),
      unitA,
    );
    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: BOOK_A },
      select: { id: true, publishedRevisionId: true },
    });
    const previousRevisionId = edition.publishedRevisionId!;
    try {
      const unit = await prisma.contentUnit.create({
        data: { editionId: edition.id, unitKey: "native-rebind-after-reorder" },
      });
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title: "Capítulo movido" },
      });
      const highest = await prisma.revision.findFirstOrThrow({
        where: { editionId: edition.id },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const next = await prisma.revision.create({
        data: {
          editionId: edition.id,
          number: highest.number + 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      for (const entry of await prisma.revisionUnit.findMany({
        where: { revisionId: previousRevisionId },
        select: { unitId: true, unitVersionId: true, order: true },
      })) {
        await prisma.revisionUnit.create({
          data: {
            revisionId: next.id,
            unitId: entry.unitId,
            unitVersionId: entry.unitVersionId,
            order: entry.order + 1000,
          },
        });
      }
      await prisma.revisionUnit.create({
        data: {
          revisionId: next.id,
          unitId: unit.id,
          unitVersionId: version.id,
          order: 1,
        },
      });
      await prisma.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: next.id },
      });

      // The rebind lands on the draft's OWN unit.
      await twoGuides.rebindDraft(created.id, ALT_PIN);
      expect(await bindingOf(EEC_PIN.guideKey)).toEqual({
        reservation: ALT_PIN.guideKey,
        columns: [ALT_PIN.guideKey],
        json: [ALT_PIN.guideKey],
      });
      const reservations = await prisma.experienceGuideReservation.findMany({
        select: { contentUnitId: true },
      });
      expect(reservations).toEqual([{ contentUnitId: unitA }]);

      // ── The residual this test used to record is CLOSED ─────────────────
      //
      // It read: "the selector answers a question the CMS cannot make
      // identity-based on its own", because the shipped anchor named
      // `(bookSlug, chapterOrder)` and the READER gated on that same positional
      // anchor. Making only the CMS identity-based would have let an editor
      // bind a guide no reader could open — strictly worse than refusing.
      //
      // C.3R made the reader identity-based and deleted `anchorAppliesTo`, so
      // both halves now ask the same question. The assertions below are the
      // previous ones INVERTED, and that inversion is the whole point of
      // restacking this branch on it.
      //
      // Order 1001 is where the guide's own unit now sits: the offer followed
      // the UNIT.
      const atMoved = await twoGuides.listSelectableGuides(BOOK_A, 1001, null);
      expect(atMoved.map((o) => o.guideKey).sort()).toEqual(
        [ALT_PIN.guideKey, EEC_PIN.guideKey].sort(),
      );
      // Order 1 is a brand-new unit that no guide targets. Under the old rule
      // it was offered both guides, purely because it inherited the number.
      const atOne = await twoGuides.listSelectableGuides(BOOK_A, 1, null);
      expect(atOne.map((o) => o.guideKey)).toEqual([]);

      // And the half that was always C.3A/C.4's: the reservation stayed with
      // the unit, so the moved draft still holds its guide and nothing was
      // silently reassigned.
      expect(
        await prisma.experienceGuideReservation.findMany({
          select: { contentUnitId: true, guideKey: true },
        }),
      ).toEqual([{ contentUnitId: unitA, guideKey: ALT_PIN.guideKey }]);
    } finally {
      await prisma.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: previousRevisionId },
      });
    }
  });

  it("the same pin twice is a replay, not a conflict", async () => {
    const created = await twoGuides.createDraft(userId, await eecDraft());
    await twoGuides.rebindDraft(created.id, ALT_PIN);
    // A double submit, a retried request, a stale render.
    await twoGuides.rebindDraft(created.id, ALT_PIN);
    await twoGuides.rebindDraft(created.id, ALT_PIN);

    expect(await bindingOf(EEC_PIN.guideKey)).toEqual({
      reservation: ALT_PIN.guideKey,
      columns: [ALT_PIN.guideKey],
      json: [ALT_PIN.guideKey],
    });
    expect(await prisma.experienceGuideReservation.count()).toBe(1);
  });

  it("two concurrent rebinds to DIFFERENT guides leave one coherent state", async () => {
    const created = await twoGuides.createDraft(userId, await eecDraft());
    const results = await Promise.allSettled([
      twoGuides.rebindDraft(created.id, ALT_PIN),
      twoGuides.rebindDraft(created.id, EEC_PIN),
    ]);
    // Both may legitimately succeed — they are serialised, not mutually
    // exclusive. What must never happen is a state where the three
    // descriptions disagree.
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);

    const after = await bindingOf(EEC_PIN.guideKey);
    expect(after.columns).toEqual([after.reservation]);
    expect(after.json).toEqual([after.reservation]);
    expect(await prisma.experienceGuideReservation.count()).toBe(1);
  });

  it("a failure after the reservation moved rolls the move back", async () => {
    // The move happens first, then the definitions are rewritten. If the
    // second half throws, a reservation left on the new guide would be a
    // lineage holding something none of its rows claim.
    const first = await twoGuides.createDraft(userId, await eecDraft());
    const second = await twoGuides.createNextDraft(userId, EEC_PIN.guideKey, 1);
    // Corrupt the SIBLING, so the rewrite loop throws after the move.
    await prisma.chapterExperienceVersion.update({
      where: { id: second.id },
      data: { definitionJson: { nonsense: true } as unknown as never },
    });

    await expect(twoGuides.rebindDraft(first.id, ALT_PIN)).rejects.toBeTruthy();

    const after = await bindingOf(EEC_PIN.guideKey);
    expect(after.reservation).toBe(EEC_PIN.guideKey);
    expect(after.columns).toEqual([EEC_PIN.guideKey, EEC_PIN.guideKey]);
    // v1's definition was never rewritten either: the whole transaction went.
    expect(after.json[0]).toBe(EEC_PIN.guideKey);
  });

  it("a lineage with any published version can never rebind", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.publish(created.id);
    const next = await service.createNextDraft(
      userId,
      "eec-c1-cuerpo-antes-que-mente",
      1,
    );

    await expect(
      service.rebindDraft(next.id, {
        guideKey: "eec-c1-cuerpo-antes-que-mente",
        guideVersion: 1,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_BINDING_IMMUTABLE",
      }),
    });
  });

  // ── A fleet with both binaries in it ─────────────────────────────────────

  /** Is somebody actually WAITING on an advisory lock right now? */
  async function waitForAdvisoryWaiter(timeoutMs = 5_000): Promise<boolean> {
    const started = process.hrtime.bigint();
    const limit = BigInt(timeoutMs) * 1_000_000n;
    while (process.hrtime.bigint() - started < limit) {
      const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n
          FROM pg_locks
         WHERE locktype = 'advisory' AND NOT granted`;
      if (Number((rows[0] as { n: bigint }).n) > 0) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return false;
  }

  it("V1 and V2 serialise on the SAME chapter key", async () => {
    /**
     * The mixed fleet, modelled honestly: V1's sequence is taken from the
     * retained `bridgeBindingLockKeys`, not hand-copied, so this proves the two
     * derivations meet rather than that two literals happen to match.
     */
    expect(bridgeBindingLockKeys(unitA)[1]).toBe(bindingLockKeys(unitA)[0]);

    const b = barrier();
    // A V1 transaction holding its two locks.
    const v1 = prisma.$transaction(async (tx) => {
      for (const key of bridgeBindingLockKeys(unitA)) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 42))`;
      }
      b.arrive();
      await b.gate;
      return "v1-done";
    });

    await b.reached;
    let v2Settled = false;
    const v2 = service.createDraft(userId, await eecDraft()).then(
      () => {
        v2Settled = true;
      },
      () => {
        v2Settled = true;
      },
    );

    // Wait for V2 to be OBSERVABLY blocked on an advisory lock before
    // concluding anything. Draining the event loop is not enough on its own: a
    // build that took NO lock would still be mid-flight after two microtasks,
    // so `v2Settled === false` would hold for a reason that has nothing to do
    // with serialisation — and the test would pass while the lock was gone.
    expect(await waitForAdvisoryWaiter()).toBe(true);
    // V2 takes only the chapter key — and that is the key V1 is holding.
    expect(v2Settled).toBe(false);

    b.open();
    await v1;
    await v2;
    expect(v2Settled).toBe(true);
  });

  it("V2 no longer takes the global key, so a global holder does not block it", async () => {
    // The narrowing, demonstrated: after C.3B there is nothing left that needs
    // every chapter serialised behind one key.
    const b = barrier();
    const holder = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"experience:binding:global"}, 42))`;
      b.arrive();
      await b.gate;
      return "held";
    });

    await b.reached;
    const created = await service.createDraft(userId, await eecDraft());
    expect(created.id).toBeTruthy();

    b.open();
    await holder;
  });
  // ── C.3R · the CMS asks by identity, and pays a fixed price for it ────────

  describe("the selector decides by identity", () => {
    it("a pin from the OTHER book never appears", async () => {
      // Parejas' guide targets a unit in Parejas. Offering it here would let an
      // editor bind a passage that lives in another book entirely.
      const options = await service.listSelectableGuides(BOOK_A, 1, null);
      expect(options.map((o) => o.guideKey)).not.toContain(
        "pqp-c1-contacto-sostenido",
      );
      // And the reverse, so this cannot pass because the list is empty.
      const there = await service.listSelectableGuides(BOOK_B, 2, null);
      expect(there.map((o) => o.guideKey)).toContain(
        "pqp-c1-contacto-sostenido",
      );
    });

    it("a version the registry does not have never appears", async () => {
      // A catalog whose anchor names `v9` of a real guide. The authority
      // answers UNKNOWN_DEFINITION, which is an editorial "no", not an option.
      const ghost = new ExperienceAdminService(
        prisma as unknown as PrismaService,
        productionCodeOwnedClaims,
        {
          anchors: [{ ...GUIDE_READER_ANCHOR, guideVersion: 9 }],
          getExact: (k, v) => productionGuideRegistry.getExact(k, v),
        },
        new GuideTargetContextService(
          new LearningCatalogResolver(prisma as unknown as PrismaService),
        ),
      );
      expect(await ghost.listSelectableGuides(BOOK_A, 1, null)).toEqual([]);
    });

    it("a catalog that is broken — not merely incomplete — fails CLOSED", async () => {
      // A registry that throws something other than "no such definition" means
      // the BUILD is wrong. Reading that as "no guides here" would present an
      // empty menu as an editorial fact; it propagates instead.
      const broken = new ExperienceAdminService(
        prisma as unknown as PrismaService,
        productionCodeOwnedClaims,
        {
          anchors: [GUIDE_READER_ANCHOR],
          getExact: () => {
            throw new TypeError("catalog is broken");
          },
        },
        new GuideTargetContextService(
          new LearningCatalogResolver(prisma as unknown as PrismaService),
          {
            getExact: () => {
              throw new TypeError("catalog is broken");
            },
          },
        ),
      );
      await expect(
        broken.listSelectableGuides(BOOK_A, 1, null),
      ).rejects.toThrow();
    });

    it("the response carries pins, never an internal identifier", async () => {
      const options = await service.listSelectableGuides(BOOK_A, 1, null);
      expect(options.length).toBeGreaterThan(0);
      const wire = JSON.stringify(options);
      expect(wire).not.toContain("contentUnitId");
      expect(wire).not.toContain(unitA);
      expect(wire).not.toContain("unitKey");
      expect(wire).not.toContain("revisionId");
      for (const o of options) {
        expect(Object.keys(o).sort()).toEqual([
          "availability",
          "guideKey",
          "guideVersion",
          "stepCount",
        ]);
      }
    });

    it("2 and 25 distinct candidates cost the same number of reads", async () => {
      // Measured end to end inside the real transaction. The editor must not
      // pay for the catalog's size, and "it batches" is exactly the kind of
      // claim that rots into an N+1 the first time somebody adds a loop.
      const count = async (n: number): Promise<number> => {
        let queries = 0;
        const countingTx = (tx: object): object =>
          new Proxy(tx, {
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
        const countingClient = new Proxy(prisma, {
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
        }) as unknown as PrismaService;

        // DISTINCT pins, and every one of them RESOLVABLE. Synthetic keys the
        // registry does not know would be answered before a single query is
        // issued, and the measurement would say "batched" about a batch that
        // never touched the catalog. Each is the real definition under its own
        // key, so all n are placed for real.
        const anchors = Array.from({ length: n }, (_, i) =>
          i === 0
            ? GUIDE_READER_ANCHOR
            : { ...GUIDE_READER_ANCHOR, guideKey: `${EEC_PIN.guideKey}-c${i}` },
        );
        const menu = {
          anchors,
          getExact: (guideKey: string, guideVersion: number) => ({
            ...productionGuideRegistry.getExact(
              EEC_PIN.guideKey,
              EEC_PIN.guideVersion,
            ),
            guideKey,
            guideVersion,
          }),
        };
        const svc = new ExperienceAdminService(
          countingClient,
          productionCodeOwnedClaims,
          menu,
          new GuideTargetContextService(
            new LearningCatalogResolver(countingClient),
            menu,
          ),
        );
        await svc.listSelectableGuides(BOOK_A, 1, null);
        return queries;
      };

      const two = await count(2);
      const twentyFive = await count(25);
      expect(twentyFive).toBe(two);
      // eslint-disable-next-line no-console
      console.log(`GUIDE_OPTIONS_QUERIES_2_DISTINCT=${two}`);
      // eslint-disable-next-line no-console
      console.log(`GUIDE_OPTIONS_QUERIES_25_DISTINCT=${twentyFive}`);
    });
  });

  describe("the write path re-decides for itself", () => {
    it("a request naming a pin from another book is refused at CREATE", async () => {
      // The UI never offered it; this is a hand-made request. What the browser
      // was shown is not authorisation, so the refusal comes from the server
      // re-placing the pin, not from the menu it happened to render.
      await expect(
        service.createDraft(
          userId,
          await eecDraft({
            guidePin: {
              guideKey: "pqp-c1-contacto-sostenido",
              guideVersion: 1,
            },
          }),
        ),
      ).rejects.toMatchObject({
        response: { code: "EXPERIENCE_GUIDE_PIN_NOT_RUNNABLE_HERE" },
      });
      expect(
        await prisma.chapterExperienceVersion.count({
          where: { guideKey: "pqp-c1-contacto-sostenido" },
        }),
      ).toBe(0);
    });

    it("ownership follows the unit when the position moves under the write", async () => {
      // The outer read learns which chapter to lock and nothing else. Here the
      // guide's unit is renumbered between that read and the write: the binding
      // still lands on the unit the guide targets, at whatever number it now
      // holds.
      const edition = await prisma.edition.findFirstOrThrow({
        where: { slug: BOOK_A },
        select: { id: true, publishedRevisionId: true },
      });
      const previous = edition.publishedRevisionId as string;
      const before = await prisma.revisionUnit.findFirstOrThrow({
        where: { revisionId: previous, unitId: unitA },
        select: { order: true },
      });
      try {
        await prisma.revisionUnit.update({
          where: {
            revisionId_unitId: { revisionId: previous, unitId: unitA },
          },
          data: { order: before.order + 500 },
        });
        const created = await service.createDraft(
          userId,
          await eecDraft({ chapterOrder: before.order + 500 }),
        );
        const row = await prisma.chapterExperienceVersion.findUniqueOrThrow({
          where: { id: created.id },
          select: { contentUnitId: true },
        });
        expect(row.contentUnitId).toBe(unitA);
        await prisma.chapterExperienceVersion.delete({
          where: { id: created.id },
        });
        await prisma.experienceGuideReservation.deleteMany({
          where: { contentUnitId: unitA },
        });
      } finally {
        await prisma.revisionUnit.update({
          where: { revisionId_unitId: { revisionId: previous, unitId: unitA } },
          data: { order: before.order },
        });
      }
    });
  });
});
