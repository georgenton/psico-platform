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

/**
 * The renderable words of ONE scene.
 *
 * It lives on the definition, server-side, because a journey's copy has to be
 * able to change when a CMS publishes — not when a browser bundle ships. The
 * client renders what it is handed and holds no catalog of its own.
 *
 * Deliberately small and shared across kinds. Twelve bespoke copy shapes would
 * be twelve places to add a field the day a panel needs one more line.
 */
export interface ExperienceSceneCopy {
  title: string;
  /** One paragraph, or several. A renderer decides how to lay them out. */
  body?: readonly string[];
  /** A quieter clarification. Never a new claim. */
  note?: string;
  /** The label of the control that CONFIRMS the bound step. */
  actionLabel?: string;
  /** Placeholder for a local, never-transmitted textarea. */
  placeholder?: string;
}

/** Our own opening copy. Presentational. */
export interface ExperienceIntroScene extends ExperienceSceneBase {
  kind: "INTRO";
  copy: ExperienceSceneCopy;
}

/** Locates an already-approved reader anchor. Never carries the passage text. */
export interface ExperiencePassageScene extends ExperienceSceneBase {
  kind: "PASSAGE";
  anchorKey: string;
  copy: ExperienceSceneCopy;
}

/** Explains one catalog Concept. */
export interface ExperienceConceptScene extends ExperienceSceneBase {
  kind: "CONCEPT";
  conceptKey: string;
  copy: ExperienceSceneCopy;
}

/** Our own illustrative copy. Presentational. */
export interface ExperienceExampleScene extends ExperienceSceneBase {
  kind: "EXAMPLE";
  copy: ExperienceSceneCopy;
}

/** Reuses the chapter media pipeline. Never autoplays, never binds. */
export interface ExperienceAudioScene extends ExperienceSceneBase {
  kind: "AUDIO";
  mediaKind: "AUDIOBOOK" | "PODCAST";
  copy: ExperienceSceneCopy;
}

export interface ExperienceVideoScene extends ExperienceSceneBase {
  kind: "VIDEO";
  mediaKind: "VIDEO";
  copy: ExperienceSceneCopy;
}

/** A catalog practice. Completion is always the person's own confirmation. */
export interface ExperiencePracticeScene extends ExperienceSceneBase {
  kind: "PRACTICE";
  exerciseKey: string;
  copy: ExperienceSceneCopy;
}

/** Invites writing. The text stays client-side / E2E — never sent as text. */
export interface ExperienceReflectionScene extends ExperienceSceneBase {
  kind: "REFLECTION";
  promptKey: string;
  copy: ExperienceSceneCopy;
}

/** An ungraded question. Not recall: nothing is scored, nothing is stored. */
export interface ExperienceQuestionScene extends ExperienceSceneBase {
  kind: "QUESTION";
  promptKey: string;
  copy: ExperienceSceneCopy;
}

/** An objective item. The SERVER grades it; the answer never ships. */
export interface ExperienceRecallScene extends ExperienceSceneBase {
  kind: "RECALL";
  itemKey: string;
  copy: ExperienceSceneCopy;
}

/** Factual close. Derived at render time; carries no payload. */
export interface ExperienceSummaryScene extends ExperienceSceneBase {
  kind: "SUMMARY";
  copy: ExperienceSceneCopy;
}

/** An optional, separate offer. "Ahora no" writes nothing. */
export interface ExperienceResonanceScene extends ExperienceSceneBase {
  kind: "RESONANCE";
  conceptKey: string;
  copy: ExperienceSceneCopy;
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

/**
 * GR-6 — what the browser asks for when a reader opens a chapter.
 *
 * Closed and deliberately plain: a list, zero to many, of PUBLISHED
 * definitions at their exact immutable versions. There is no cursor, no
 * filter and no total, because a chapter has as many journeys as it has and
 * that number is small.
 *
 * The response carries definitions, never presentation copy: what a panel
 * SAYS is the client's, what a journey IS is the server's.
 */

// ─── The public view ────────────────────────────────────────────────────────

/** A recall option as the reader sees it. The correct one is not marked. */
export interface ExperienceRecallOptionView {
  optionKey: string;
  label: string;
}

/**
 * One scene, resolved for rendering.
 *
 * `payload` carries everything a renderer needs and nothing it does not. The
 * RECALL payload in particular carries the question and the options and NEVER
 * `correctOptionKey`: the server grades, and an answer that never leaves the
 * server cannot be read out of a network tab.
 */
export interface ExperienceScenePayload {
  title: string;
  body: readonly string[];
  note?: string;
  actionLabel?: string;
  placeholder?: string;
  /** PASSAGE — the approved locator, never the passage text itself. */
  anchorKey?: string;
  /** CONCEPT · RESONANCE. */
  conceptKey?: string;
  /** AUDIO · VIDEO — which produced format, never a signed URL. */
  mediaKind?: "AUDIOBOOK" | "PODCAST" | "VIDEO";
  /** RECALL only. */
  question?: string;
  options?: readonly ExperienceRecallOptionView[];
}

export interface ExperienceScenePublicView {
  sceneKey: string;
  order: number;
  kind: ExperienceSceneKind;
  completesGuideStepKey?: string;
  payload: ExperienceScenePayload;
}

/**
 * One experience, as the browser receives it: renderable, versioned, and
 * carrying no internal identifier a client has no business holding.
 */
export interface ChapterExperiencePublicView {
  experienceKey: string;
  experienceVersion: number;
  title: string;
  summary?: string;
  estimatedMinutes?: number;
  guidePin: { guideKey: string; guideVersion: number };
  scenes: ExperienceScenePublicView[];
}

export interface ChapterExperienceDiscoveryResponse {
  items: ChapterExperiencePublicView[];
}

// ─── CMS V1 (#637) — admin views ────────────────────────────────────────────

/**
 * One experience as the back-office lists it.
 *
 * `source` is the honest part: a `code` row ships in the build and has no
 * database id, so it can be read and cloned forward but never edited in place.
 */
/**
 * The lifecycle of a stored version, as the CMS sees it.
 *
 * C.3A recognises `ARCHIVED` before any command can produce it. That order is
 * deliberate: the bridge binary and the cutover binary run side by side during
 * a rolling deploy, and a binary that folded an unknown status into `DRAFT`
 * would present an archived experience as editable. Knowing the word costs
 * nothing; discovering it at runtime would cost an edit.
 */
export type AdminExperienceStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface AdminExperienceRow {
  id: string | null;
  experienceKey: string;
  experienceVersion: number;
  title: string;
  summary: string | null;
  estimatedMinutes: number | null;
  status: AdminExperienceStatus;
  sceneCount: number;
  source: "database" | "code";
  publishedAt: string | null;
  updatedAt: string | null;
}

/** How a guide option stands for the chapter being edited (C.4). */
export type GuideOptionAvailability =
  | "AVAILABLE"
  | "OWNED_BY_THIS_EXPERIENCE"
  | "RESERVED_BY_ANOTHER_EXPERIENCE";

/**
 * One guide an editor may bind, as the SERVER decides it.
 *
 * A guide reserved by another experience is listed as reserved, never hidden:
 * "that guide does not exist" would be false, and an editor who cannot see the
 * collision cannot resolve it. Who holds it is deliberately not disclosed.
 */
export interface SelectableGuideOption {
  guideKey: string;
  guideVersion: number;
  stepCount: number;
  availability: GuideOptionAvailability;
}

/** Everything the editor needs for one chapter, in one read. */
export interface AdminChapterExperiences {
  bookSlug: string;
  chapterOrder: number;
  /**
   * C.3A — the STABLE chapter this list was scoped by.
   *
   * `(bookSlug, chapterOrder)` above is a locator and it moves: a reorder
   * changes which unit answers to a number. This is the identity the server
   * resolved from the published manifest, and the client hands it straight back
   * on the next write so a page rendered before a reorder is refused rather
   * than silently applied to whichever unit now occupies that position.
   *
   * `null` means the chapter resolves to no unit in the published structure —
   * it cannot host a binding at all, and no write against it will succeed.
   */
  contentUnitId: string | null;
  /** The only guide an experience here may pin, or null when none exists. */
  guidePin: { guideKey: string; guideVersion: number } | null;
  experiences: AdminExperienceRow[];
}

/** A stored definition, as the draft editor loads it. */
export interface AdminExperienceDraft {
  id: string;
  status: AdminExperienceStatus;
  definition: ChapterExperienceDefinition;
  /**
   * C.3A — the STABLE chapter this row lives in, echoed back on every write.
   *
   * `null` for a row the C.3B backfill has not reached yet: it has no identity
   * to claim, and claiming its `chapterOrder` instead would be claiming a
   * position.
   */
  contentUnitId: string | null;
  /**
   * C.4 — may this draft still change guide?
   *
   * A property of the LINEAGE, not of this row: one published version anywhere
   * fixes the guide forever (PUBLISHED_GUIDE_KEY_IMMUTABLE), and a draft
   * sitting beside a published sibling looks rebindable from the outside. The
   * server decides it so the CMS can hide the control rather than offer it and
   * answer with a conflict.
   */
  rebindable: boolean;
}
