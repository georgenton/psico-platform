import { describe, expect, it } from "vitest";

import {
  EXPERIENCE_SCENE_KINDS,
  SCENE_BINDABLE_STEP_KINDS,
  sceneKindCanBind,
  sceneKindCanComplete,
  type ExperienceSceneKind,
  type GuideDefinition,
} from "@psico/types";

import {
  ExperienceCatalogError,
  validateExperienceAgainstGuide,
  validateExperienceDefinition,
} from "./experience-catalog";
import { CodeOwnedExperienceDefinitionRepository } from "./experience-definition.repository";
import {
  EEC_C1_EXPERIENCE,
  PQP_C1_EXPERIENCE,
  productionExperienceRepository,
} from "./experience-production-catalog";
import {
  EEC_C1_BODY_BEFORE_MIND_GUIDE,
  PQP_C1_SUSTAINED_CONTACT_GUIDE,
} from "../guide/guide-catalog";

/**
 * The V2 presentation contract, pinned (ADR 0021).
 *
 * The property that matters most here is the one in §"binding": a scene can
 * only complete a domain step when the pairing makes sense. Everything else
 * is shape validation, which is cheap; the binding matrix is what stops a
 * summary panel from quietly moving somebody's record forward.
 */

/**
 * The kind-specific fields each scene must carry, so every test starts from
 * truth. Words are NOT here: a scene's copy lives in its `copy` block, which
 * every kind carries and which the public view resolves for the browser.
 */
const PAYLOAD: Record<ExperienceSceneKind, Record<string, unknown>> = {
  INTRO: {},
  PASSAGE: { anchorKey: "a-key" },
  CONCEPT: { conceptKey: "c-key" },
  EXAMPLE: {},
  AUDIO: { mediaKind: "AUDIOBOOK" },
  VIDEO: { mediaKind: "VIDEO" },
  PRACTICE: { exerciseKey: "e-key" },
  REFLECTION: { promptKey: "p-key" },
  QUESTION: { promptKey: "q-key" },
  RECALL: { itemKey: "i-key" },
  SUMMARY: {},
  RESONANCE: { conceptKey: "c-key" },
};

/** The words every kind carries. Short, ours, and never book prose. */
const COPY = { title: "Un momento", body: ["Una línea corta."] };

const scene = (kind: ExperienceSceneKind, over: Record<string, unknown> = {}) =>
  ({
    sceneKey: "s-1",
    order: 1,
    kind,
    copy: COPY,
    ...PAYLOAD[kind],
    ...over,
  }) as unknown;

const experience = (scenes: unknown[], over: Record<string, unknown> = {}) =>
  ({
    experienceKey: "x-key",
    experienceVersion: 1,
    bookSlug: "a-book",
    chapterOrder: 1,
    title: "Un recorrido",
    status: "PUBLISHED",
    guidePin: { guideKey: "g-key", guideVersion: 1 },
    scenes,
    ...over,
  }) as unknown;

describe("Experience V2 — the twelve scene kinds", () => {
  it("the union has exactly twelve members and no duplicates", () => {
    expect(EXPERIENCE_SCENE_KINDS).toHaveLength(12);
    expect(new Set(EXPERIENCE_SCENE_KINDS).size).toBe(12);
  });

  it.each(EXPERIENCE_SCENE_KINDS)("%s accepts a valid payload", (kind) => {
    const def = validateExperienceDefinition(experience([scene(kind)]));
    expect(def.scenes[0]!.kind).toBe(kind);
  });

  it.each(EXPERIENCE_SCENE_KINDS)("%s rejects an extra field", (kind) => {
    expect(() =>
      validateExperienceDefinition(experience([scene(kind, { extra: 1 })])),
    ).toThrow(ExperienceCatalogError);
  });

  it.each(
    EXPERIENCE_SCENE_KINDS.filter((k) => Object.keys(PAYLOAD[k]).length > 0),
  )("%s rejects a missing required field", (kind) => {
    const [first] = Object.keys(PAYLOAD[kind]);
    const s = scene(kind) as Record<string, unknown>;
    delete s[first!];
    expect(() => validateExperienceDefinition(experience([s]))).toThrow(
      ExperienceCatalogError,
    );
  });

  it("rejects a payload belonging to another kind", () => {
    expect(() =>
      // CONCEPT's payload under a RECALL kind.
      validateExperienceDefinition(
        experience([
          {
            sceneKey: "s-1",
            order: 1,
            kind: "RECALL",
            copy: COPY,
            conceptKey: "c-key",
          },
        ]),
      ),
    ).toThrow(ExperienceCatalogError);
  });

  it("rejects an unknown kind — including a plausible thirteenth", () => {
    for (const kind of ["JOURNAL", "SERVER_ACTION", "", "concept"]) {
      expect(() =>
        validateExperienceDefinition(
          experience([{ sceneKey: "s-1", order: 1, kind, copy: COPY }]),
        ),
      ).toThrow(ExperienceCatalogError);
    }
  });

  it("rejects an order gap, a duplicate sceneKey and an empty list", () => {
    expect(() =>
      validateExperienceDefinition(
        experience([
          scene("INTRO"),
          scene("SUMMARY", { sceneKey: "s-3", order: 3 }),
        ]),
      ),
    ).toThrow(ExperienceCatalogError);

    expect(() =>
      validateExperienceDefinition(
        experience([scene("INTRO"), scene("SUMMARY", { order: 2 })]),
      ),
    ).toThrow(ExperienceCatalogError);

    expect(() => validateExperienceDefinition(experience([]))).toThrow(
      ExperienceCatalogError,
    );
  });

  it("freezes what it returns, so a caller cannot mutate the catalog", () => {
    const def = validateExperienceDefinition(experience([scene("INTRO")]));
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.scenes)).toBe(true);
    expect(Object.isFrozen(def.scenes[0])).toBe(true);
  });
});

describe("Experience V2 — binding is the firewall", () => {
  const PRESENTATIONAL: ExperienceSceneKind[] = [
    "INTRO",
    "EXAMPLE",
    "AUDIO",
    "VIDEO",
    "SUMMARY",
    "RESONANCE",
  ];

  it("six kinds can never bind, and six can", () => {
    for (const kind of PRESENTATIONAL)
      expect(sceneKindCanBind(kind)).toBe(false);
    for (const kind of [
      "PASSAGE",
      "CONCEPT",
      "PRACTICE",
      "REFLECTION",
      "QUESTION",
      "RECALL",
    ] as const) {
      expect(sceneKindCanBind(kind)).toBe(true);
    }
  });

  it.each(PRESENTATIONAL)(
    "%s is rejected outright when it claims a binding",
    (kind) => {
      expect(() =>
        validateExperienceDefinition(
          experience([scene(kind, { completesGuideStepKey: "s" })]),
        ),
      ).toThrow(ExperienceCatalogError);
    },
  );

  it("the matrix pairs each bindable scene with the right domain step", () => {
    expect(sceneKindCanComplete("PASSAGE", "CONCEPT_EXPLORATION")).toBe(true);
    expect(sceneKindCanComplete("CONCEPT", "CONCEPT_EXPLORATION")).toBe(true);
    expect(sceneKindCanComplete("PRACTICE", "CATALOG_PRACTICE")).toBe(true);
    expect(sceneKindCanComplete("RECALL", "ACTIVE_RECALL")).toBe(true);
    expect(sceneKindCanComplete("REFLECTION", "EXPLICIT_CONFIRMATION")).toBe(
      true,
    );
    expect(sceneKindCanComplete("QUESTION", "EXPLICIT_CONFIRMATION")).toBe(
      true,
    );

    // A reflection cannot be where a graded item is answered.
    expect(sceneKindCanComplete("REFLECTION", "ACTIVE_RECALL")).toBe(false);
    expect(sceneKindCanComplete("CONCEPT", "CATALOG_PRACTICE")).toBe(false);
  });

  it("every scene kind appears in the matrix exactly once", () => {
    expect(Object.keys(SCENE_BINDABLE_STEP_KINDS).sort()).toEqual(
      [...EXPERIENCE_SCENE_KINDS].sort(),
    );
  });
});

describe("Experience V2 — coherence against the pinned guide", () => {
  const guide = EEC_C1_BODY_BEFORE_MIND_GUIDE;
  const pin = { guideKey: guide.guideKey, guideVersion: guide.guideVersion };

  const bound = (over: Record<string, unknown>[] = []) =>
    validateExperienceDefinition(
      experience(
        [
          scene("CONCEPT", {
            sceneKey: "c",
            order: 1,
            completesGuideStepKey: "explorar-cuerpo-antes-que-mente",
          }),
          scene("PRACTICE", {
            sceneKey: "p",
            order: 2,
            completesGuideStepKey: "practicar-escucharte-por-dentro",
          }),
          scene("RECALL", {
            sceneKey: "r",
            order: 3,
            completesGuideStepKey: "recordar-cuerpo-antes-que-mente",
          }),
          ...over,
        ],
        { guidePin: pin },
      ),
    );

  it("accepts an experience that binds every required step exactly once", () => {
    expect(() => validateExperienceAgainstGuide(bound(), guide)).not.toThrow();
  });

  it("rejects a binding to a step the pinned guide does not have", () => {
    const def = validateExperienceDefinition(
      experience(
        [scene("CONCEPT", { completesGuideStepKey: "no-such-step" })],
        { guidePin: pin },
      ),
    );
    expect(() => validateExperienceAgainstGuide(def, guide)).toThrow(
      ExperienceCatalogError,
    );
  });

  it("rejects a scene bound to a step of the wrong kind", () => {
    const def = validateExperienceDefinition(
      experience(
        [
          // A REFLECTION cannot complete the ACTIVE_RECALL step.
          scene("REFLECTION", {
            completesGuideStepKey: "recordar-cuerpo-antes-que-mente",
          }),
        ],
        { guidePin: pin },
      ),
    );
    expect(() => validateExperienceAgainstGuide(def, guide)).toThrow(
      ExperienceCatalogError,
    );
  });

  it("rejects an unbound required step — a journey nobody can finish", () => {
    const def = validateExperienceDefinition(
      experience(
        [
          scene("CONCEPT", {
            completesGuideStepKey: "explorar-cuerpo-antes-que-mente",
          }),
        ],
        { guidePin: pin },
      ),
    );
    expect(() => validateExperienceAgainstGuide(def, guide)).toThrow(
      ExperienceCatalogError,
    );
  });

  it("rejects two scenes racing for the same step", () => {
    const def = bound([
      scene("PASSAGE", {
        sceneKey: "p2",
        order: 4,
        completesGuideStepKey: "explorar-cuerpo-antes-que-mente",
      }),
    ]);
    expect(() => validateExperienceAgainstGuide(def, guide)).toThrow(
      ExperienceCatalogError,
    );
  });

  it("rejects an experience pinned to a different guide", () => {
    expect(() =>
      validateExperienceAgainstGuide(
        bound(),
        PQP_C1_SUSTAINED_CONTACT_GUIDE as GuideDefinition,
      ),
    ).toThrow(ExperienceCatalogError);
  });
});

describe("Experience V2 — chapter cardinality is 0..N, never invented", () => {
  const make = (over: Record<string, unknown>) =>
    validateExperienceDefinition(experience([scene("INTRO")], over));

  it("a chapter with no experiences returns an empty list", async () => {
    const repo = new CodeOwnedExperienceDefinitionRepository([]);
    await expect(
      repo.listPublishedForChapter({ bookSlug: "a-book", chapterOrder: 1 }),
    ).resolves.toEqual([]);
  });

  it("one and N experiences both come back in declared order", async () => {
    const one = new CodeOwnedExperienceDefinitionRepository([
      make({ experienceKey: "b-one" }),
    ]);
    await expect(
      one.listPublishedForChapter({ bookSlug: "a-book", chapterOrder: 1 }),
    ).resolves.toHaveLength(1);

    const many = new CodeOwnedExperienceDefinitionRepository([
      make({ experienceKey: "c-third" }),
      make({ experienceKey: "a-first" }),
      make({ experienceKey: "b-second" }),
    ]);
    const list = await many.listPublishedForChapter({
      bookSlug: "a-book",
      chapterOrder: 1,
    });
    expect(list.map((d) => d.experienceKey)).toEqual([
      "a-first",
      "b-second",
      "c-third",
    ]);
  });

  it("DRAFT and ARCHIVED are never listed, but stay resolvable by pin", async () => {
    const repo = new CodeOwnedExperienceDefinitionRepository([
      make({ experienceKey: "draft-one", status: "DRAFT" }),
      make({ experienceKey: "archived-one", status: "ARCHIVED" }),
    ]);
    await expect(
      repo.listPublishedForChapter({ bookSlug: "a-book", chapterOrder: 1 }),
    ).resolves.toEqual([]);
    await expect(
      repo.getExact({ experienceKey: "draft-one", experienceVersion: 1 }),
    ).resolves.not.toBeNull();
  });

  it("getExact is version-pinned and never falls back", async () => {
    const repo = new CodeOwnedExperienceDefinitionRepository([
      make({ experienceKey: "x-key", experienceVersion: 1 }),
      make({ experienceKey: "x-key", experienceVersion: 2 }),
    ]);
    const v1 = await repo.getExact({
      experienceKey: "x-key",
      experienceVersion: 1,
    });
    expect(v1?.experienceVersion).toBe(1);
    await expect(
      repo.getExact({ experienceKey: "x-key", experienceVersion: 9 }),
    ).resolves.toBeNull();
    await expect(
      repo.getExact({ experienceKey: "nope", experienceVersion: 1 }),
    ).resolves.toBeNull();
  });

  it("never crosses into another book or chapter", async () => {
    const repo = new CodeOwnedExperienceDefinitionRepository([
      make({ experienceKey: "x-key" }),
    ]);
    await expect(
      repo.listPublishedForChapter({ bookSlug: "other-book", chapterOrder: 1 }),
    ).resolves.toEqual([]);
    await expect(
      repo.listPublishedForChapter({ bookSlug: "a-book", chapterOrder: 2 }),
    ).resolves.toEqual([]);
  });

  it("refuses a duplicate key@version at construction", () => {
    expect(
      () =>
        new CodeOwnedExperienceDefinitionRepository([
          make({ experienceKey: "x-key" }),
          make({ experienceKey: "x-key" }),
        ]),
    ).toThrow(/DUPLICATE/);
  });
});

describe("Experience V2 — the production catalog", () => {
  it("ships both approved experiences, each coherent with its guide", async () => {
    await expect(
      productionExperienceRepository.listPublishedForChapter({
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
      }),
    ).resolves.toHaveLength(1);

    await expect(
      productionExperienceRepository.listPublishedForChapter({
        bookSlug: "parejas-que-perduran",
        chapterOrder: 2,
      }),
    ).resolves.toHaveLength(1);
  });

  it("binds exactly the three existing checkpoints — no new domain steps", () => {
    for (const [exp, guide] of [
      [EEC_C1_EXPERIENCE, EEC_C1_BODY_BEFORE_MIND_GUIDE],
      [PQP_C1_EXPERIENCE, PQP_C1_SUSTAINED_CONTACT_GUIDE],
    ] as const) {
      const bound = exp.scenes.filter((s) => s.completesGuideStepKey);
      expect(bound).toHaveLength(3);
      expect(guide.steps).toHaveLength(3);
      expect(bound.map((s) => s.completesGuideStepKey).sort()).toEqual(
        guide.steps.map((s) => s.stepKey).sort(),
      );
    }
  });

  it("most scenes are presentational — they cannot move a record", () => {
    const all = [...EEC_C1_EXPERIENCE.scenes, ...PQP_C1_EXPERIENCE.scenes];
    const inert = all.filter((s) => !s.completesGuideStepKey);
    expect(inert.length).toBeGreaterThan(all.length / 2);
    for (const s of inert) expect(s.completesGuideStepKey).toBeUndefined();
  });

  it("carries no book prose — copy is short and ours", () => {
    for (const s of [
      ...EEC_C1_EXPERIENCE.scenes,
      ...PQP_C1_EXPERIENCE.scenes,
    ]) {
      // Now that every kind carries a `copy` block, the check covers all
      // twelve rather than the two that used to hold prose fields. A scene
      // whose body ran to book length would mean the chapter had been pasted
      // into the journey instead of pointed at.
      for (const line of s.copy.body ?? []) {
        expect(line.length).toBeLessThanOrEqual(600);
      }
      expect(s.copy.title.length).toBeLessThanOrEqual(120);
    }
  });
});
