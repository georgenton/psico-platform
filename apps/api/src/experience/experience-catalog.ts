/**
 * Experience Player V2 — server-side catalog (ADR 0021).
 *
 * Same posture as `guide-catalog.ts`: every definition arriving as `unknown`
 * is REBUILT field by field, so an unknown scene kind or a stray payload key
 * cannot survive into the runtime. Nothing is mutated, nothing is aliased,
 * and everything returned is deeply frozen.
 *
 * The part that is specific to V2 is the BINDING check in
 * `validateExperienceAgainstGuide`: an experience is only coherent in the
 * context of the exact `GuideDefinition` it pins. Validating the shape alone
 * would let a REFLECTION scene claim to complete an `ACTIVE_RECALL`, which
 * type-checks but is nonsense — a reflection cannot be graded.
 */

import {
  EXPERIENCE_SCENE_KINDS,
  sceneKindCanBind,
  sceneKindCanComplete,
  type ChapterExperienceDefinition,
  type ExperienceSceneDefinition,
  type ExperienceSceneKind,
  type ExperienceStatus,
  type GuideDefinition,
} from "@psico/types";

export type ExperienceCatalogErrorCode =
  | "EXPERIENCE_CATALOG_INVALID_DEFINITION"
  | "EXPERIENCE_CATALOG_BINDING_INVALID"
  | "EXPERIENCE_CATALOG_DUPLICATE_DEFINITION";

export class ExperienceCatalogError extends Error {
  constructor(readonly code: ExperienceCatalogErrorCode) {
    super(code);
    this.name = "ExperienceCatalogError";
  }
}

const fail = (): never => {
  throw new ExperienceCatalogError("EXPERIENCE_CATALOG_INVALID_DEFINITION");
};

const failBinding = (): never => {
  throw new ExperienceCatalogError("EXPERIENCE_CATALOG_BINDING_INVALID");
};

/** Same key grammar as the Guide catalog — lowercase, no spaces, bounded. */
const KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Rejects anything outside `allowed` — an extra payload field is an error. */
function assertExactKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) fail();
  }
}

function requireKey(value: unknown): string {
  if (typeof value !== "string" || !KEY_RE.test(value)) fail();
  return value as string;
}

/** Short human copy: present, non-empty, and bounded so nobody pastes a book. */
function requireCopy(value: unknown, max: number): string {
  if (typeof value !== "string") fail();
  const text = (value as string).trim();
  if (text.length === 0 || text.length > max) fail();
  return text;
}

function optionalCopy(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  return requireCopy(value, max);
}

const SCENE_BASE_KEYS = ["sceneKey", "order", "kind"] as const;
const BINDABLE_BASE_KEYS = [...SCENE_BASE_KEYS, "completesGuideStepKey"];

interface RebuiltSceneBase {
  sceneKey: string;
  order: number;
  completesGuideStepKey?: string;
}

function rebuildSceneBase(
  obj: Record<string, unknown>,
  kind: ExperienceSceneKind,
): RebuiltSceneBase {
  const sceneKey = requireKey(obj.sceneKey);
  const order = obj.order;
  if (typeof order !== "number" || !Number.isInteger(order) || order < 1) {
    fail();
  }
  const base: RebuiltSceneBase = { sceneKey, order: order as number };

  if (obj.completesGuideStepKey !== undefined) {
    // A presentational scene claiming a binding is a contract error, not a
    // field we quietly drop.
    if (!sceneKindCanBind(kind)) failBinding();
    base.completesGuideStepKey = requireKey(obj.completesGuideStepKey);
  }
  return base;
}

/** Rebuild one scene, exactly, by kind. */
function rebuildScene(value: unknown): ExperienceSceneDefinition {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;

  const kind = obj.kind;
  if (
    typeof kind !== "string" ||
    !(EXPERIENCE_SCENE_KINDS as readonly string[]).includes(kind)
  ) {
    fail();
  }
  const sceneKind = kind as ExperienceSceneKind;
  const allowed = sceneKindCanBind(sceneKind)
    ? BINDABLE_BASE_KEYS
    : [...SCENE_BASE_KEYS];

  switch (sceneKind) {
    case "INTRO": {
      assertExactKeys(obj, [...allowed, "title", "body"]);
      const base = rebuildSceneBase(obj, sceneKind);
      return {
        ...base,
        kind: "INTRO",
        title: requireCopy(obj.title, 120),
        body: requireCopy(obj.body, 600),
      };
    }
    case "PASSAGE": {
      assertExactKeys(obj, [...allowed, "anchorKey"]);
      const base = rebuildSceneBase(obj, sceneKind);
      return { ...base, kind: "PASSAGE", anchorKey: requireKey(obj.anchorKey) };
    }
    case "CONCEPT": {
      assertExactKeys(obj, [...allowed, "conceptKey"]);
      const base = rebuildSceneBase(obj, sceneKind);
      return {
        ...base,
        kind: "CONCEPT",
        conceptKey: requireKey(obj.conceptKey),
      };
    }
    case "EXAMPLE": {
      assertExactKeys(obj, [...allowed, "title", "body"]);
      const base = rebuildSceneBase(obj, sceneKind);
      return {
        ...base,
        kind: "EXAMPLE",
        title: requireCopy(obj.title, 120),
        body: requireCopy(obj.body, 600),
      };
    }
    case "AUDIO": {
      assertExactKeys(obj, [...allowed, "mediaKind"]);
      const base = rebuildSceneBase(obj, sceneKind);
      if (obj.mediaKind !== "AUDIOBOOK" && obj.mediaKind !== "PODCAST") fail();
      return {
        ...base,
        kind: "AUDIO",
        mediaKind: obj.mediaKind as "AUDIOBOOK" | "PODCAST",
      };
    }
    case "VIDEO": {
      assertExactKeys(obj, [...allowed, "mediaKind"]);
      const base = rebuildSceneBase(obj, sceneKind);
      if (obj.mediaKind !== "VIDEO") fail();
      return { ...base, kind: "VIDEO", mediaKind: "VIDEO" };
    }
    case "PRACTICE": {
      assertExactKeys(obj, [...allowed, "exerciseKey"]);
      const base = rebuildSceneBase(obj, sceneKind);
      return {
        ...base,
        kind: "PRACTICE",
        exerciseKey: requireKey(obj.exerciseKey),
      };
    }
    case "REFLECTION": {
      assertExactKeys(obj, [...allowed, "promptKey"]);
      const base = rebuildSceneBase(obj, sceneKind);
      return {
        ...base,
        kind: "REFLECTION",
        promptKey: requireKey(obj.promptKey),
      };
    }
    case "QUESTION": {
      assertExactKeys(obj, [...allowed, "promptKey"]);
      const base = rebuildSceneBase(obj, sceneKind);
      return {
        ...base,
        kind: "QUESTION",
        promptKey: requireKey(obj.promptKey),
      };
    }
    case "RECALL": {
      assertExactKeys(obj, [...allowed, "itemKey"]);
      const base = rebuildSceneBase(obj, sceneKind);
      return { ...base, kind: "RECALL", itemKey: requireKey(obj.itemKey) };
    }
    case "SUMMARY": {
      assertExactKeys(obj, [...allowed]);
      const base = rebuildSceneBase(obj, sceneKind);
      return { ...base, kind: "SUMMARY" };
    }
    case "RESONANCE": {
      assertExactKeys(obj, [...allowed, "conceptKey"]);
      const base = rebuildSceneBase(obj, sceneKind);
      return {
        ...base,
        kind: "RESONANCE",
        conceptKey: requireKey(obj.conceptKey),
      };
    }
    default:
      return fail();
  }
}

const STATUSES: readonly ExperienceStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
];

/**
 * Validate an unknown value as a ChapterExperienceDefinition and return a
 * NEW, deeply frozen structure.
 *
 *   - experienceVersion / chapterOrder: positive integers;
 *   - at least one scene; unique sceneKeys; contiguous order from 1;
 *   - the stored array is IN order;
 *   - every scene passes the exact variant reconstruction above.
 */
export function validateExperienceDefinition(
  value: unknown,
): ChapterExperienceDefinition {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, [
    "experienceKey",
    "experienceVersion",
    "bookSlug",
    "chapterOrder",
    "title",
    "summary",
    "estimatedMinutes",
    "status",
    "guidePin",
    "scenes",
  ]);

  const experienceKey = requireKey(obj.experienceKey);
  const experienceVersion = obj.experienceVersion;
  if (
    typeof experienceVersion !== "number" ||
    !Number.isInteger(experienceVersion) ||
    experienceVersion < 1
  ) {
    fail();
  }

  const bookSlug = requireKey(obj.bookSlug);
  const chapterOrder = obj.chapterOrder;
  if (
    typeof chapterOrder !== "number" ||
    !Number.isInteger(chapterOrder) ||
    chapterOrder < 1
  ) {
    fail();
  }

  const title = requireCopy(obj.title, 120);
  const summary = optionalCopy(obj.summary, 400);

  let estimatedMinutes: number | undefined;
  if (obj.estimatedMinutes !== undefined) {
    const m = obj.estimatedMinutes;
    if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 240) {
      fail();
    }
    estimatedMinutes = m as number;
  }

  if (
    typeof obj.status !== "string" ||
    !STATUSES.includes(obj.status as ExperienceStatus)
  ) {
    fail();
  }
  const status = obj.status as ExperienceStatus;

  if (!isPlainObject(obj.guidePin)) fail();
  const pin = obj.guidePin as Record<string, unknown>;
  assertExactKeys(pin, ["guideKey", "guideVersion"]);
  const guideKey = requireKey(pin.guideKey);
  const guideVersion = pin.guideVersion;
  if (
    typeof guideVersion !== "number" ||
    !Number.isInteger(guideVersion) ||
    guideVersion < 1
  ) {
    fail();
  }

  const rawScenes: unknown = obj.scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) fail();
  const scenes = (rawScenes as unknown[]).map(rebuildScene);

  const seen = new Set<string>();
  for (const scene of scenes) {
    if (seen.has(scene.sceneKey)) fail();
    seen.add(scene.sceneKey);
  }
  scenes.forEach((scene, index) => {
    if (scene.order !== index + 1) fail();
  });

  const definition: ChapterExperienceDefinition = {
    experienceKey,
    experienceVersion: experienceVersion as number,
    bookSlug,
    chapterOrder: chapterOrder as number,
    title,
    ...(summary === undefined ? {} : { summary }),
    ...(estimatedMinutes === undefined ? {} : { estimatedMinutes }),
    status,
    guidePin: Object.freeze({
      guideKey,
      guideVersion: guideVersion as number,
    }),
    scenes,
  };
  for (const scene of definition.scenes) Object.freeze(scene);
  Object.freeze(definition.scenes);
  return Object.freeze(definition);
}

/**
 * Check the experience against the Guide it pins.
 *
 * Three things have to hold, and each one is a real failure mode rather than
 * a formality:
 *
 *   1. every binding names a step that EXISTS in the pinned guide — otherwise
 *      the panel offers a button that can never succeed;
 *   2. the scene kind is allowed to complete that step's kind — a REFLECTION
 *      cannot be the place where a graded recall is answered;
 *   3. every required step is bound EXACTLY once — an unbound step is a
 *      journey the person cannot finish; a doubly-bound step is two panels
 *      racing for the same command.
 */
export function validateExperienceAgainstGuide(
  experience: ChapterExperienceDefinition,
  guide: GuideDefinition,
): void {
  if (
    experience.guidePin.guideKey !== guide.guideKey ||
    experience.guidePin.guideVersion !== guide.guideVersion
  ) {
    failBinding();
  }

  const stepByKey = new Map(guide.steps.map((s) => [s.stepKey, s]));
  const boundCount = new Map<string, number>();

  for (const scene of experience.scenes) {
    const stepKey = scene.completesGuideStepKey;
    if (stepKey === undefined) continue;

    const step = stepByKey.get(stepKey);
    if (step === undefined) failBinding();
    if (!sceneKindCanComplete(scene.kind, step!.kind)) failBinding();

    boundCount.set(stepKey, (boundCount.get(stepKey) ?? 0) + 1);
  }

  for (const step of guide.steps) {
    if (boundCount.get(step.stepKey) !== 1) failBinding();
  }
}
