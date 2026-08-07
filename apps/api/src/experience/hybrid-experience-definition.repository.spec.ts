import { describe, expect, it } from "vitest";
import type { ChapterExperienceDefinition } from "@psico/types";
import type {
  ChapterExperienceContext,
  ExperienceDefinitionRepository,
} from "./experience-definition.repository";
import { HybridExperienceDefinitionRepository } from "./hybrid-experience-definition.repository";

/**
 * CMS V1 (#637) — the migration seam.
 *
 * The properties here are the ones a reader can feel. A session pinned to the
 * version it started on must keep resolving that exact version after the CMS
 * publishes a newer one, and a chapter must offer the newest published version
 * of each experience without anyone deploying. Both at once is the whole point
 * of running code-owned and database definitions side by side.
 */

function def(
  experienceKey: string,
  experienceVersion: number,
  overrides: Partial<ChapterExperienceDefinition> = {},
): ChapterExperienceDefinition {
  return {
    experienceKey,
    experienceVersion,
    bookSlug: "libro",
    chapterOrder: 1,
    title: `${experienceKey} v${experienceVersion}`,
    status: "PUBLISHED",
    guidePin: { guideKey: "g", guideVersion: 1 },
    scenes: [],
    ...overrides,
  };
}

/** A repository backed by a plain list — enough to pin the merge rules. */
function stub(
  definitions: readonly ChapterExperienceDefinition[],
): ExperienceDefinitionRepository {
  return {
    async getExact(pin) {
      return (
        definitions.find(
          (d) =>
            d.experienceKey === pin.experienceKey &&
            d.experienceVersion === pin.experienceVersion,
        ) ?? null
      );
    },
    async listPublishedForChapter(context: ChapterExperienceContext) {
      return definitions.filter(
        (d) =>
          d.status === "PUBLISHED" &&
          d.bookSlug === context.bookSlug &&
          d.chapterOrder === context.chapterOrder,
      );
    },
  };
}

const CHAPTER: ChapterExperienceContext = {
  bookSlug: "libro",
  chapterOrder: 1,
};

describe("HybridExperienceDefinitionRepository", () => {
  it("prefers the database for an exact pin", async () => {
    const repo = new HybridExperienceDefinitionRepository(
      stub([def("eec", 2, { title: "from database" })]),
      stub([def("eec", 2, { title: "from code" })]),
    );

    const found = await repo.getExact({
      experienceKey: "eec",
      experienceVersion: 2,
    });

    expect(found?.title).toBe("from database");
  });

  it("falls back to the code-owned catalog when the database has no such row", async () => {
    // The state on the day the CMS ships: everything is still code-owned.
    const repo = new HybridExperienceDefinitionRepository(
      stub([]),
      stub([def("eec", 1)]),
    );

    const found = await repo.getExact({
      experienceKey: "eec",
      experienceVersion: 1,
    });

    expect(found?.experienceVersion).toBe(1);
  });

  it("offers the newest published version while the older one stays pinnable", async () => {
    // The property the whole design exists for: publishing v2 from the CMS
    // must not reach into a session already walking code-owned v1.
    const repo = new HybridExperienceDefinitionRepository(
      stub([def("eec", 2, { title: "database v2" })]),
      stub([def("eec", 1, { title: "code v1" })]),
    );

    const offered = await repo.listPublishedForChapter(CHAPTER);
    expect(offered).toHaveLength(1);
    expect(offered[0]!.experienceVersion).toBe(2);

    const pinned = await repo.getExact({
      experienceKey: "eec",
      experienceVersion: 1,
    });
    expect(pinned?.title).toBe("code v1");
  });

  it("never offers a draft, whichever side it came from", async () => {
    const repo = new HybridExperienceDefinitionRepository(
      stub([def("draft-only", 1, { status: "DRAFT" })]),
      stub([def("published", 1)]),
    );

    const offered = await repo.listPublishedForChapter(CHAPTER);

    expect(offered.map((d) => d.experienceKey)).toEqual(["published"]);
  });

  it("keeps a code-owned experience the CMS has not touched", async () => {
    // Publishing a version of ONE experience must not hide the others.
    const repo = new HybridExperienceDefinitionRepository(
      stub([def("alpha", 2)]),
      stub([def("alpha", 1), def("beta", 1)]),
    );

    const offered = await repo.listPublishedForChapter(CHAPTER);

    expect(
      offered.map((d) => `${d.experienceKey}@${d.experienceVersion}`),
    ).toEqual(["alpha@2", "beta@1"]);
  });

  it("orders the chapter deterministically regardless of which side answered", async () => {
    const repo = new HybridExperienceDefinitionRepository(
      stub([def("zeta", 1), def("alpha", 1)]),
      stub([def("mid", 1)]),
    );

    const offered = await repo.listPublishedForChapter(CHAPTER);

    expect(offered.map((d) => d.experienceKey)).toEqual([
      "alpha",
      "mid",
      "zeta",
    ]);
  });

  it("does not leak another chapter's experiences", async () => {
    const repo = new HybridExperienceDefinitionRepository(
      stub([def("other", 1, { chapterOrder: 2 })]),
      stub([def("mine", 1)]),
    );

    const offered = await repo.listPublishedForChapter(CHAPTER);

    expect(offered.map((d) => d.experienceKey)).toEqual(["mine"]);
  });
});
