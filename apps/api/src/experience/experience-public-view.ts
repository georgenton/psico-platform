/**
 * GR-6 — definition → what the browser may see.
 *
 * One small mapper, no framework. It touches no database and holds no workflow
 * rule; it turns a validated internal definition into the renderable view the
 * discovery route serves.
 *
 * The mapping is mostly a copy. The one place it does real work is RECALL:
 * the question and the option LABELS come from the server-side exercise
 * catalog, and `correctOptionKey` is read there and deliberately left behind.
 * An answer that never leaves the server cannot be read out of a network tab,
 * and that is the whole reason grading is server-side in the first place.
 */

import type {
  ChapterExperienceDefinition,
  ChapterExperiencePublicView,
  ExperienceScenePayload,
  ExperienceScenePublicView,
  ExperienceSceneDefinition,
} from "@psico/types";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";

/** The recall item's public half, or `null` when this build has no such item. */
function recallView(
  bookSlug: string,
  itemKey: string,
): {
  question: string;
  options: { optionKey: string; label: string }[];
} | null {
  const units = EXERCISE_INGESTION_CATALOG[bookSlug] ?? [];
  for (const unit of units) {
    if (unit.recall.exerciseKey !== itemKey) continue;
    return {
      question: unit.recall.title,
      // `content.correctOptionKey` is right there and is NOT read. The public
      // view carries what a reader chooses between, never which one is right.
      options: unit.recall.content.options.map((o) => ({
        optionKey: o.key,
        label: o.label,
      })),
    };
  }
  return null;
}

function scenePayload(
  scene: ExperienceSceneDefinition,
  bookSlug: string,
): ExperienceScenePayload {
  const base: ExperienceScenePayload = {
    title: scene.copy.title,
    body: scene.copy.body ?? [],
    ...(scene.copy.note !== undefined ? { note: scene.copy.note } : {}),
    ...(scene.copy.actionLabel !== undefined
      ? { actionLabel: scene.copy.actionLabel }
      : {}),
    ...(scene.copy.placeholder !== undefined
      ? { placeholder: scene.copy.placeholder }
      : {}),
  };

  switch (scene.kind) {
    // The locator, never the passage. Copying the chapter into a JSON payload
    // would put licensed prose somewhere it does not belong.
    case "PASSAGE":
      return { ...base, anchorKey: scene.anchorKey };
    case "CONCEPT":
    case "RESONANCE":
      return { ...base, conceptKey: scene.conceptKey };
    // The key, never the interaction. The player asks the learning surface for
    // the content, which is where the closed parser lives.
    case "PRACTICE":
      return { ...base, exerciseKey: scene.exerciseKey };
    // The format, never a signed URL. Access is its own request, with its own
    // entitlement check, at the moment a reader actually presses play.
    case "AUDIO":
    case "VIDEO":
      return { ...base, mediaKind: scene.mediaKind };
    case "RECALL": {
      const view = recallView(bookSlug, scene.itemKey);
      // An item this build does not know yields a scene with no question and
      // no options. The player renders that as a contract error rather than an
      // empty quiz — better a plain sentence than a question nobody can answer.
      return view === null
        ? base
        : { ...base, question: view.question, options: view.options };
    }
    default:
      return base;
  }
}

export function toPublicSceneView(
  scene: ExperienceSceneDefinition,
  bookSlug: string,
): ExperienceScenePublicView {
  return {
    sceneKey: scene.sceneKey,
    order: scene.order,
    kind: scene.kind,
    ...(scene.completesGuideStepKey !== undefined
      ? { completesGuideStepKey: scene.completesGuideStepKey }
      : {}),
    payload: scenePayload(scene, bookSlug),
  };
}

/**
 * The whole experience, renderable.
 *
 * `status` is not in the view: only PUBLISHED definitions are ever served, so
 * carrying the field would be telling the client something it cannot act on.
 * `bookSlug` and `chapterOrder` are likewise absent — the caller asked for a
 * specific chapter and already knows which one.
 */
export function toPublicExperienceView(
  definition: ChapterExperienceDefinition,
): ChapterExperiencePublicView {
  return {
    experienceKey: definition.experienceKey,
    experienceVersion: definition.experienceVersion,
    title: definition.title,
    ...(definition.summary !== undefined
      ? { summary: definition.summary }
      : {}),
    ...(definition.estimatedMinutes !== undefined
      ? { estimatedMinutes: definition.estimatedMinutes }
      : {}),
    guidePin: {
      guideKey: definition.guidePin.guideKey,
      guideVersion: definition.guidePin.guideVersion,
    },
    scenes: definition.scenes.map((s) =>
      toPublicSceneView(s, definition.bookSlug),
    ),
  };
}
