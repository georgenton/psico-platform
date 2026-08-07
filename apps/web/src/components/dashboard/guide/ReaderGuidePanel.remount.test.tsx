import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
 *
 * GR-6 — the panel now mounts `ExperiencePlayer`, so the surface these cases
 * read changed: the progress bar is a `progressbar` role and each panel is a
 * `scene-*` testid. The properties did NOT change, which is why the cases are
 * the same cases: the old run must not survive a pin change, and a fresh mount
 * on an empty slot must not fabricate a START.
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
    // GR-6 — the Player's definition is server-owned. The panel asks for it
    // instead of importing a catalog, so a test that renders the panel has to
    // answer that read; the fixture is the same shape the route returns.
    experienceApi: {
      listPublishedForChapter: (input: {
        bookSlug: string;
        chapterOrder: number;
      }) => Promise.resolve(experiencesForChapter(input)),
    },
  };
});

import {
  EEC_EXPERIENCE,
  PQP_EXPERIENCE,
  experiencesForChapter,
} from "./guide-test-fixtures";

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

/**
 * Where each bundle is actually read. A pin change IS a chapter change: the
 * reader walked from one book's chapter into another's, so the panel gets the
 * new chapter context too — and GR-6 makes that context the key discovery
 * resolves the journey by.
 */
const CHAPTER: Record<string, { bookSlug: string; chapterOrder: number }> = {
  [EEC_PIN.guideKey]: {
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
  },
  [PQP_PIN.guideKey]: { bookSlug: "parejas-que-perduran", chapterOrder: 2 },
};

/** The panel under the contract: keyed by its pin. */
function Panel({ bundle, keyed }: { bundle: GuideWebBundle; keyed: boolean }) {
  const chapter = CHAPTER[bundle.pin.guideKey];
  const panel = (
    <ReaderGuidePanel
      actorScope={SCOPE}
      bundle={bundle}
      anchor={ANCHOR}
      concept={CONCEPT}
      bookSlug={chapter.bookSlug}
      chapterOrder={chapter.chapterOrder}
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
    //
    // Both preconditions are AWAITED. The progress bar appears as soon as the
    // session lands, but the practice scene is set by an effect that runs
    // after it, so a synchronous `getByRole` here raced with that effect.
    expect(await screen.findByRole("progressbar")).toHaveAttribute(
      "aria-label",
      "1 de 3 pasos registrados",
    );
    // The run reopened INSIDE the pending checkpoint's window — right after
    // the last step the server confirms, not back at the beginning. This
    // browser had no scene of its own, so that placement is entirely the
    // server's checkpoint talking.
    expect(await screen.findByTestId("scene-example")).toBeInTheDocument();
    expect(screen.queryByTestId("scene-intro")).toBeNull();

    // …now the reader moves to a chapter with a different guide.
    view.rerender(<Panel bundle={PQP_BUNDLE} keyed />);

    // OLD_SESSION_NOT_RENDERED / OLD_SCENE_NOT_RENDERED
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.queryByTestId("scene-example")).toBeNull();
    expect(
      screen.queryByText(EEC_EXPERIENCE.title, { exact: false }),
    ).not.toBeInTheDocument();

    // PQP_PANEL_STARTS_FRESH — its own slot is empty, so it lands on its
    // cover, and the cover is the SERVER's title for that experience.
    expect(
      await screen.findByRole("heading", { name: PQP_EXPERIENCE.title }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Empezar experiencia" }),
    ).toBeInTheDocument();
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

    const recall = await screen.findByTestId("scene-recall");
    await userEvent.click(
      within(recall).getByRole("radio", { name: /El cuerpo primero/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );
    expect(
      await screen.findByTestId("scene-recall-feedback"),
    ).toBeInTheDocument();

    view.rerender(<Panel bundle={PQP_BUNDLE} keyed />);

    // OLD_RECALL_OUTCOME_NOT_RENDERED — the verdict was the previous guide's.
    // Nothing about it may survive into a chapter it was never about.
    await waitFor(() =>
      expect(screen.queryByTestId("scene-recall-feedback")).toBeNull(),
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
    await screen.findByRole("progressbar");
    // Wait for the scene too, so the mount has fully settled before we
    // snapshot the call count.
    await screen.findByTestId("scene-example");

    const callsBefore = start.mock.calls.length;
    view.rerender(<Panel bundle={PQP_BUNDLE} keyed />);
    await screen.findByRole("heading", { name: PQP_EXPERIENCE.title });

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
    await screen.findByRole("progressbar");
    await screen.findByTestId("scene-example");

    view.rerender(<Panel bundle={PQP_BUNDLE} keyed={false} />);

    // The Emociones session is still on screen under the Parejas bundle.
    expect(await screen.findByRole("progressbar")).toHaveAttribute(
      "aria-label",
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
