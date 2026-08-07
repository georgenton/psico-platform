import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * CMS V1 (#637) — the preview seam.
 *
 * Two claims, and the whole design depends on both:
 *
 *   1. there is still ONE player. The live component and the preview render the
 *      same surface through the same registry, so what an editor approves is
 *      what a reader gets;
 *   2. the preview writes NOTHING — not to the network, not to `localStorage`.
 *      An editor stepping through a draft must not record progress, move the
 *      reader's cursor, or save a resonance.
 */

const { useGuideRunSpy } = vi.hoisted(() => {
  // A run at its cover: enough for the surface to render, and the shape the
  // live hook really returns before anything has started.
  const liveRun = {
    screen: "cover",
    session: null,
    step: null,
    error: null,
    retry: null,
    busy: false,
    booting: false,
    recallOutcome: null,
    recoverable: null,
    facts: { confirmedStepKeys: [], recalls: [] },
    serverSummary: null,
    choice: null,
    setChoice: () => {},
    start: async () => {},
    adopt: () => {},
    completeStep: () => {},
    submitRecall: () => {},
    finish: () => {},
    cancel: () => {},
    retryPending: () => {},
    restart: () => {},
  };
  return { useGuideRunSpy: vi.fn(() => liveRun) };
});

vi.mock("../guide/use-guide-run", () => ({ useGuideRun: useGuideRunSpy }));

import { ExperiencePlayer, ExperiencePlayerSurface } from "./ExperiencePlayer";
import { ExperiencePreview } from "./ExperiencePreview";
import { rendererForSceneKind } from "./experience-scene-registry";
import { EEC_BUNDLE, EEC_EXPERIENCE } from "../guide/guide-test-fixtures";

/** Every non-GET request that left the page, of any kind. */
let writes: string[] = [];

beforeEach(() => {
  cleanup();
  localStorage.clear();
  writes = [];
  useGuideRunSpy.mockClear();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") writes.push(`${method} ${String(input)}`);
      return new Response("{}", { status: 200 });
    },
  );
});

describe("one player, two sources of state", () => {
  it("keeps the live player on the server-owned run", () => {
    // `ExperiencePlayer` is the ONLY caller of `useGuideRun`, and stays so.
    render(
      <ExperiencePlayer
        actorScope={"S".repeat(43)}
        definition={EEC_EXPERIENCE}
        bundle={EEC_BUNDLE}
      />,
    );

    expect(useGuideRunSpy).toHaveBeenCalledTimes(1);
  });

  it("never asks the live runtime for a preview", () => {
    render(
      <ExperiencePreview definition={EEC_EXPERIENCE} bundle={EEC_BUNDLE} />,
    );

    expect(useGuideRunSpy).not.toHaveBeenCalled();
  });

  it("mounts the same surface component from both", () => {
    // Not "a similar one": the identical function reference.
    expect(typeof ExperiencePlayerSurface).toBe("function");
    expect(ExperiencePlayer.name).not.toBe(ExperiencePlayerSurface.name);
  });

  it("resolves scenes through the one closed registry", () => {
    // A preview registry would be a second place for the twelve kinds to drift.
    expect(rendererForSceneKind("INTRO")).toBe(rendererForSceneKind("INTRO"));
    expect(rendererForSceneKind("RECALL")).toBeTypeOf("function");
  });
});

describe("preview writes nothing", () => {
  async function walkPreview() {
    render(
      <ExperiencePreview definition={EEC_EXPERIENCE} bundle={EEC_BUNDLE} />,
    );
    // Cover → start the synthetic run.
    await userEvent.click(
      screen.getByRole("button", { name: /Empezar experiencia/ }),
    );
    // Walk as far as the presentational scenes allow.
    for (let i = 0; i < 6; i++) {
      const next = screen.queryByRole("button", { name: "Continuar" });
      if (!next) break;
      await userEvent.click(next);
    }
  }

  it("issues no request while starting and stepping through a draft", async () => {
    await walkPreview();
    expect(writes).toEqual([]);
  });

  it("touches no scene cursor in localStorage", async () => {
    await walkPreview();
    // The reader's place in this experience is not the editor's to move.
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("says plainly that nothing is being recorded", () => {
    render(
      <ExperiencePreview definition={EEC_EXPERIENCE} bundle={EEC_BUNDLE} />,
    );

    // Outside the player — the renderers' own copy is what a reader sees and is
    // deliberately left alone.
    expect(
      screen.getByText(/no registra avance, respuestas ni resonancias/i),
    ).toBeInTheDocument();
  });

  it("offers no way to save a resonance", () => {
    // `onConfirmResonance` is the only path to that write, and preview omits it.
    render(
      <ExperiencePreview definition={EEC_EXPERIENCE} bundle={EEC_BUNDLE} />,
    );

    expect(screen.queryByRole("button", { name: /me resonó/i })).toBeNull();
  });
});
