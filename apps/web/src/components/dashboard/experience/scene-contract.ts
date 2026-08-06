/**
 * GR-6 — what a scene renderer is allowed to know, and what it may ask for.
 *
 * The props are the seam that keeps twelve panels from becoming twelve
 * lifecycles. A renderer never calls the network, never mints an idempotency
 * key and never decides that a step happened: it draws, and when the reader
 * acts explicitly it calls one of the callbacks below. Everything those
 * callbacks reach lives in `useGuideRun`.
 *
 * Two absences are load-bearing:
 *
 *   - there is no `complete()` a presentational scene could call. Six of the
 *     twelve kinds cannot bind to a step at all (ADR 0021), and giving them a
 *     completion callback would make that a convention instead of a fact.
 *   - there is no `payload`. A renderer receives its OWN scene type, narrowed,
 *     so a reflection cannot accidentally render a recall's options.
 */

import type { ComponentType } from "react";
import type {
  ChapterConcept,
  ExperienceScenePublicView,
  GuideRecallOutcome,
  GuideSessionView,
} from "@psico/types";
import type { GuideAnchorResolution } from "../guide/guide-anchor";

/** What the reader can do to the media surfaces, when they exist. */
export interface ExperienceMediaHooks {
  /**
   * The chapter-media routes take a book REFERENCE and resolve it as
   * `{ OR: [{ id }, { slug }] }`, so the slug the reader's URL already carries
   * is enough. Nothing here needs the internal book ID, and asking a caller
   * for one only to hand it straight back to a lookup that accepts either was
   * a requirement we invented.
   */
  bookSlug: string;
  chapterOrder: number;
  apiBase: string;
  token: string;
}

export interface ExperienceSceneContext {
  /**
   * The scene as the SERVER resolved it: kind, binding and the words to show.
   * A renderer reads `scene.payload` and nothing else — there is no catalog in
   * this bundle to look copy up in, by design.
   */
  scene: ExperienceScenePublicView;
  /** The server's view of the run. Read-only here, always. */
  session: GuideSessionView | null;
  /**
   * Set only when the bound step is the one the server is waiting for. A
   * renderer shows its confirmation control on this and on nothing else.
   */
  pendingStepKey: string | null;
  /** A command is in flight. Controls disable; nothing else changes. */
  busy: boolean;

  /** Where the approved passage is in this chapter, or why it is not. */
  anchor: GuideAnchorResolution | null;
  /** The chapter concept, for the resonance offer. */
  concept: ChapterConcept | null;
  media: ExperienceMediaHooks | null;
  /** The verdict the SERVER returned for this session's recall, if any. */
  recallOutcome: GuideRecallOutcome | null;

  // ── The only ways a scene can cause anything ────────────────────────────
  /** Confirm the bound step. Valid only while `pendingStepKey` is set. */
  confirmStep: (stepKey: string) => void;
  /** Submit a recall answer. The server grades it; we never do. */
  submitRecall: (stepKey: string, optionKey: string) => void;
  /** Move one panel forward inside this checkpoint. No command is sent. */
  goForward: () => void;
  /** Scroll + focus the anchored paragraph, keeping the player open. */
  goToPassage: (() => void) | null;
  /**
   * Confirm the chapter concept as a resonance. Resolves when the write
   * lands, rejects when it does not, so the panel can say so.
   *
   * Deliberately its OWN callback rather than a reuse of the check-in one.
   * Opening a check-in and confirming a resonance are different acts on
   * different endpoints, and a single callback serving both is how "sí, me
   * resonó" quietly stopped saving a resonance.
   */
  confirmResonance: (() => Promise<void>) | null;
}

export type ExperienceSceneRenderer = ComponentType<ExperienceSceneContext>;
