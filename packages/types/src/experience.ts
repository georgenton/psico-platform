/**
 * Experience Player V2 — the PRESENTATION contract (ADR 0021).
 *
 * Two vocabularies, deliberately kept apart:
 *
 *   - `GuideStepKind` (4 values, ADR 0019) is the DOMAIN. The server owns
 *     whether a step is accepted, and that is what "progress" means.
 *   - `ExperienceSceneKind` (12 values, here) is what a person SEES. A scene
 *     is a panel in an ordered sequence; most scenes are pure presentation.
 *
 * A scene may bind to at most one pinned Guide step via
 * `completesGuideStepKey`. Binding does not grant the scene any authority: it
 * declares which panel is the place where that step's own completion command
 * is offered. The policy, the target and the grading still come from the
 * pinned `GuideDefinition` on the server.
 *
 * Six of the twelve kinds can never bind — a summary or an intro must not be
 * able to move a person forward through the domain.
 *
 * Payloads are closed and reference CATALOGS (conceptKey, exerciseKey,
 * itemKey, anchorKey) rather than carrying book prose. The only free strings
 * are our own short UI copy on the purely presentational kinds.
 */

import type { GuideStepKind } from "./guide";

/** The twelve panels the Player can render. Closed union. */
export type ExperienceSceneKind =
  | "INTRO"
  | "PASSAGE"
  | "CONCEPT"
  | "EXAMPLE"
  | "AUDIO"
  | "VIDEO"
  | "PRACTICE"
  | "REFLECTION"
  | "QUESTION"
  | "RECALL"
  | "SUMMARY"
  | "RESONANCE";

export const EXPERIENCE_SCENE_KINDS = [
  "INTRO",
  "PASSAGE",
  "CONCEPT",
  "EXAMPLE",
  "AUDIO",
  "VIDEO",
  "PRACTICE",
  "REFLECTION",
  "QUESTION",
  "RECALL",
  "SUMMARY",
  "RESONANCE",
] as const satisfies readonly ExperienceSceneKind[];

/**
 * Which domain step each scene kind is allowed to complete.
 *
 * An empty tuple means the scene is presentational: it renders, it can be
 * read, and it can never produce domain progress. That is the property the
 * firewall test pins — a chapter full of INTRO/EXAMPLE/SUMMARY scenes moves
 * nobody's record.
 */
export const SCENE_BINDABLE_STEP_KINDS = {
  INTRO: [],
  PASSAGE: ["CONCEPT_EXPLORATION"],
  CONCEPT: ["CONCEPT_EXPLORATION"],
  EXAMPLE: [],
  AUDIO: [],
  VIDEO: [],
  PRACTICE: ["CATALOG_PRACTICE"],
  REFLECTION: ["EXPLICIT_CONFIRMATION"],
  QUESTION: ["EXPLICIT_CONFIRMATION"],
  RECALL: ["ACTIVE_RECALL"],
  SUMMARY: [],
  RESONANCE: [],
} as const satisfies Record<ExperienceSceneKind, readonly GuideStepKind[]>;

/** True when this kind of scene is allowed to carry a step binding at all. */
export function sceneKindCanBind(kind: ExperienceSceneKind): boolean {
  return SCENE_BINDABLE_STEP_KINDS[kind].length > 0;
}

/** True when a scene of `kind` may complete a step of `stepKind`. */
export function sceneKindCanComplete(
  kind: ExperienceSceneKind,
  stepKind: GuideStepKind,
): boolean {
  return (SCENE_BINDABLE_STEP_KINDS[kind] as readonly GuideStepKind[]).includes(
    stepKind,
  );
}

// ─── Scene payloads ─────────────────────────────────────────────────────────

export interface ExperienceSceneBase {
  sceneKey: string;
  /** 1..n, contiguous, validated server-side. */
  order: number;
  /**
   * The pinned Guide step this panel offers to complete, when any. Absent on
   * every presentational scene.
   */
  completesGuideStepKey?: string;
}

/** Our own opening copy. Presentational. */
export interface ExperienceIntroScene extends ExperienceSceneBase {
  kind: "INTRO";
  title: string;
  body: string;
}

/** Locates an already-approved reader anchor. Never carries the passage text. */
export interface ExperiencePassageScene extends ExperienceSceneBase {
  kind: "PASSAGE";
  anchorKey: string;
}

/** Explains one catalog Concept. */
export interface ExperienceConceptScene extends ExperienceSceneBase {
  kind: "CONCEPT";
  conceptKey: string;
}

/** Our own illustrative copy. Presentational. */
export interface ExperienceExampleScene extends ExperienceSceneBase {
  kind: "EXAMPLE";
  title: string;
  body: string;
}

/** Reuses the chapter media pipeline. Never autoplays, never binds. */
export interface ExperienceAudioScene extends ExperienceSceneBase {
  kind: "AUDIO";
  mediaKind: "AUDIOBOOK" | "PODCAST";
}

export interface ExperienceVideoScene extends ExperienceSceneBase {
  kind: "VIDEO";
  mediaKind: "VIDEO";
}

/** A catalog practice. Completion is always the person's own confirmation. */
export interface ExperiencePracticeScene extends ExperienceSceneBase {
  kind: "PRACTICE";
  exerciseKey: string;
}

/** Invites writing. The text stays client-side / E2E — never sent as text. */
export interface ExperienceReflectionScene extends ExperienceSceneBase {
  kind: "REFLECTION";
  promptKey: string;
}

/** An ungraded question. Not recall: nothing is scored, nothing is stored. */
export interface ExperienceQuestionScene extends ExperienceSceneBase {
  kind: "QUESTION";
  promptKey: string;
}

/** An objective item. The SERVER grades it; the answer never ships. */
export interface ExperienceRecallScene extends ExperienceSceneBase {
  kind: "RECALL";
  itemKey: string;
}

/** Factual close. Derived at render time; carries no payload. */
export interface ExperienceSummaryScene extends ExperienceSceneBase {
  kind: "SUMMARY";
}

/** An optional, separate offer. "Ahora no" writes nothing. */
export interface ExperienceResonanceScene extends ExperienceSceneBase {
  kind: "RESONANCE";
  conceptKey: string;
}

export type ExperienceSceneDefinition =
  | ExperienceIntroScene
  | ExperiencePassageScene
  | ExperienceConceptScene
  | ExperienceExampleScene
  | ExperienceAudioScene
  | ExperienceVideoScene
  | ExperiencePracticeScene
  | ExperienceReflectionScene
  | ExperienceQuestionScene
  | ExperienceRecallScene
  | ExperienceSummaryScene
  | ExperienceResonanceScene;

// ─── Experience definition ──────────────────────────────────────────────────

export type ExperienceStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/**
 * One ordered journey through one chapter. Published versions are IMMUTABLE:
 * editing a published experience means publishing a new `experienceVersion`,
 * which is what lets a session pin a version and still mean something a month
 * later.
 */
export interface ChapterExperienceDefinition {
  experienceKey: string;
  experienceVersion: number;

  bookSlug: string;
  chapterOrder: number;

  title: string;
  summary?: string;
  /** Only when editorially authoritative — never invented from scene count. */
  estimatedMinutes?: number;

  status: ExperienceStatus;

  /** The exact Guide whose steps this experience's scenes may complete. */
  guidePin: {
    guideKey: string;
    guideVersion: number;
  };

  scenes: ExperienceSceneDefinition[];
}

/** The exact pin a session is fixed to. */
export interface ExperiencePin {
  experienceKey: string;
  experienceVersion: number;
}

/** What Chapter Home needs to render a card, without loading every scene. */
export interface ChapterExperienceSummary {
  experienceKey: string;
  experienceVersion: number;
  title: string;
  summary?: string;
  estimatedMinutes?: number;
  sceneCount: number;
}
