import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { ChapterExperienceDefinition } from "@psico/types";
import { ExperienceAdminService } from "./experience-admin.service";
import { productionExperienceRepository } from "./experience-production-catalog";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * The real EEC definition. Publishing is checked against the EXACT guide, and
 * that guide requires every one of its steps to be completed by exactly one
 * scene — so the only honest "valid draft" fixture is a real one.
 */
async function publishableDefinition(): Promise<ChapterExperienceDefinition> {
  const def = await productionExperienceRepository.getExact({
    experienceKey: "eec-c1-cuerpo-antes-que-mente",
    experienceVersion: 1,
  });
  if (def === null) throw new Error("fixture missing: EEC v1");
  return { ...def, status: "DRAFT" };
}

/**
 * CMS V1 (#637) — the lifecycle rules.
 *
 * Scene shape is already covered by the catalog's own spec, and this service
 * deliberately owns no second opinion about it. What IS this file's business is
 * everything the browser may not decide: status, version, publishedAt, and the
 * fact that a published version can never be written again.
 */

const EEC_PIN = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
};

/** A definition that satisfies the real validator. */
function definition(
  overrides: Partial<ChapterExperienceDefinition> = {},
): ChapterExperienceDefinition {
  return {
    experienceKey: "eec-c1-cuerpo-antes-que-mente",
    experienceVersion: 1,
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    title: "Una experiencia de prueba",
    status: "DRAFT",
    guidePin: EEC_PIN,
    scenes: [
      {
        sceneKey: "intro",
        order: 1,
        kind: "INTRO",
        copy: { title: "Antes de empezar", body: ["Son unos minutos."] },
      },
    ],
    ...overrides,
  } as ChapterExperienceDefinition;
}

/**
 * C.3A — the mock grew a schema and a chapter.
 *
 * Binding mutations now read the authority from `pg_catalog`, resolve the
 * chapter through the published manifest and take advisory locks. None of that
 * is this file's subject — the lifecycle rules are — so the fixtures answer
 * "schema is the bridge shape" and "the chapter resolves", and the real
 * behaviour of both lives in `experience-binding-bridge.pg-spec.ts`, where a
 * database can actually be asked.
 */
function prismaMock() {
  return {
    chapterExperienceVersion: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    experienceGuideReservation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    edition: { findFirst: vi.fn() },
    revisionUnit: { findFirst: vi.fn() },
    contentUnit: { findUnique: vi.fn() },
    book: { findUnique: vi.fn() },
    chapter: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
}

/** The one stable chapter every fixture in this file lives in. */
const UNIT_ID = "unit_eec_c1";

/**
 * What `probeBindingSchema` reads back on a database that has had C.3A applied
 * and nothing since. Spelled out rather than partial: the detector requires
 * every predicate, and a fixture that only set the ones it remembered would
 * make this file pass for the wrong reason.
 */
const BRIDGE_SCHEMA = {
  versionTable: true,
  reservationTable: true,
  unitTable: true,
  bindingColumns: true,
  columnTypes: true,
  reservationNotNull: true,
  noDroppedBindingColumns: true,
  indexMethod: true,
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
};

let prisma: ReturnType<typeof prismaMock>;
let service: ExperienceAdminService;

beforeEach(() => {
  prisma = prismaMock();
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  prisma.chapterExperienceVersion.findMany.mockResolvedValue([]);
  // `$queryRaw` now answers two different questions — what shape the schema is
  // in, and which edition serves this book (locked FOR UPDATE) — so the mock
  // dispatches on the statement rather than returning one shape to both.
  prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
    const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
    if (sql.includes('FROM "Edition"')) {
      return Promise.resolve([
        { id: "edition_1", publishedRevisionId: "revision_1" },
      ]);
    }
    // The bridge shape: everything C.3A builds, and no cutover CHECK.
    return Promise.resolve([BRIDGE_SCHEMA]);
  });
  prisma.$executeRaw.mockResolvedValue(0);
  prisma.edition.findFirst.mockResolvedValue({
    id: "edition_1",
    publishedRevisionId: "revision_1",
  });
  prisma.revisionUnit.findFirst.mockResolvedValue({
    order: 1,
    unit: { id: UNIT_ID, unitKey: "unit-key-1" },
  });
  // A row that already carries its unit is resolved FROM that unit, so the
  // fixture has to be able to answer for it.
  prisma.contentUnit.findUnique.mockResolvedValue({
    id: UNIT_ID,
    unitKey: "unit-key-1",
    editionId: "edition_1",
  });
  prisma.experienceGuideReservation.findMany.mockResolvedValue([]);
  prisma.experienceGuideReservation.findUnique.mockResolvedValue(null);
  prisma.experienceGuideReservation.create.mockResolvedValue({});
  // What the build ships, stated rather than resolved. The real resolver walks
  // the guide registry and three catalog tables; impersonating those here would
  // make this file a test about Content Core instead of about lifecycle rules.
  // Its real behaviour lives in `experience-binding-bridge.pg-spec.ts`.
  service = new ExperienceAdminService(
    prisma as unknown as PrismaService,
    async () => [
      {
        experienceKey: "eec-c1-cuerpo-antes-que-mente",
        guideKey: EEC_PIN.guideKey,
        contentUnitId: UNIT_ID,
        definition: definition(),
      },
    ],
  );
});

describe("ExperienceAdminService — creating", () => {
  it("stores a new experience as a DRAFT at version 1, whatever the client asked for", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue(null);
    prisma.chapterExperienceVersion.create.mockResolvedValue({ id: "row_1" });

    // A client trying to publish itself by sending the status it wants.
    await service.createDraft("user_1", definition({ status: "PUBLISHED" }));

    const data = prisma.chapterExperienceVersion.create.mock.calls[0]![0].data;
    expect(data.status).toBe("DRAFT");
    expect(data.createdByUserId).toBe("user_1");
    expect(data.definitionJson.status).toBe("DRAFT");
    expect(data.publishedAt).toBeUndefined();
  });

  it("binds the guide from the server's catalog, not from the request", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue(null);
    prisma.chapterExperienceVersion.create.mockResolvedValue({ id: "row_1" });

    await service.createDraft(
      "user_1",
      definition({
        guidePin: { guideKey: "una-guia-inventada", guideVersion: 9 },
      }),
    );

    const data = prisma.chapterExperienceVersion.create.mock.calls[0]![0].data;
    expect(data.definitionJson.guidePin).toEqual(EEC_PIN);
  });

  it("refuses a chapter that publishes no guide, instead of inventing one", async () => {
    await expect(
      service.createDraft("user_1", definition({ chapterOrder: 99 })),
    ).rejects.toMatchObject({
      response: { code: "NO_GUIDE_FOR_CHAPTER" },
    });
    expect(prisma.chapterExperienceVersion.create).not.toHaveBeenCalled();
  });

  it("rejects a definition the runtime validator would not accept", async () => {
    await expect(
      service.createDraft(
        "user_1",
        definition({ scenes: [{ kind: "NOT_A_SCENE" }] as never }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.chapterExperienceVersion.create).not.toHaveBeenCalled();
  });
});

describe("ExperienceAdminService — versioning", () => {
  it("clones a code-owned published version forward as the next draft", async () => {
    // The migration path: EEC v1 ships in code, and this is how it becomes a
    // database v2 without a bulk import.
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue(null);
    prisma.chapterExperienceVersion.findFirst.mockResolvedValue(null);
    prisma.chapterExperienceVersion.create.mockResolvedValue({ id: "row_2" });

    await service.createNextDraft("user_1", "eec-c1-cuerpo-antes-que-mente", 1);

    const data = prisma.chapterExperienceVersion.create.mock.calls[0]![0].data;
    expect(data.experienceKey).toBe("eec-c1-cuerpo-antes-que-mente");
    expect(data.experienceVersion).toBe(2);
    expect(data.status).toBe("DRAFT");
    // The scenes came from the real code-owned definition, not from thin air.
    expect(data.definitionJson.scenes.length).toBeGreaterThan(0);
  });

  it("refuses to create a version that already exists", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      id: "already",
    });

    await expect(
      service.createDraft("user_1", definition()),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("ExperienceAdminService — published versions are immutable", () => {
  it("refuses to save over a published version", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      id: "row_1",
      status: "PUBLISHED",
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 1,
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
    });

    await expect(
      service.saveDraft("row_1", definition({ title: "editado" })),
    ).rejects.toMatchObject({
      response: { code: "EXPERIENCE_PUBLISHED_IMMUTABLE" },
    });
    expect(prisma.chapterExperienceVersion.update).not.toHaveBeenCalled();
  });

  it("keeps a stored pin the positional catalog would NOT have produced", async () => {
    // The discriminating case, and the reason the neighbouring test cannot be
    // one: with the production catalog `getExactContext(A, 1)` returns exactly
    // the pin the row already holds, so recomputing and keeping look identical.
    // Here the stored pin is a lineage the positional catalog does not publish
    // for this chapter — so a build that recomputed would write EEC's pin over
    // it, and one that keeps it writes what is stored.
    //
    // A lineage of its OWN, so the shipped claim (which holds EEC's guide) is
    // not what is being measured.
    const OTHER = {
      guideKey: "guia-que-el-capitulo-no-publica",
      guideVersion: 3,
    };
    const MINE = "eec-c1-propia";
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      id: "row_1",
      status: "DRAFT",
      experienceKey: MINE,
      experienceVersion: 1,
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      contentUnitId: UNIT_ID,
      definitionJson: definition({ experienceKey: MINE, guidePin: OTHER }),
    });
    prisma.chapterExperienceVersion.update.mockResolvedValue({ id: "row_1" });

    await service.saveDraft("row_1", definition());

    const written =
      prisma.chapterExperienceVersion.update.mock.calls[0]![0].data;
    expect(written.definitionJson.guidePin).toEqual(OTHER);
    expect(written.guideKey).toBe(OTHER.guideKey);
  });

  it("the next version keeps the SOURCE's pin, not the chapter's", async () => {
    const OTHER = {
      guideKey: "guia-que-el-capitulo-no-publica",
      guideVersion: 3,
    };
    const MINE = "eec-c1-propia";
    // The source lookup answers; the clash check for the NEW version must not.
    let sourceReads = 0;
    prisma.chapterExperienceVersion.findUnique.mockImplementation(
      (args: { where: Record<string, unknown> }) => {
        if (!("experienceKey_experienceVersion" in args.where)) {
          return Promise.resolve(null);
        }
        sourceReads += 1;
        // Reads 1 and 2 are the source (outer, then re-read under the lock);
        // the third is `insert` asking whether v2 already exists.
        return Promise.resolve(
          sourceReads <= 2
            ? {
                definitionJson: definition({
                  experienceKey: MINE,
                  guidePin: OTHER,
                }),
                contentUnitId: UNIT_ID,
              }
            : null,
        );
      },
    );
    prisma.chapterExperienceVersion.findFirst.mockResolvedValue({
      experienceVersion: 1,
    });
    prisma.chapterExperienceVersion.create.mockResolvedValue({ id: "row_2" });

    await service.createNextDraft("user_1", MINE, 1);

    const created =
      prisma.chapterExperienceVersion.create.mock.calls[0]![0].data;
    expect(created.experienceVersion).toBe(2);
    expect(created.guideKey).toBe(OTHER.guideKey);
    expect(created.definitionJson.guidePin).toEqual(OTHER);
  });

  it("keeps a draft's identity AND its guide, whatever the payload claims", async () => {
    // The stored definition is now load-bearing rather than decoration: the
    // guide comes from it, so a fixture without one describes a row that
    // cannot exist.
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      id: "row_1",
      status: "DRAFT",
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 3,
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      contentUnitId: UNIT_ID,
      definitionJson: definition({ experienceVersion: 3 }),
    });
    prisma.chapterExperienceVersion.update.mockResolvedValue({ id: "row_1" });

    await service.saveDraft(
      "row_1",
      definition({
        experienceKey: "otra-cosa",
        experienceVersion: 99,
        bookSlug: "otro-libro",
        chapterOrder: 7,
        // A client-supplied pin is not a rebind request. Only `rebindDraft`
        // may move a binding, and it does not exist in this phase at all.
        guidePin: { guideKey: "otra-guia", guideVersion: 9 },
      }),
    );

    const stored =
      prisma.chapterExperienceVersion.update.mock.calls[0]![0].data
        .definitionJson;
    expect(stored.experienceKey).toBe("eec-c1-cuerpo-antes-que-mente");
    expect(stored.experienceVersion).toBe(3);
    expect(stored.bookSlug).toBe("emociones-en-construccion");
    expect(stored.chapterOrder).toBe(1);
    expect(stored.guidePin).toEqual(EEC_PIN);
  });
});

describe("ExperienceAdminService — publishing", () => {
  it("publishes a valid draft and stamps the time server-side", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      id: "row_1",
      status: "DRAFT",
      definitionJson: await publishableDefinition(),
    });
    prisma.chapterExperienceVersion.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.publish("row_1");

    expect(result.publishedAt).toBeTruthy();
    const call = prisma.chapterExperienceVersion.updateMany.mock.calls[0]![0];
    expect(call.data.status).toBe("PUBLISHED");
    expect(call.data.definitionJson.status).toBe("PUBLISHED");
    // Conditional on still being a draft — this is the concurrency guard.
    expect(call.where).toMatchObject({ id: "row_1", status: "DRAFT" });
  });

  it("rejects a draft whose scene claims a step the guide does not have", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      id: "row_1",
      status: "DRAFT",
      definitionJson: definition({
        scenes: [
          {
            sceneKey: "concepto",
            order: 1,
            kind: "CONCEPT",
            conceptKey: "algo",
            completesGuideStepKey: "un-paso-que-no-existe",
            copy: {
              title: "Una idea",
              body: ["Cuerpo."],
              actionLabel: "He explorado esta idea",
            },
          },
        ] as never,
      }),
    });

    await expect(service.publish("row_1")).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.chapterExperienceVersion.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a second publish of the same row", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      id: "row_1",
      status: "PUBLISHED",
      definitionJson: definition({ status: "PUBLISHED" }),
    });

    await expect(service.publish("row_1")).rejects.toMatchObject({
      response: { code: "EXPERIENCE_ALREADY_PUBLISHED" },
    });
  });

  it("loses the race rather than double-publishing when two publishes overlap", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      id: "row_1",
      status: "DRAFT",
      definitionJson: await publishableDefinition(),
    });
    // The other transaction got there first, so the conditional update matched
    // nothing.
    prisma.chapterExperienceVersion.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.publish("row_1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("ExperienceAdminService — one lineage per guide", () => {
  /**
   * The rule exists because of a fact about PROGRESS, not about presentation.
   *
   * Two distinct experience keys bound to one guide report each other's
   * progress: finish one, and the other reads «Completada» without anyone
   * having opened it. C.1 made that visible per card; it did not make it
   * harmless.
   *
   * C.3A changed WHERE the rule lives, not what it says. It used to be a scan
   * of experience keys in `(bookSlug, chapterOrder)` — a read followed by a
   * write, with nothing between them — and it is now a reservation held under
   * a chapter lock, with the database enforcing both halves of the bijection.
   * The refusal is reported as `EXPERIENCE_GUIDE_BINDING_RESERVED`, which says
   * what is actually true: the guide is taken.
   */
  it("refuses a second experience key when the chapter ships a code-owned one", async () => {
    prisma.chapterExperienceVersion.findMany.mockResolvedValue([]);

    await expect(
      service.createDraft("user_1", definition({ experienceKey: "otra-cosa" })),
    ).rejects.toMatchObject({
      response: { code: "EXPERIENCE_GUIDE_BINDING_RESERVED" },
    });
    expect(prisma.chapterExperienceVersion.create).not.toHaveBeenCalled();
  });

  it("refuses a second key when the existing lineage is a published database row", async () => {
    prisma.chapterExperienceVersion.findMany.mockResolvedValue([
      { experienceKey: "eec-c1-cuerpo-antes-que-mente" },
    ]);

    await expect(
      service.createDraft("user_1", definition({ experienceKey: "otra-cosa" })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a second key when the existing lineage is only a DRAFT", async () => {
    // Allowing it would just move the collision to publish time, after an
    // editor has already done the work.
    prisma.chapterExperienceVersion.findMany.mockResolvedValue([
      { experienceKey: "un-borrador-en-curso" },
    ]);

    await expect(
      service.createDraft("user_1", definition({ experienceKey: "otra-cosa" })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("still creates the FIRST experience for a chapter with no lineage yet", async () => {
    prisma.chapterExperienceVersion.findMany.mockResolvedValue([]);
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue(null);
    prisma.chapterExperienceVersion.create.mockResolvedValue({ id: "row_1" });

    // Chapter 2 publishes no code-owned experience, but it also has no guide —
    // so use chapter 1's guide with the SAME key the chapter already owns.
    await service.createDraft(
      "user_1",
      definition({ experienceKey: "eec-c1-cuerpo-antes-que-mente" }),
    );

    expect(prisma.chapterExperienceVersion.create).toHaveBeenCalledTimes(1);
  });

  it("never blocks a new version of the lineage that already exists", async () => {
    // The rule is about distinct KEYS. Versioning is the supported path and
    // must keep working from a code-owned definition.
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue(null);
    prisma.chapterExperienceVersion.findFirst.mockResolvedValue(null);
    prisma.chapterExperienceVersion.create.mockResolvedValue({ id: "row_2" });

    await service.createNextDraft("user_1", "eec-c1-cuerpo-antes-que-mente", 1);

    const data = prisma.chapterExperienceVersion.create.mock.calls[0]![0].data;
    expect(data.experienceVersion).toBe(2);
  });

  it("keeps versioning a lineage that is already in the database", async () => {
    prisma.chapterExperienceVersion.findUnique
      .mockResolvedValueOnce({
        definitionJson: definition({
          experienceKey: "eec-c1-cuerpo-antes-que-mente",
          experienceVersion: 2,
          status: "PUBLISHED",
        }),
      })
      // The clash check that follows must find nothing at version 3.
      .mockResolvedValueOnce(null);
    prisma.chapterExperienceVersion.findFirst.mockResolvedValue({
      experienceVersion: 2,
    });
    prisma.chapterExperienceVersion.create.mockResolvedValue({ id: "row_3" });

    await service.createNextDraft("user_1", "eec-c1-cuerpo-antes-que-mente", 2);

    const data = prisma.chapterExperienceVersion.create.mock.calls[0]![0].data;
    expect(data.experienceVersion).toBe(3);
    expect(data.status).toBe("DRAFT");
  });
});
