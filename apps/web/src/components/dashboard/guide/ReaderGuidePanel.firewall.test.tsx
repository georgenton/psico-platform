import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuideSessionView } from "@psico/types";
import { ReaderGuidePanel } from "./ReaderGuidePanel";
import { guideStorageKey } from "./guide-recovery";
import type { GuideAnchorResolution } from "./guide-anchor";
import type * as ApiClientModule from "@psico/api-client";

/**
 * GR-6 — the firewall, exercised rather than grepped.
 *
 * `guide-demo-firewall.spec.ts` reads the source and proves no wellbeing write
 * is *written* anywhere in the player. This file proves the stronger, runtime
 * claim: a reader who walks the whole experience — every panel, every button —
 * produces ZERO requests to `/mood`, `/emotional-map` and `/resonances`.
 *
 * The two together matter because a static scan can only see calls it
 * recognises. A request assembled from a variable would slip past it; it would
 * not slip past a counter watching `fetch`.
 *
 * The last case is the positive control, and it is the reason this file is not
 * simply asserting "nothing ever happens": the same walk, with ONE deliberate
 * tap on "Sí, me resonó", produces exactly one POST to `/resonances`. Without
 * it, a player that had quietly lost the ability to save a resonance at all
 * would pass every other assertion here.
 */

const start = vi.fn();

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      createGuideSession: (...a: unknown[]) => start(...a),
      completeGuideSessionStep: vi.fn(),
      submitGuideStepRecall: vi.fn(),
      cancelGuideSession: vi.fn(),
      completeGuideSession: vi.fn(),
    },
    experienceApi: {
      listPublishedForChapter: (input: {
        bookSlug: string;
        chapterOrder: number;
      }) => Promise.resolve(experiencesForChapter(input)),
    },
  };
});

import {
  PQP_BUNDLE,
  PQP_PIN,
  experiencesForChapter,
} from "./guide-test-fixtures";

const SCOPE = "f".repeat(43);
const START_KEY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const API = "https://api.test/api";

const ANCHOR: GuideAnchorResolution = {
  status: "RESOLVED",
  blockKey: "k-1",
  blockVersionId: "v-1",
  renderBlockId: "b-1",
};

/** Every checkpoint accepted: the close scenes, including the offer. */
const FINISHED: GuideSessionView = {
  sessionId: "ses_pqp",
  guideKey: PQP_PIN.guideKey,
  guideVersion: PQP_PIN.guideVersion,
  status: "ACTIVE",
  stepsCompleted: 3,
  totalSteps: 3,
  currentStepKey: null,
};

/** The three surfaces the guide may never write to on its own. */
const WELLBEING = ["/mood", "/emotional-map", "/resonances"] as const;

function writesTo(
  fetchSpy: ReturnType<typeof vi.fn>,
  fragment: string,
): number {
  return fetchSpy.mock.calls.filter((call) => {
    const url = String(call[0]);
    const method = String(
      (call[1] as RequestInit | undefined)?.method ?? "GET",
    ).toUpperCase();
    // Only writes count. Reading a list of resonances is not writing one.
    return url.includes(fragment) && method !== "GET";
  }).length;
}

let fetchSpy: ReturnType<typeof vi.fn>;

function panel() {
  return (
    <ReaderGuidePanel
      actorScope={SCOPE}
      bundle={PQP_BUNDLE}
      anchor={ANCHOR}
      concept={{ key: "pqp-c1-contacto-sostenido", label: "Contacto" }}
      bookSlug="parejas-que-perduran"
      chapterOrder={2}
      apiBase={API}
      token="tok"
      onClose={vi.fn()}
      onGoToPassage={vi.fn()}
      onContinueReading={vi.fn()}
      onOpenExplicitCheckin={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  window.localStorage.clear();
  window.localStorage.setItem(
    guideStorageKey(PQP_PIN) as string,
    JSON.stringify({
      schemaVersion: 1,
      actorScope: SCOPE,
      guideKey: PQP_PIN.guideKey,
      guideVersion: PQP_PIN.guideVersion,
      startIdempotencyKey: START_KEY,
    }),
  );
  start.mockResolvedValue({ session: FINISHED });
  fetchSpy = vi.fn(() =>
    Promise.resolve(new Response("{}", { status: 200 })),
  ) as unknown as ReturnType<typeof vi.fn>;
  vi.stubGlobal("fetch", fetchSpy);
});

describe("firewall · walking the experience writes nothing on the reader's behalf", () => {
  it("reaching the end of the run touches no wellbeing surface", async () => {
    render(panel());
    // The close of the run — the summary, then the offer.
    expect(await screen.findByTestId("scene-summary")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByTestId("scene-resonance")).toBeInTheDocument();

    // Arriving at the offer is not accepting it.
    for (const surface of WELLBEING) {
      expect(writesTo(fetchSpy, surface)).toBe(0);
    }
  });

  it("dismissing the offer writes nothing — an absent yes is not a no to record", async () => {
    render(panel());
    await userEvent.click(
      await screen.findByRole("button", { name: "Continuar" }),
    );
    await screen.findByTestId("scene-resonance");

    // Every button on the offer EXCEPT the acceptance.
    const buttons = screen
      .getAllByRole("button")
      .filter((b) => !/me resonó/i.test(b.textContent ?? ""));
    for (const button of buttons) {
      await userEvent.click(button);
    }

    for (const surface of WELLBEING) {
      expect(writesTo(fetchSpy, surface)).toBe(0);
    }
  });

  it("POSITIVE CONTROL — one deliberate tap saves exactly one resonance", async () => {
    render(panel());
    await userEvent.click(
      await screen.findByRole("button", { name: "Continuar" }),
    );
    await screen.findByTestId("scene-resonance");

    await userEvent.click(screen.getByRole("button", { name: /me resonó/i }));

    expect(writesTo(fetchSpy, "/resonances")).toBe(1);
    // …and still nothing anywhere else. Saving a resonance is not a mood, and
    // it is not a map entry.
    expect(writesTo(fetchSpy, "/mood")).toBe(0);
    expect(writesTo(fetchSpy, "/emotional-map")).toBe(0);
  });
});
