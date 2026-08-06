/**
 * GR-6 — the closed registry of scene renderers.
 *
 * Twelve keys, one per `ExperienceSceneKind`, and `satisfies Record<…>` makes
 * that a COMPILE-TIME obligation: adding a thirteenth kind to the contract
 * without adding a renderer here does not ship a blank panel, it fails the
 * build.
 *
 * There is deliberately no `default` and no fallback component. A default
 * would turn "we have never seen this kind" into "here is something that looks
 * like a panel", which is the failure mode this registry exists to make
 * impossible. An unknown kind at RUNTIME — only reachable from data this build
 * predates — resolves to `null` and the player renders a plain contract error
 * with a way back to the chapter.
 */

import type { ExperienceSceneKind } from "@psico/types";
import type { ExperienceSceneRenderer } from "./scene-contract";
import {
  ExampleScene,
  IntroScene,
  SummaryScene,
} from "./scenes/NarrativeScenes";
import { AudioScene, VideoScene } from "./scenes/MediaScenes";
import {
  ConceptScene,
  PracticeScene,
  QuestionScene,
  ReflectionScene,
} from "./scenes/CheckpointScenes";
import {
  PassageScene,
  RecallScene,
  ResonanceScene,
} from "./scenes/PassageRecallResonanceScenes";

export const EXPERIENCE_SCENE_RENDERERS = {
  INTRO: IntroScene,
  PASSAGE: PassageScene,
  CONCEPT: ConceptScene,
  EXAMPLE: ExampleScene,
  AUDIO: AudioScene,
  VIDEO: VideoScene,
  PRACTICE: PracticeScene,
  REFLECTION: ReflectionScene,
  QUESTION: QuestionScene,
  RECALL: RecallScene,
  SUMMARY: SummaryScene,
  RESONANCE: ResonanceScene,
} satisfies Record<ExperienceSceneKind, ExperienceSceneRenderer>;

/** The code a player reports when a kind has no renderer. */
export const EXPERIENCE_SCENE_CONTRACT_ERROR =
  "EXPERIENCE_SCENE_CONTRACT_ERROR";

/**
 * The renderer for a kind, or `null`.
 *
 * Takes `string` rather than `ExperienceSceneKind` on purpose: the caller's
 * input came from data, and typing the parameter as the union would assert the
 * very thing this function is here to check.
 */
export function rendererForSceneKind(
  kind: string,
): ExperienceSceneRenderer | null {
  return (
    (EXPERIENCE_SCENE_RENDERERS as Record<string, ExperienceSceneRenderer>)[
      kind
    ] ?? null
  );
}
