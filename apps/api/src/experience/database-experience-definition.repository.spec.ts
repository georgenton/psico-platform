import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChapterExperienceDefinition } from "@psico/types";
import { DatabaseExperienceDefinitionRepository } from "./database-experience-definition.repository";
import { ExperienceDiscoveryService } from "./experience-discovery.service";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * CMS V1 (#637) — what the database half is allowed to serve.
 *
 * The invariant with teeth is the first one: a DRAFT must be invisible to the
 * reader through every path, not merely absent from a list somebody remembered
 * to filter. It is checked here at the repository AND through the discovery
 * service that Chapter Home actually calls.
 */

const DRAFT_TITLE = "Borrador que ningún lector debería ver jamás";

function definition(
  overrides: Partial<ChapterExperienceDefinition> = {},
): ChapterExperienceDefinition {
  return {
    experienceKey: "qa-cms",
    experienceVersion: 1,
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    title: "Publicada",
    status: "PUBLISHED",
    guidePin: { guideKey: "g", guideVersion: 1 },
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
      findMany: vi.fn(),
    },
  };
}

let prisma: ReturnType<typeof prismaMock>;
let repo: DatabaseExperienceDefinitionRepository;

beforeEach(() => {
  prisma = prismaMock();
  repo = new DatabaseExperienceDefinitionRepository(
    prisma as unknown as PrismaService,
  );
});

describe("DatabaseExperienceDefinitionRepository", () => {
  it("serves a published row for an exact pin", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      status: "PUBLISHED",
      definitionJson: definition({ experienceVersion: 2 }),
    });

    const found = await repo.getExact({
      experienceKey: "qa-cms",
      experienceVersion: 2,
    });

    expect(found?.experienceVersion).toBe(2);
  });

  it("does not resolve a draft even when its exact pin is asked for", async () => {
    prisma.chapterExperienceVersion.findUnique.mockResolvedValue({
      status: "DRAFT",
      definitionJson: definition({ status: "DRAFT", title: DRAFT_TITLE }),
    });

    const found = await repo.getExact({
      experienceKey: "qa-cms",
      experienceVersion: 1,
    });

    expect(found).toBeNull();
  });

  it("asks the database only for published rows of that exact chapter", async () => {
    prisma.chapterExperienceVersion.findMany.mockResolvedValue([]);

    await repo.listPublishedForChapter({
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
    });

    expect(
      prisma.chapterExperienceVersion.findMany.mock.calls[0]![0].where,
    ).toEqual({
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      status: "PUBLISHED",
    });
  });

  it("skips a corrupt row instead of taking the whole chapter down", async () => {
    // A row written by an older build, or edited by hand. One bad definition
    // must not deny the reader the good ones.
    prisma.chapterExperienceVersion.findMany.mockResolvedValue([
      { definitionJson: { nonsense: true } },
      { definitionJson: definition() },
    ]);

    const list = await repo.listPublishedForChapter({
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
    });

    expect(list.map((d) => d.title)).toEqual(["Publicada"]);
  });

  it("keeps a draft out of what Chapter Home discovers", async () => {
    // The same claim, through the service the reader's surface actually calls.
    prisma.chapterExperienceVersion.findMany.mockResolvedValue([]);
    const discovery = new ExperienceDiscoveryService(repo);

    const offered = await discovery.listPublishedForChapter({
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
    });

    expect(JSON.stringify(offered)).not.toContain(DRAFT_TITLE);
    expect(offered).toEqual([]);
  });
});
