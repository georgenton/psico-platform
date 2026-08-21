import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type {
  ChapterExperiencePublicView,
  GuideSessionView,
} from "@psico/types";
import { ExperienceList, type ExperienceStatesLoad } from "./ExperienceList";
import { CompletionSummary } from "./CompletionSummary";
import type { GuideRunFacts } from "../guide/use-guide-run";

/**
 * GR-7 — the two new surfaces write nothing by being looked at.
 *
 * Chapter Home and the Completion Summary are where an "engagement" instinct
 * would put a silent write: log a mood because the reader finished something,
 * nudge the emotional map because a journey closed, save a resonance because
 * the offer was on screen. Each would move the reader's own record without
 * them asking.
 *
 * `/guide/sessions` is watched for a different reason. A card that started a
 * run on render would autocancel whatever else the reader had open — the
 * server's START closes the previous session by design. So rendering a list of
 * journeys must issue no START at all.
 *
 * The twelve-scene firewall already ran in C; this is only the two surfaces
 * that did not exist then.
 */

const WATCHED = [
  "/mood",
  "/emotional-map",
  "/resonances",
  "/guide/sessions",
] as const;

let fetchSpy: ReturnType<typeof vi.fn>;

function writes(fragment: string): number {
  return fetchSpy.mock.calls.filter((call) => {
    const url = String(call[0]);
    const method = String(
      (call[1] as RequestInit | undefined)?.method ?? "GET",
    ).toUpperCase();
    return url.includes(fragment) && method !== "GET";
  }).length;
}

const EXPERIENCES: ChapterExperiencePublicView[] = [
  {
    experienceKey: "exp-1",
    experienceVersion: 1,
    title: "Primera",
    summary: "Un recorrido corto.",
    estimatedMinutes: 12,
    guidePin: { guideKey: "guide-1", guideVersion: 1 },
    scenes: [],
  },
  {
    experienceKey: "exp-2",
    experienceVersion: 1,
    title: "Segunda",
    guidePin: { guideKey: "guide-2", guideVersion: 1 },
    scenes: [],
  },
];

const SESSION: GuideSessionView = {
  sessionId: "ses_1",
  guideKey: "guide-1",
  guideVersion: 1,
  status: "COMPLETED",
  stepsCompleted: 2,
  totalSteps: 2,
  currentStepKey: null,
};

/** C.1 — the server's verdict per card, the shape the list now consumes. */
const STATES: ExperienceStatesLoad = {
  status: "ready",
  requestKey: "k",
  generation: 1,
  states: new Map([
    [
      "guide-1@1",
      {
        guidePin: { guideKey: "guide-1", guideVersion: 1 },
        status: "COMPLETED" as const,
        resumePin: { guideKey: "guide-1", guideVersion: 1 },
        // C.3R — the server says this guide belongs to the unit on screen.
        applicability: "APPLIES" as const,
        evaluatedPin: { guideKey: "guide-1", guideVersion: 1 },
      },
    ],
  ]),
};

const FACTS: GuideRunFacts = {
  confirmedStepKeys: ["explorar"],
  recalls: [{ stepKey: "recordar", outcome: "CORRECT" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  fetchSpy = vi.fn(() =>
    Promise.resolve(new Response("{}", { status: 200 })),
  ) as unknown as ReturnType<typeof vi.fn>;
  vi.stubGlobal("fetch", fetchSpy);
});

describe("firewall · Chapter Home and Completion Summary", () => {
  it("listing journeys writes nothing and starts nothing", () => {
    render(
      <ExperienceList
        experiences={EXPERIENCES}
        load={STATES}
        canRun={() => true}
        onOpen={() => {}}
      />,
    );

    // The cards ARE on screen — otherwise this would pass against a blank
    // render, which is the failure mode a firewall must not have.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    for (const surface of WATCHED) {
      expect(writes(surface)).toBe(0);
    }
  });

  it("showing a finished journey writes nothing", () => {
    render(
      <CompletionSummary
        experience={EXPERIENCES[0]!}
        session={SESSION}
        facts={FACTS}
        resonanceConfirmed
      />,
    );

    expect(
      screen.getByTestId("experience-completion-summary"),
    ).toBeInTheDocument();
    // Even with a resonance already confirmed in the run, REPORTING it is not
    // saving it again.
    for (const surface of WATCHED) {
      expect(writes(surface)).toBe(0);
    }
  });

  it("reopening a completed journey creates no second completion", () => {
    // The Summary is what a completed experience opens to. Rendering it must
    // not re-send the completion command, or the ledger would gain an event
    // for a run that ended once.
    const { rerender } = render(
      <CompletionSummary
        experience={EXPERIENCES[0]!}
        session={SESSION}
        facts={FACTS}
        resonanceConfirmed={false}
      />,
    );
    rerender(
      <CompletionSummary
        experience={EXPERIENCES[0]!}
        session={SESSION}
        facts={FACTS}
        resonanceConfirmed={false}
      />,
    );

    expect(writes("/guide/sessions")).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
