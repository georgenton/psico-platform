import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuideSessionView } from "@psico/types";
import { ReaderGuidePanel } from "./ReaderGuidePanel";
import { GUIDE_SCENE_STORAGE_KEY } from "./guide-scene";
import type { GuideAnchorResolution } from "./guide-anchor";
import type * as ApiClientModule from "@psico/api-client";

/**
 * GR-3 — the guided-reading panel.
 *
 * The same rule as the standalone player: the SERVER decides the checkpoint,
 * the panel decides only which of its scenes is on screen. So these tests
 * assert what was sent, what the reader is told, and — for the passage, the
 * practice and the resonance — what was NOT written down.
 */

const {
  createGuideSession,
  completeGuideSessionStep,
  submitGuideStepRecall,
  cancelGuideSession,
  completeGuideSession,
} = vi.hoisted(() => ({
  createGuideSession: vi.fn(),
  completeGuideSessionStep: vi.fn(),
  submitGuideStepRecall: vi.fn(),
  cancelGuideSession: vi.fn(),
  completeGuideSession: vi.fn(),
}));

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      createGuideSession,
      completeGuideSessionStep,
      submitGuideStepRecall,
      cancelGuideSession,
      completeGuideSession,
    },
  };
});

const SESSION_ID = "cmb0guidesession01";
const SCOPE = "A".repeat(43);

function session(over: Partial<GuideSessionView> = {}): GuideSessionView {
  return {
    sessionId: SESSION_ID,
    guideKey: "eec-c1-cuerpo-antes-que-mente",
    guideVersion: 1,
    status: "ACTIVE",
    stepsCompleted: 0,
    totalSteps: 3,
    currentStepKey: "explorar-cuerpo-antes-que-mente",
    ...over,
  };
}

const ok = (over: Partial<GuideSessionView> = {}) => ({
  created: true,
  replayed: false,
  session: session(over),
});

const RESOLVED: GuideAnchorResolution = {
  status: "RESOLVED",
  blockKey: "key-1",
  blockVersionId: "ver-1",
  renderBlockId: "block-1",
};

const CONCEPT = {
  key: "eec-cuerpo-antes-que-mente",
  label: "El cuerpo sabe antes que la mente",
};

interface Handlers {
  onGoToPassage: ReturnType<typeof vi.fn>;
  onContinueReading: ReturnType<typeof vi.fn>;
  onOpenExplicitCheckin: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
}

function renderPanel(anchor: GuideAnchorResolution = RESOLVED): Handlers {
  const handlers: Handlers = {
    onGoToPassage: vi.fn(),
    onContinueReading: vi.fn(),
    onOpenExplicitCheckin: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <ReaderGuidePanel
      actorScope={SCOPE}
      anchor={anchor}
      concept={CONCEPT}
      bookSlug="emociones-en-construccion"
      chapterOrder={1}
      apiBase="https://api.test/api"
      token="tok"
      {...handlers}
    />,
  );
  return handlers;
}

/** Walk from the cover to the anchor scene of a fresh session. */
async function openAndStart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Empezar" }));
  await user.click(await screen.findByRole("button", { name: "Continuar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  createGuideSession.mockResolvedValue(ok());
  completeGuideSessionStep.mockResolvedValue(ok());
  submitGuideStepRecall.mockResolvedValue({
    created: true,
    replayed: false,
    session: session({ currentStepKey: null, stepsCompleted: 3 }),
    feedback: { outcome: "CORRECT" },
  });
  completeGuideSession.mockResolvedValue({
    created: true,
    replayed: false,
    session: session({
      status: "COMPLETED",
      currentStepKey: null,
      stepsCompleted: 3,
    }),
  });
});

describe("ReaderGuidePanel — opening it starts nothing", () => {
  it("mounts on the cover without creating a session", async () => {
    renderPanel();
    expect(
      await screen.findByText("El cuerpo sabe antes que la mente"),
    ).toBeInTheDocument();
    expect(createGuideSession).not.toHaveBeenCalled();
  });

  it("only the explicit click starts the guide", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));
    await waitFor(() => expect(createGuideSession).toHaveBeenCalledTimes(1));
    expect(createGuideSession.mock.calls[0]?.[0]).toMatchObject({
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
  });
});

describe("ReaderGuidePanel — the clip has no asset, and says so", () => {
  it("shows the pending placeholder and its transcript, never a fake player", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));

    expect(await screen.findByTestId("rgp-clip-pending")).toHaveTextContent(
      "Clip breve en producción",
    );
    expect(document.querySelector("video")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Leer transcripción" }),
    );
    expect(screen.getByText(/el cuerpo se mueve primero/i)).toBeInTheDocument();
  });
});

describe("ReaderGuidePanel — the anchored passage", () => {
  it("goes to the passage without leaving, marking or completing anything", async () => {
    const user = userEvent.setup();
    const h = renderPanel();
    await openAndStart(user);

    await user.click(
      await screen.findByRole("button", { name: "Ir al pasaje" }),
    );

    expect(h.onGoToPassage).toHaveBeenCalledTimes(1);
    // The panel stays open and no command was sent by looking at the passage.
    expect(screen.getByTestId("reader-guide-panel")).toBeInTheDocument();
    expect(h.onClose).not.toHaveBeenCalled();
    expect(completeGuideSessionStep).not.toHaveBeenCalled();
    // …and it is announced for a reader who cannot see the scroll.
    expect(
      screen.getByText("Pasaje localizado en el capítulo."),
    ).toBeInTheDocument();
  });

  it("confirms the concept step with the server's own step key", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openAndStart(user);

    await user.click(
      await screen.findByRole("button", { name: "He explorado esta idea" }),
    );
    await waitFor(() =>
      expect(completeGuideSessionStep).toHaveBeenCalledTimes(1),
    );
    expect(completeGuideSessionStep.mock.calls[0]?.[1]).toBe(
      "explorar-cuerpo-antes-que-mente",
    );
  });

  it("without a located passage there is no way to START — not just no confirmation", async () => {
    // The earlier version of this test started a session and only then
    // discovered the problem, which is the bug: a run recorded through a guide
    // whose first step cannot be shown.
    renderPanel({ status: "UNRESOLVED" });

    expect(
      await screen.findByTestId("rgp-anchor-unresolved"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Empezar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ir al pasaje" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "He explorado esta idea" }),
    ).not.toBeInTheDocument();
    // …and nothing was written.
    expect(createGuideSession).not.toHaveBeenCalled();
    expect(completeGuideSessionStep).not.toHaveBeenCalled();
  });
});

describe("ReaderGuidePanel — the practice", () => {
  beforeEach(() => {
    createGuideSession.mockResolvedValue(
      ok({
        currentStepKey: "practicar-escucharte-por-dentro",
        stepsCompleted: 1,
      }),
    );
  });

  it("completes with no timer, and sends nothing about what was observed", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));

    await user.click(
      await screen.findByRole("button", { name: "Terminé la práctica" }),
    );
    await waitFor(() =>
      expect(completeGuideSessionStep).toHaveBeenCalledTimes(1),
    );
    const body = completeGuideSessionStep.mock.calls[0]?.[2] as object;
    expect(Object.keys(body)).toEqual(["idempotencyKey"]);
  });

  it("the 45s timer is local: arming it sends nothing", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));

    await user.click(
      await screen.findByRole("button", { name: "Usar 45 segundos" }),
    );
    expect(screen.getByRole("button", { name: /Detener/ })).toBeInTheDocument();
    expect(completeGuideSessionStep).not.toHaveBeenCalled();
  });
});

describe("ReaderGuidePanel — recall and its feedback", () => {
  beforeEach(() => {
    createGuideSession.mockResolvedValue(
      ok({
        currentStepKey: "recordar-cuerpo-antes-que-mente",
        stepsCompleted: 2,
      }),
    );
  });

  it("sends only the chosen option, and shows CORRECT as agreement", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));

    await user.click(
      await screen.findByRole("radio", { name: /antes de que la mente/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );

    await waitFor(() => expect(submitGuideStepRecall).toHaveBeenCalledTimes(1));
    const body = submitGuideStepRecall.mock.calls[0]?.[2] as object;
    expect(Object.keys(body).sort()).toEqual([
      "idempotencyKey",
      "selectedOptionKey",
    ]);

    expect(await screen.findByTestId("rgp-feedback")).toHaveTextContent(
      "Eso es lo que dice el capítulo",
    );
  });

  it("REVIEW invites another look and never says «incorrecto»", async () => {
    submitGuideStepRecall.mockResolvedValue({
      created: true,
      replayed: false,
      session: session({ currentStepKey: null, stepsCompleted: 3 }),
      feedback: { outcome: "REVIEW" },
    });
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));
    await user.click(
      await screen.findByRole("radio", { name: /antes de que la mente/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );

    const feedback = await screen.findByTestId("rgp-feedback");
    expect(feedback).toHaveTextContent("Vale la pena volver al pasaje");
    expect(feedback.textContent ?? "").not.toMatch(/incorrect/i);
    // Nothing on the surface reveals which option the catalog considers right.
    expect(document.body.textContent ?? "").not.toMatch(
      /opcion-cuerpo-primero/,
    );
  });

  it("the local scene record carries no answer — only where the reader is", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));
    await user.click(
      await screen.findByRole("radio", { name: /antes de que la mente/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );
    await screen.findByTestId("rgp-feedback");

    const raw = window.localStorage.getItem(GUIDE_SCENE_STORAGE_KEY);
    if (raw) {
      const rec = JSON.parse(raw) as Record<string, unknown>;
      expect(rec).not.toHaveProperty("selectedOptionKey");
      expect(rec).not.toHaveProperty("correctOptionKey");
      expect(rec).not.toHaveProperty("userId");
      expect(rec).not.toHaveProperty("token");
    }
  });
});

describe("ReaderGuidePanel — after the guide", () => {
  beforeEach(() => {
    createGuideSession.mockResolvedValue(
      ok({ status: "COMPLETED", currentStepKey: null, stepsCompleted: 3 }),
    );
  });

  it("«Esto me resonó» makes exactly one call, with the guide as its source", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 201 }));
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));

    await user.click(
      await screen.findByRole("button", { name: "Esto me resonó" }),
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/api/resonances");
    expect(JSON.parse(String(init.body))).toMatchObject({
      conceptKey: CONCEPT.key,
      source: "guide",
    });
    fetchSpy.mockRestore();
  });

  it("«Ahora no» writes nothing at all", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));

    await user.click(await screen.findByRole("button", { name: "Ahora no" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Esto me resonó" }),
    ).not.toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("the check-in is offered as a separate, optional action", async () => {
    const user = userEvent.setup();
    const h = renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));

    await user.click(
      await screen.findByRole("button", { name: "Registrar mi momento" }),
    );
    expect(h.onOpenExplicitCheckin).toHaveBeenCalledTimes(1);
    // The guide never claims it caused whatever gets recorded there.
    expect(document.body.textContent ?? "").not.toMatch(/la guía te hizo/i);
  });

  it("«Continuar leyendo» and «Volver al pasaje» are the reader's two exits", async () => {
    const user = userEvent.setup();
    const h = renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));

    await user.click(
      await screen.findByRole("button", { name: "Continuar leyendo" }),
    );
    expect(h.onContinueReading).toHaveBeenCalledTimes(1);
  });
});

describe("ReaderGuidePanel — the verdict survives a reload", () => {
  /** Re-mount the panel the way a page refresh would: same storage, new tree. */
  function remount(anchor: GuideAnchorResolution = RESOLVED) {
    cleanup();
    return renderPanel(anchor);
  }

  async function answerRecall(outcome: "CORRECT" | "REVIEW") {
    submitGuideStepRecall.mockResolvedValue({
      created: true,
      replayed: false,
      session: session({ currentStepKey: null, stepsCompleted: 3 }),
      feedback: { outcome },
    });
    createGuideSession.mockResolvedValue(
      ok({
        currentStepKey: "recordar-cuerpo-antes-que-mente",
        stepsCompleted: 2,
      }),
    );
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Empezar" }));
    await user.click(
      await screen.findByRole("radio", { name: /antes de que la mente/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );
    await screen.findByTestId("rgp-feedback");
    return user;
  }

  /** After the recall the server reports a finished, unclosed session. */
  function serverAfterRecall() {
    createGuideSession.mockResolvedValue(
      ok({ currentStepKey: null, stepsCompleted: 3 }),
    );
  }

  it("fresh CORRECT → reload → still shows CORRECT", async () => {
    await answerRecall("CORRECT");
    serverAfterRecall();
    remount();
    expect(await screen.findByTestId("rgp-feedback")).toHaveTextContent(
      "Eso es lo que dice el capítulo",
    );
  });

  it("fresh REVIEW → reload → still shows REVIEW", async () => {
    await answerRecall("REVIEW");
    serverAfterRecall();
    remount();
    expect(await screen.findByTestId("rgp-feedback")).toHaveTextContent(
      "Vale la pena volver al pasaje",
    );
  });

  it("a replay of the same command reloads to the same verdict", async () => {
    await answerRecall("REVIEW");
    // The server answers the START replay with the same finished session.
    serverAfterRecall();
    remount();
    const first = (await screen.findByTestId("rgp-feedback")).textContent;
    remount();
    expect((await screen.findByTestId("rgp-feedback")).textContent).toBe(first);
  });

  it("acknowledged → reload → the closing screen, not the verdict again", async () => {
    const user = await answerRecall("CORRECT");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    serverAfterRecall();
    remount();

    expect(
      await screen.findByText("Ya registraste los tres pasos"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("rgp-feedback")).not.toBeInTheDocument();
  });

  it("a record whose verdict is gone falls back instead of showing an empty one", async () => {
    await answerRecall("REVIEW");
    // Corrupt exactly the outcome — the scene still claims `feedback`.
    const raw = JSON.parse(
      window.localStorage.getItem(GUIDE_SCENE_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;
    delete raw.recallOutcome;
    window.localStorage.setItem(GUIDE_SCENE_STORAGE_KEY, JSON.stringify(raw));

    serverAfterRecall();
    remount();
    expect(
      await screen.findByText("Ya registraste los tres pasos"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("rgp-feedback")).not.toBeInTheDocument();
  });

  it("another device shows no verdict — it has no record to show one from", async () => {
    await answerRecall("CORRECT");
    // A different browser: same server, empty storage. Note what this means
    // in THIS architecture (CC-7.5): the Guide has no read endpoint, so a
    // browser learns state only by replaying the START key it stored. Without
    // that key there is nothing to resume, and the honest screen is the cover
    // — a new run, not someone else's verdict.
    window.localStorage.clear();
    serverAfterRecall();
    remount();

    expect(
      await screen.findByRole("button", { name: "Empezar" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("rgp-feedback")).not.toBeInTheDocument();
  });
});
