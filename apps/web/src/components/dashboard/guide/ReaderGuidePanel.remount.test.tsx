import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuideSessionView } from "@psico/types";
import { ReaderGuidePanel } from "./ReaderGuidePanel";
import { guideComponentKey } from "./guide-pin";
import { guideStorageKey } from "./guide-recovery";
import type { GuideAnchorResolution } from "./guide-anchor";
import type { GuideWebBundle } from "./guide-web-bundle";
import {
  EEC_BUNDLE,
  EEC_PIN,
  PQP_BUNDLE,
  PQP_PIN,
} from "./guide-test-fixtures";
import type * as ApiClientModule from "@psico/api-client";

/**
 * GR-4 — `PIN_CHANGE_REQUIRES_COMPONENT_REMOUNT=true`.
 *
 * A run holds state that is only meaningful for ONE pin: the server session,
 * the local scene, the recall verdict, the practice timer. Handing the same
 * component a different bundle keeps all of it and reinterprets it under the
 * new guide — the reader would see the previous run's progress and verdict
 * while the panel narrated a different chapter.
 *
 * The `key` is what prevents that, and the last test here proves it is
 * load-bearing rather than decorative: the same rerender WITHOUT it leaves the
 * old session on screen.
 */

const start = vi.fn();
const submitRecallApi = vi.fn();

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      createGuideSession: (...a: unknown[]) => start(...a),
      completeGuideSessionStep: vi.fn(),
      submitGuideStepRecall: (...a: unknown[]) => submitRecallApi(...a),
      cancelGuideSession: vi.fn(),
      completeGuideSession: vi.fn(),
    },
  };
});

const SCOPE = "r".repeat(43);
const START_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ANCHOR: GuideAnchorResolution = {
  status: "RESOLVED",
  blockKey: "k-1",
  blockVersionId: "v-1",
  renderBlockId: "b-1",
};

const CONCEPT = { key: "concepto", label: "Concepto" };

function eecSession(currentStepKey: string, stepsCompleted: number) {
  return {
    sessionId: "ses_eec",
    guideKey: EEC_PIN.guideKey,
    guideVersion: EEC_PIN.guideVersion,
    status: "ACTIVE",
    stepsCompleted,
    totalSteps: 3,
    currentStepKey,
  } satisfies GuideSessionView;
}

/** The panel under the contract: keyed by its pin. */
function Panel({ bundle, keyed }: { bundle: GuideWebBundle; keyed: boolean }) {
  const panel = (
    <ReaderGuidePanel
      actorScope={SCOPE}
      bundle={bundle}
      anchor={ANCHOR}
      concept={CONCEPT}
      bookSlug="un-libro"
      chapterOrder={1}
      apiBase="https://api.test/api"
      token="tok"
      onClose={vi.fn()}
      onGoToPassage={vi.fn()}
      onContinueReading={vi.fn()}
      onOpenExplicitCheckin={vi.fn()}
    />
  );
  // `key` on a fragment is the same remount signal React uses on any element.
  return keyed ? (
    <React.Fragment key={guideComponentKey(bundle.pin)}>{panel}</React.Fragment>
  ) : (
    panel
  );
}

function seedEecRecovery() {
  window.localStorage.setItem(
    guideStorageKey(EEC_PIN) as string,
    JSON.stringify({
      schemaVersion: 1,
      actorScope: SCOPE,
      guideKey: EEC_PIN.guideKey,
      guideVersion: EEC_PIN.guideVersion,
      startIdempotencyKey: START_KEY,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  window.localStorage.clear();
  seedEecRecovery();
});

describe("ReaderGuidePanel · pin change forces a remount", () => {
  it("drops the old session, scene and timer", async () => {
    // EEC resumed mid-run, on the practice checkpoint.
    start.mockResolvedValue({
      session: eecSession("practicar-escucharte-por-dentro", 1),
    });
    const view = render(<Panel bundle={EEC_BUNDLE} keyed />);

    // The old run is genuinely on screen first — otherwise the assertions
    // below would pass against a panel that never rendered anything.
    expect(await screen.findByTestId("rgp-progress")).toHaveTextContent(
      "1 de 3 pasos registrados",
    );
    expect(
      screen.getByRole("button", { name: "Usar 45 segundos" }),
    ).toBeInTheDocument();

    // …now the reader moves to a chapter with a different guide.
    view.rerender(<Panel bundle={PQP_BUNDLE} keyed />);

    // OLD_SESSION_NOT_RENDERED / OLD_SCENE_NOT_RENDERED / OLD_TIMER_NOT_RENDERED
    await waitFor(() =>
      expect(screen.queryByTestId("rgp-progress")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Usar 45 segundos" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Escucharte por dentro")).not.toBeInTheDocument();

    // PQP_PANEL_STARTS_FRESH — its own slot is empty, so it lands on its cover.
    expect(
      await screen.findByText("El contacto sostenido en silencio"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empezar" })).toBeInTheDocument();
  });

  it("drops the old recall verdict", async () => {
    start.mockResolvedValue({
      session: eecSession("recordar-cuerpo-antes-que-mente", 2),
    });
    submitRecallApi.mockResolvedValue({
      session: { ...eecSession("recordar-cuerpo-antes-que-mente", 2) },
      feedback: { outcome: "CORRECT" },
    });
    const view = render(<Panel bundle={EEC_BUNDLE} keyed />);

    await userEvent.click(
      await screen.findByRole("radio", { name: /El cuerpo puede reaccionar/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );
    expect(await screen.findByTestId("rgp-feedback")).toBeInTheDocument();

    view.rerender(<Panel bundle={PQP_BUNDLE} keyed />);

    // OLD_RECALL_OUTCOME_NOT_RENDERED
    await waitFor(() =>
      expect(screen.queryByTestId("rgp-feedback")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Eso es lo que dice el capítulo"),
    ).not.toBeInTheDocument();
  });

  it("does not replay the old guide's recovery under the new pin", async () => {
    start.mockResolvedValue({
      session: eecSession("practicar-escucharte-por-dentro", 1),
    });
    const view = render(<Panel bundle={EEC_BUNDLE} keyed />);
    await screen.findByTestId("rgp-progress");

    const callsBefore = start.mock.calls.length;
    view.rerender(<Panel bundle={PQP_BUNDLE} keyed />);
    await screen.findByText("El contacto sostenido en silencio");

    // OLD_RECOVERY_NOT_REPLAYED — the PQP slot is empty, so the fresh mount
    // has no START key to replay and issues no request at all. The EEC record
    // is untouched; it simply is not this pin's.
    expect(start.mock.calls.length).toBe(callsBefore);
    expect(
      window.localStorage.getItem(guideStorageKey(EEC_PIN) as string),
    ).not.toBeNull();
  });

  it("WITHOUT the key the old session survives — the key is what fixes it", async () => {
    // The contrast case. This is not a wish about React; it is what actually
    // happens, and it is the reason the mount point must carry the key.
    start.mockResolvedValue({
      session: eecSession("practicar-escucharte-por-dentro", 1),
    });
    const view = render(<Panel bundle={EEC_BUNDLE} keyed={false} />);
    await screen.findByTestId("rgp-progress");

    view.rerender(<Panel bundle={PQP_BUNDLE} keyed={false} />);

    // The Emociones session is still on screen under the Parejas bundle.
    expect(await screen.findByTestId("rgp-progress")).toHaveTextContent(
      "1 de 3 pasos registrados",
    );
  });

  it("keeps the component key stable while the pin does not change", () => {
    expect(guideComponentKey(EEC_PIN)).toBe("eec-c1-cuerpo-antes-que-mente@1");
    expect(guideComponentKey(PQP_PIN)).toBe("pqp-c1-contacto-sostenido@1");
    expect(guideComponentKey(EEC_PIN)).not.toBe(guideComponentKey(PQP_PIN));
    // A version bump is a different mount too.
    expect(guideComponentKey({ ...EEC_PIN, guideVersion: 2 })).not.toBe(
      guideComponentKey(EEC_PIN),
    );
    // A malformed pin gets its own stable key, never the previous guide's.
    expect(guideComponentKey({ guideKey: "", guideVersion: 1 })).toBe(
      "guide-unpinned",
    );
  });
});
