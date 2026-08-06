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
    experienceKey: "qa-cms",
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
    $transaction: vi.fn(),
  };
}

let prisma: ReturnType<typeof prismaMock>;
let service: ExperienceAdminService;

beforeEach(() => {
  prisma = prismaMock();
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  service = new ExperienceAdminService(prisma as unknown as PrismaService);
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
      experienceKey: "qa-cms",
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

  it("keeps a draft's identity even when the payload claims another one", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      id: "row_1",
      status: "DRAFT",
      experienceKey: "qa-cms",
      experienceVersion: 3,
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
    });
    prisma.chapterExperienceVersion.update.mockResolvedValue({ id: "row_1" });

    await service.saveDraft(
      "row_1",
      definition({
        experienceKey: "otra-cosa",
        experienceVersion: 99,
        bookSlug: "otro-libro",
        chapterOrder: 7,
      }),
    );

    const stored =
      prisma.chapterExperienceVersion.update.mock.calls[0]![0].data
        .definitionJson;
    expect(stored.experienceKey).toBe("qa-cms");
    expect(stored.experienceVersion).toBe(3);
    expect(stored.bookSlug).toBe("emociones-en-construccion");
    expect(stored.chapterOrder).toBe(1);
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
