import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ChapterExperiencePublicView,
  GuideSessionView,
} from "@psico/types";

/**
 * B2 — the three routes that can begin a NEW run, and what they owe a reader
 * who already has something here.
 *
 * `POST /guide/sessions` answers 410 for a pin in `RETIRED_FOR_NEW_STARTS`.
 * B1 stopped the cover from offering that press. Two routes were left, and
 * they matter more than the cover did, because on both of them the reader is
 * not a stranger to the journey:
 *
 *   - «Empezar de nuevo», on the screen that says an open run exists;
 *   - «Repetir experiencia», on the summary of a finished one.
 *
 * What the refusal did there is not only an error message. `useGuideRun` maps
 * 410 to `gone`, and its `gone` branch calls `clearGuideRecovery(pin)` and
 * blanks `session`. From the completed summary that re-derives the screen as
 * the cover — so one press on «Repetir experiencia» replaced a finished run's
 * own summary with a cover refusing to start it. Nothing was lost on the
 * server (the next mount re-reads COMPLETED from `getExperienceState`), but
 * the reader watched their journey disappear for pressing a button the app
 * already knew would be refused.
 *
 * Every claim below is paired with its negative control: the SAME press on a
 * definition the server reports as startable must still work. A gate that
 * blocks everything would pass the first half of this file and fail the
 * product.
 */

const { run } = vi.hoisted(() => ({ run: { current: null as unknown } }));

vi.mock("../guide/use-guide-run", () => ({
  useGuideRun: () => run.current,
}));

import { ExperiencePlayer } from "./ExperiencePlayer";
import { EEC_BUNDLE, EEC_EXPERIENCE } from "../guide/guide-test-fixtures";

const SCOPE = "S".repeat(43);

const start = vi.fn(() => Promise.resolve());
const adopt = vi.fn();

/** The same experience, with the server's answer about new starts varied. */
function definitionWith(
  startable: boolean | undefined,
): ChapterExperiencePublicView {
  if (startable === undefined) return EEC_EXPERIENCE;
  return { ...EEC_EXPERIENCE, startable };
}

function sessionOf(status: GuideSessionView["status"]): GuideSessionView {
  return {
    sessionId: "ses_historica",
    guideKey: "eec-c1-cuerpo-antes-que-mente",
    guideVersion: 1,
    status,
    stepsCompleted: status === "COMPLETED" ? 3 : 1,
    totalSteps: 3,
    currentStepKey:
      status === "COMPLETED" ? null : "explorar-cuerpo-antes-que-mente",
  };
}

/**
 * A run in one of the two screens under test. `recoverable` carries the open
 * session the server offered and `session` stays null — that pair is what
 * `deriveExperiencePresentationState` reads as "an open run exists".
 */
function runOf(where: "recoverable" | "completed") {
  const abierta = where === "recoverable";
  return {
    screen: abierta ? "recoverable" : "completed",
    session: abierta ? null : sessionOf("COMPLETED"),
    step: null,
    error: null,
    retry: null,
    busy: false,
    booting: false,
    recallOutcome: null,
    recallMessage: null,
    recoverable: abierta ? sessionOf("ACTIVE") : null,
    facts: { confirmedStepKeys: [], recalls: [] },
    serverSummary: null,
    choice: null,
    setChoice: vi.fn(),
    start,
    adopt,
    completeStep: vi.fn(),
    submitRecall: vi.fn(),
    finish: vi.fn(),
    cancel: vi.fn(),
    retryPending: vi.fn(),
    restart: vi.fn(),
  };
}

function mount(
  startable: boolean | undefined,
  where: "recoverable" | "completed",
) {
  run.current = runOf(where);
  render(
    <ExperiencePlayer
      actorScope={SCOPE}
      definition={definitionWith(startable)}
      bundle={EEC_BUNDLE}
      onContinueReading={() => {}}
      onClose={() => {}}
    />,
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  start.mockClear();
  adopt.mockClear();
});

describe("ExperiencePlayer — una sesión abierta en un pin retirado", () => {
  it("no ofrece empezar de nuevo, y lo dice", async () => {
    mount(false, "recoverable");

    const deNuevo = screen.getByRole("button", { name: "Empezar de nuevo" });
    expect(deNuevo).toBeDisabled();
    await userEvent.click(deNuevo);
    expect(start).not.toHaveBeenCalled();

    // Deshabilitar sin explicar sería dejar al lector adivinando.
    expect(
      screen.getByText(/ya no admite empezar de nuevo/i),
    ).toBeInTheDocument();
  });

  it("deja continuar el recorrido que ya existe", async () => {
    // La garantía que importa: la retirada quita el inicio, no el avance.
    mount(false, "recoverable");

    await userEvent.click(
      screen.getByRole("button", { name: "Continuar experiencia" }),
    );
    expect(adopt).toHaveBeenCalledTimes(1);
    // Continuar ADOPTA la sesión abierta. Si esto enviara un START, el
    // servidor cerraría el recorrido abierto para abrir otro — y en un pin
    // retirado lo rechazaría. Ninguna de las dos cosas es «continuar».
    expect(start).not.toHaveBeenCalled();
  });

  it("control negativo — con el inicio autorizado, empezar de nuevo funciona", async () => {
    mount(true, "recoverable");

    const deNuevo = screen.getByRole("button", { name: "Empezar de nuevo" });
    expect(deNuevo).toBeEnabled();
    await userEvent.click(deNuevo);
    expect(start).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/ya no admite empezar de nuevo/i),
    ).not.toBeInTheDocument();
  });
});

describe("ExperiencePlayer — un recorrido terminado en un pin retirado", () => {
  it("no repite, y lo que se completó sigue en pantalla", async () => {
    mount(false, "completed");

    const repetir = screen.getByRole("button", { name: "Repetir experiencia" });
    expect(repetir).toBeDisabled();
    await userEvent.click(repetir);
    expect(start).not.toHaveBeenCalled();

    expect(
      screen.getByText(/ya no admite recorridos nuevos/i),
    ).toBeInTheDocument();
    // El resumen no se va. Antes, el 410 blanqueaba la sesión y la pantalla
    // volvía a la portada: el lector perdía de vista su propio recorrido.
    expect(
      screen.getByRole("button", { name: "Volver al capítulo" }),
    ).toBeInTheDocument();
  });

  it("el botón se queda, deshabilitado, en lugar de desaparecer", () => {
    // Quien termina un recorrido y vuelve buscando «Repetir» merece
    // enterarse de por qué no puede, no encontrarse con que la pregunta ya
    // no existe. Y el aviso está asociado al control, no suelto.
    mount(false, "completed");

    const repetir = screen.getByRole("button", { name: "Repetir experiencia" });
    const nota = screen.getByText(/ya no admite recorridos nuevos/i);
    expect(repetir).toHaveAttribute("aria-describedby", nota.id);
  });

  it("control negativo — con el inicio autorizado, repetir funciona", async () => {
    mount(true, "completed");

    const repetir = screen.getByRole("button", { name: "Repetir experiencia" });
    expect(repetir).toBeEnabled();
    await userEvent.click(repetir);
    expect(start).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/ya no admite recorridos nuevos/i),
    ).not.toBeInTheDocument();
  });
});

describe("ExperiencePlayer — una API que nunca supo responder", () => {
  it("un campo ausente no autoriza ningún inicio nuevo", async () => {
    // `startable` es opcional en el contrato. Leer su ausencia como un sí
    // sería dejar que una API vieja autorizara en nombre de un servidor que
    // no fue preguntado. Se lee como «no se pudo preguntar».
    mount(undefined, "recoverable");
    expect(
      screen.getByRole("button", { name: "Empezar de nuevo" }),
    ).toBeDisabled();

    cleanup();
    mount(undefined, "completed");
    expect(
      screen.getByRole("button", { name: "Repetir experiencia" }),
    ).toBeDisabled();

    expect(start).not.toHaveBeenCalled();
  });
});
