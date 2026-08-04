import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuideSessionView } from "@psico/types";
import { ReaderGuidePanel } from "./ReaderGuidePanel";
import { sceneStorageKey } from "./guide-scene";
import { guideStorageKey } from "./guide-recovery";
import type { GuideAnchorResolution } from "./guide-anchor";
import { PQP_BUNDLE, PQP_PIN, EEC_PIN } from "./guide-test-fixtures";
import type * as ApiClientModule from "@psico/api-client";

/**
 * GR-4 — the panel renders the bundle it is HANDED.
 *
 * There is no Parejas reader yet (discovery lands in Session C), so this file
 * is the proof that the panel is genuinely generic rather than an Emociones
 * component with the constants moved one file over. Everything below is driven
 * by a Parejas bundle: the copy, the step keys of the commands, and the pin of
 * both storage slots.
 */

const start = vi.fn();
const completeStep = vi.fn();
const submitRecall = vi.fn();
const cancel = vi.fn();

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      createGuideSession: (...args: unknown[]) => start(...args),
      completeGuideSessionStep: (...args: unknown[]) => completeStep(...args),
      submitGuideStepRecall: (...args: unknown[]) => submitRecall(...args),
      cancelGuideSession: (...args: unknown[]) => cancel(...args),
      completeGuideSession: vi.fn(),
    },
  };
});

const SCOPE = "p".repeat(43);

const RESOLVED: GuideAnchorResolution = {
  status: "RESOLVED",
  blockKey: "pqp-key-1",
  blockVersionId: "pqp-ver-1",
  renderBlockId: "pqp-block-1",
};

const CONCEPT = {
  key: "pqp-c1-contacto-sostenido",
  label: "El contacto sostenido en silencio",
};

function session(over: Partial<GuideSessionView> = {}): GuideSessionView {
  return {
    sessionId: "ses_pqp_1",
    guideKey: PQP_PIN.guideKey,
    guideVersion: PQP_PIN.guideVersion,
    status: "ACTIVE",
    stepsCompleted: 0,
    totalSteps: 3,
    currentStepKey: "explorar-contacto-sostenido",
    ...over,
  };
}

function renderPanel() {
  render(
    <ReaderGuidePanel
      actorScope={SCOPE}
      bundle={PQP_BUNDLE}
      anchor={RESOLVED}
      concept={CONCEPT}
      bookSlug="parejas-que-perduran"
      chapterOrder={2}
      apiBase="https://api.test/api"
      token="tok"
      onClose={vi.fn()}
      onGoToPassage={vi.fn()}
      onContinueReading={vi.fn()}
      onOpenExplicitCheckin={vi.fn()}
    />,
  );
}

/** Seed a recovery record so the panel resumes instead of showing the cover. */
function seedRecovery() {
  window.localStorage.setItem(
    guideStorageKey(PQP_PIN) as string,
    JSON.stringify({
      schemaVersion: 1,
      actorScope: SCOPE,
      guideKey: PQP_PIN.guideKey,
      guideVersion: PQP_PIN.guideVersion,
      startIdempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  window.localStorage.clear();
});

describe("ReaderGuidePanel · Parejas bundle", () => {
  it("renders the Parejas cover copy, not the Emociones one", async () => {
    renderPanel();
    expect(
      await screen.findByText("El contacto sostenido en silencio"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("El cuerpo sabe antes que la mente"),
    ).not.toBeInTheDocument();
  });

  it("declares the Parejas scope beside its own badge", async () => {
    renderPanel();
    expect(await screen.findByText("Guía breve")).toBeInTheDocument();
    expect(screen.getByTestId("rgp-scope")).toHaveTextContent(
      "1 idea del capítulo",
    );
  });

  it("starts the run with the PAREJAS pin", async () => {
    start.mockResolvedValue({ session: session() });
    renderPanel();
    await userEvent.click(
      await screen.findByRole("button", { name: "Empezar" }),
    );

    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(start.mock.calls[0]?.[0]).toMatchObject({
      guideKey: "pqp-c1-contacto-sostenido",
      guideVersion: 1,
    });
  });

  it("sends the SERVER's current step key — no hardcoded literal", async () => {
    seedRecovery();
    start.mockResolvedValue({ session: session() });
    completeStep.mockResolvedValue({
      session: session({
        currentStepKey: "practicar-diez-minutos-de-contacto",
      }),
    });
    renderPanel();

    // Resumed on the concept checkpoint, which opens on the cover; step past
    // the clip to reach the anchor screen where the confirm button lives.
    await userEvent.click(
      await screen.findByRole("button", { name: "Continuar" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Continuar" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "He explorado esta idea" }),
    );

    await waitFor(() => expect(completeStep).toHaveBeenCalled());
    expect(completeStep.mock.calls[0]?.[1]).toBe("explorar-contacto-sostenido");
    // The Emociones key never appears — the panel reads the current step.
    expect(completeStep.mock.calls[0]?.[1]).not.toBe(
      "explorar-cuerpo-antes-que-mente",
    );
  });

  it("renders the Parejas recall options and sends ONLY the option key", async () => {
    seedRecovery();
    start.mockResolvedValue({
      session: session({
        currentStepKey: "recordar-contacto-sostenido",
        stepsCompleted: 2,
      }),
    });
    submitRecall.mockResolvedValue({
      session: session({
        currentStepKey: null,
        stepsCompleted: 3,
      }),
      feedback: { outcome: "CORRECT" },
    });
    renderPanel();

    const option = await screen.findByRole("radio", {
      name: /Sentarse frente a frente/,
    });
    await userEvent.click(option);
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );

    await waitFor(() => expect(submitRecall).toHaveBeenCalled());
    expect(submitRecall.mock.calls[0]?.[1]).toBe("recordar-contacto-sostenido");
    const body = submitRecall.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "idempotencyKey",
      "selectedOptionKey",
    ]);
    expect(body.selectedOptionKey).toBe("pqp-opcion-manos-y-mirada");
  });

  it("uses the PAREJAS practice timer, not the Emociones one", async () => {
    seedRecovery();
    start.mockResolvedValue({
      session: session({
        currentStepKey: "practicar-diez-minutos-de-contacto",
        stepsCompleted: 1,
      }),
    });
    renderPanel();
    expect(
      await screen.findByRole("button", { name: "Usar 10 minutos" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Usar 45 segundos" }),
    ).not.toBeInTheDocument();
  });

  it("writes its scene into the PAREJAS slot and never the Emociones one", async () => {
    seedRecovery();
    start.mockResolvedValue({ session: session() });
    renderPanel();

    await userEvent.click(
      await screen.findByRole("button", { name: "Continuar" }),
    );
    await waitFor(() =>
      expect(
        window.localStorage.getItem(sceneStorageKey(PQP_PIN) as string),
      ).not.toBeNull(),
    );
    expect(
      window.localStorage.getItem(sceneStorageKey(EEC_PIN) as string),
    ).toBeNull();
  });

  it("fails closed when the server hands back another guide's session", async () => {
    seedRecovery();
    // The start key is genuinely this user's, so the server answers — but with
    // a session for a different pinned guide. Nothing about it is renderable
    // here, and re-aiming the run at it would move the reader silently.
    start.mockResolvedValue({
      session: session({
        guideKey: EEC_PIN.guideKey,
        guideVersion: EEC_PIN.guideVersion,
      }),
    });
    renderPanel();

    expect(
      await screen.findByText("No pudimos mostrar el paso actual."),
    ).toBeInTheDocument();
    // No command was attempted against the foreign session.
    expect(completeStep).not.toHaveBeenCalled();
    expect(submitRecall).not.toHaveBeenCalled();
  });
});
