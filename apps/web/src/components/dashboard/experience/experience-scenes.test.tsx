import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ExperienceSceneKind,
  ExperienceScenePublicView,
} from "@psico/types";
import {
  EXPERIENCE_SCENE_RENDERERS,
  rendererForSceneKind,
} from "./experience-scene-registry";
import type { ExperienceSceneContext } from "./scene-contract";

/**
 * GR-6 / ADR 0021 — every scene kind, in one table.
 *
 * Twelve kinds, twelve rows, one file. Splitting this into twelve files would
 * multiply the setup without adding a single assertion: what differs between
 * an intro and a summary is two strings and one boolean, and a table shows
 * that difference far better than twelve near-identical copies would.
 *
 * Each row pins the two things a renderer may not get wrong:
 *
 *   1. It draws the words the SERVER sent. No renderer holds copy of its own,
 *      so every title here comes from the payload and nowhere else.
 *   2. It respects its binding. Six kinds can complete a domain step; six can
 *      never (ADR 0021 §4). The second group is checked with a pending step
 *      DELIBERATELY set — the strong form of the claim is that a presentational
 *      panel does not register progress even when a checkpoint is open.
 */

const BINDABLE = "paso-pendiente";

/** A scene the way discovery serves one: kind, binding, and resolved copy. */
function sceneOf(
  kind: ExperienceSceneKind,
  payload: Partial<ExperienceScenePublicView["payload"]> = {},
  completesGuideStepKey?: string,
): ExperienceScenePublicView {
  return {
    sceneKey: `k-${kind.toLowerCase()}`,
    order: 1,
    kind,
    ...(completesGuideStepKey ? { completesGuideStepKey } : {}),
    payload: {
      title: `Título de ${kind}`,
      body: [`Cuerpo de ${kind}`],
      ...payload,
    },
  };
}

const confirmStep = vi.fn();
const submitRecall = vi.fn();
const goForward = vi.fn();
const confirmResonance = vi.fn(() => Promise.resolve());

function contextFor(
  scene: ExperienceScenePublicView,
  pendingStepKey: string | null,
): ExperienceSceneContext {
  return {
    scene,
    session: {
      sessionId: "ses_1",
      guideKey: "g",
      guideVersion: 1,
      status: "ACTIVE",
      stepsCompleted: 1,
      totalSteps: 3,
      currentStepKey: pendingStepKey,
    },
    pendingStepKey,
    busy: false,
    anchor: {
      status: "RESOLVED",
      blockKey: "k-1",
      blockVersionId: "v-1",
      renderBlockId: "b-1",
    },
    concept: { key: "c", label: "Un concepto" },
    // No media context: the media panels must degrade to their honest
    // "not here yet" copy rather than reaching for a manifest.
    media: null,
    recallOutcome: null,
    confirmStep,
    submitRecall,
    goForward,
    goToPassage: vi.fn(),
    confirmResonance,
  };
}

function renderScene(
  scene: ExperienceScenePublicView,
  pendingStepKey: string | null,
) {
  const Renderer = rendererForSceneKind(scene.kind);
  if (!Renderer) throw new Error(`no renderer for ${scene.kind}`);
  return render(<Renderer {...contextFor(scene, pendingStepKey)} />);
}

interface Row {
  kind: ExperienceSceneKind;
  testId: string;
  /** Can this kind complete a domain step? ADR 0021 §4. */
  binds: boolean;
  /** Extra payload this kind needs to be renderable at all. */
  payload?: Partial<ExperienceScenePublicView["payload"]>;
  /** The label that confirms the checkpoint, for the six that bind. */
  confirmLabel?: string;
}

const ROWS: Row[] = [
  { kind: "INTRO", testId: "scene-intro", binds: false },
  {
    kind: "PASSAGE",
    testId: "scene-passage",
    binds: true,
    payload: { actionLabel: "Lo leí" },
    confirmLabel: "Lo leí",
  },
  {
    kind: "CONCEPT",
    testId: "scene-concept",
    binds: true,
    payload: { actionLabel: "He explorado esta idea" },
    confirmLabel: "He explorado esta idea",
  },
  { kind: "EXAMPLE", testId: "scene-example", binds: false },
  {
    kind: "AUDIO",
    testId: "scene-audio",
    binds: false,
    payload: { mediaKind: "AUDIOBOOK" },
  },
  {
    kind: "VIDEO",
    testId: "scene-video",
    binds: false,
    payload: { mediaKind: "VIDEO" },
  },
  {
    kind: "PRACTICE",
    testId: "scene-practice",
    binds: true,
    payload: { actionLabel: "Ya hice esta práctica" },
    confirmLabel: "Ya hice esta práctica",
  },
  {
    kind: "REFLECTION",
    testId: "scene-reflection",
    binds: true,
    payload: { actionLabel: "Lo reflexioné", placeholder: "Lo que notaste…" },
    confirmLabel: "Lo reflexioné",
  },
  {
    kind: "QUESTION",
    testId: "scene-question",
    binds: true,
    payload: { actionLabel: "Seguir", placeholder: "Si quieres, anótalo…" },
    confirmLabel: "Seguir",
  },
  {
    kind: "RECALL",
    testId: "scene-recall",
    binds: true,
    payload: {
      question: "¿Qué dice el capítulo?",
      options: [
        { optionKey: "a", label: "La primera" },
        { optionKey: "b", label: "La segunda" },
      ],
      actionLabel: "Registrar respuesta",
    },
    confirmLabel: "Registrar respuesta",
  },
  { kind: "SUMMARY", testId: "scene-summary", binds: false },
  {
    kind: "RESONANCE",
    testId: "scene-resonance",
    binds: false,
    payload: { actionLabel: "Sí, me resonó" },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("the twelve scene renderers", () => {
  it("the registry is closed: twelve kinds, no default", () => {
    expect(Object.keys(EXPERIENCE_SCENE_RENDERERS)).toHaveLength(12);
    expect(ROWS).toHaveLength(12);
    expect(new Set(ROWS.map((r) => r.kind)).size).toBe(12);
    // An unseen kind resolves to nothing rather than to a generic panel —
    // "we have never seen this" must not render as "here is a panel".
    expect(rendererForSceneKind("SOMETHING_ELSE")).toBeNull();
    expect(rendererForSceneKind("")).toBeNull();
  });

  it.each(ROWS)(
    "$kind renders the server's copy and nothing of its own",
    ({ kind, testId, payload }) => {
      renderScene(sceneOf(kind, payload), null);

      expect(screen.getByTestId(testId)).toBeInTheDocument();
      // The heading IS the payload's title. A renderer with a title of its own
      // would make the CMS unable to rename this panel.
      expect(
        screen.getByRole("heading", { name: `Título de ${kind}` }),
      ).toBeInTheDocument();
    },
  );

  it.each(ROWS.filter((r) => r.binds))(
    "$kind confirms the pending checkpoint the server named",
    async ({ kind, payload, confirmLabel }) => {
      renderScene(sceneOf(kind, payload, BINDABLE), BINDABLE);

      if (kind === "RECALL") {
        // A recall is only answerable once something is chosen: the panel
        // sends the reader's option, never a default.
        await userEvent.click(
          screen.getByRole("radio", { name: "La primera" }),
        );
        await userEvent.click(
          screen.getByRole("button", { name: confirmLabel! }),
        );
        expect(submitRecall).toHaveBeenCalledWith(BINDABLE, "a");
        expect(confirmStep).not.toHaveBeenCalled();
        return;
      }

      await userEvent.click(
        screen.getByRole("button", { name: confirmLabel! }),
      );
      expect(confirmStep).toHaveBeenCalledWith(BINDABLE);
      expect(submitRecall).not.toHaveBeenCalled();
    },
  );

  it.each(ROWS.filter((r) => !r.binds))(
    "$kind never registers a step, even with a checkpoint open",
    async ({ kind, payload }) => {
      // The pending step is set on purpose. These six kinds cannot bind, so
      // no button they own may complete it — presentation is not progress.
      renderScene(sceneOf(kind, payload), BINDABLE);

      for (const button of screen.getAllByRole("button")) {
        await userEvent.click(button);
      }
      expect(confirmStep).not.toHaveBeenCalled();
      expect(submitRecall).not.toHaveBeenCalled();
    },
  );

  it("RECALL will not send an answer before one is chosen", async () => {
    renderScene(sceneOf("RECALL", ROWS[9].payload, BINDABLE), BINDABLE);

    await userEvent.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );
    expect(submitRecall).not.toHaveBeenCalled();
  });

  it("RECALL shows what to choose between and never which one is right", () => {
    renderScene(sceneOf("RECALL", ROWS[9].payload, BINDABLE), BINDABLE);

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(2);
    // The public view carries no correct answer, so there is nothing on
    // screen — in text or in an attribute — that could give one away.
    expect(screen.getByTestId("scene-recall").outerHTML).not.toContain(
      "correct",
    );
  });

  it("RESONANCE saves only on the reader's word, and «Ahora no» writes nothing", async () => {
    renderScene(sceneOf("RESONANCE", { actionLabel: "Sí, me resonó" }), null);

    expect(confirmResonance).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Sí, me resonó" }),
    );
    expect(confirmResonance).toHaveBeenCalledTimes(1);
  });

  it("the media panels say the file is not there rather than pretending", () => {
    renderScene(sceneOf("AUDIO", { mediaKind: "AUDIOBOOK" }), null);
    expect(screen.getByTestId("scene-audio")).toBeInTheDocument();

    cleanup();
    renderScene(sceneOf("VIDEO", { mediaKind: "VIDEO" }), null);
    expect(screen.getByText(/Video en producción/i)).toBeInTheDocument();
  });
});
