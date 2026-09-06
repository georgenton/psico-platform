import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  ContentUnitRead,
  GuideExperienceCardState,
  LectorChapterResponse,
} from "@psico/types";
import { guideAnchorRegistry } from "@psico/types";
import { LectorShell } from "./LectorShell";
import { GuideAvailabilityProvider } from "../guide/guide-availability";
import { GuideActorScopeProvider } from "../guide/guide-actor-scope";
import type * as ApiClientModule from "@psico/api-client";

/**
 * The bug: opening one guided reading hid the other four.
 *
 * Chapter Home listed the chapter's five, but choosing one replaced the whole
 * surface with a single player. Finishing it left the reader with no way back
 * to the rest except closing the panel and starting again from Chapter Home —
 * and the route they came from was gone while they were inside it.
 *
 * This is a COMPOSITION test on purpose. `GuidedRouteList` and
 * `GuidedRouteNavigator` are fine in isolation; the defect lived in
 * `LectorShell` + `ReaderGuidePanel` + the route state passing between them,
 * so the real panel and the real navigator are mounted here. Only the player
 * is stubbed, and only so a completion can be provoked without walking three
 * server-backed steps.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("./AudioBar", () => ({ AudioBar: () => null }));

/**
 * The player, reduced to what this test needs: which pin it is running, and a
 * way to say «the server confirmed COMPLETED».
 */
vi.mock("../experience/ExperiencePlayer", () => ({
  ExperiencePlayer: (props: {
    bundle: { pin: { guideKey: string; guideVersion: number } };
    onCompleted?: () => void;
    onPickAnotherExperience?: () => void;
  }) => (
    <div data-testid="player">
      <span data-testid="player-pin">{props.bundle.pin.guideKey}</span>
      <button type="button" onClick={() => props.onCompleted?.()}>
        Simular COMPLETED
      </button>
      {props.onPickAnotherExperience ? (
        <button type="button" onClick={props.onPickAnotherExperience}>
          Ver otra experiencia
        </button>
      ) : null}
    </div>
  ),
}));

/**
 * The panel's own definition fetch is not what is under test.
 *
 * The result object is HOISTED and frozen: returning a fresh literal per call
 * gives every render a new `definition` reference, which is enough to keep
 * downstream effects re-running forever.
 */
vi.mock("../experience/use-chapter-experience", () => {
  const RESULT = Object.freeze({
    status: "ready" as const,
    definition: Object.freeze({
      experienceKey: "x",
      experienceVersion: 1,
      scenes: [],
    }),
    items: Object.freeze([]),
  });
  return { useChapterExperience: () => RESULT };
});

const getGuideDiscovery = vi.fn();
const getExperienceCardStates = vi.fn();
const getGuideRoute = vi.fn();
const listPublishedForChapter = vi.fn();

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      ...actual.guideApi,
      getGuideDiscovery: (...a: unknown[]) => getGuideDiscovery(...a),
      getExperienceCardStates: (...a: unknown[]) =>
        getExperienceCardStates(...a),
      getGuideRoute: (...a: unknown[]) => getGuideRoute(...a),
    },
    experienceApi: {
      listPublishedForChapter: (...a: unknown[]) =>
        listPublishedForChapter(...a),
    },
  };
});

/** EEC-C03's five, as production offers them. */
const KEYS = [
  "eec-c3-predecir-no-es-adivinar",
  "eec-c3-senal-corporal-sin-etiqueta",
  "eec-c3-contexto-para-categorizar",
  "eec-c3-no-hay-boton-de-miedo",
  "eec-c3-modelo-puede-actualizarse",
] as const;

const PINS = KEYS.map((guideKey) => ({ guideKey, guideVersion: 1 }));
const TITLES = KEYS.map((k, i) => `Lectura ${i + 1} · ${k}`);

const routeResponse = {
  available: true,
  guides: PINS.map((pin, i) => ({
    ...pin,
    order: i + 1,
    title: TITLES[i],
    description: `Descripción de ${TITLES[i]}`,
    estimatedMinutes: "8–10",
  })),
};

type Status = GuideExperienceCardState["status"];

const cards = (statuses: readonly Status[]) => ({
  items: PINS.map((pin, i) => ({
    guidePin: pin,
    status: statuses[i],
    resumePin: pin,
    applicability: "APPLIES",
    evaluatedPin: pin,
  })) as GuideExperienceCardState[],
});

/**
 * Blocks built from the REAL anchor registry, so each of the five resolves for
 * the same reason it resolves in production: its own heading, followed by its
 * own approved passage.
 */
function unitWithFiveAnchors(): ContentUnitRead {
  const blocks = PINS.flatMap((pin, i) => {
    const a = guideAnchorRegistry.getExact(pin);
    if (!a) throw new Error(`NO_ANCHOR:${pin.guideKey}`);
    return [
      {
        blockKey: `bk-h-${i}`,
        legacyBlockId: `b-h-${i}`,
        blockVersionId: `bv-h-${i}`,
        kind: "HEADING" as const,
        order: i * 2 + 1,
        content: a.sourceHeading,
        meta: null,
      },
      {
        blockKey: `bk-p-${i}`,
        legacyBlockId: `b-p-${i}`,
        blockVersionId: `bv-p-${i}`,
        kind: "PARAGRAPH" as const,
        order: i * 2 + 2,
        content: `Un preámbulo. ${a.passageLastSentence}`,
        meta: null,
      },
    ];
  });
  return {
    editionKey: "emociones-en-construccion-1e",
    revisionNumber: 19,
    unitKey: "unit-3",
    title: "Capítulo tres",
    summary: null,
    order: 3,
    partNumber: null,
    partTitle: null,
    source: "content-core",
    blocks,
  } as unknown as ContentUnitRead;
}

const initial = {
  book: {
    id: "b",
    slug: "emociones-en-construccion",
    title: "EEC",
    totalChapters: 10,
  },
  chapter: {
    id: "ch-3",
    order: 3,
    title: "Un capítulo",
    description: null,
    durationMinutes: 10,
    audioAvailable: false,
  },
  blocks: [],
  lessons: [],
  preferences: {
    font: "serif",
    fontSize: 18,
    theme: "system",
    lineHeight: 1.6,
  },
  highlights: [],
  annotations: [],
  session: {
    lastBlockId: null,
    progressPct: 0,
    timeSpentSec: 0,
    completedAt: null,
  },
} as unknown as LectorChapterResponse;

beforeEach(() => {
  vi.clearAllMocks();
  class FakeIO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    FakeIO as unknown as typeof IntersectionObserver;
  Range.prototype.getBoundingClientRect = () => ({}) as DOMRect;
  Element.prototype.scrollIntoView = vi.fn();

  getGuideDiscovery.mockResolvedValue({ available: true, ...PINS[0] });
  getGuideRoute.mockResolvedValue(routeResponse);
  listPublishedForChapter.mockResolvedValue({ items: [] });
  getExperienceCardStates.mockResolvedValue(
    cards(["START", "START", "START", "START", "START"]),
  );
});

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
});

function renderReader() {
  return render(
    <GuideAvailabilityProvider available>
      <GuideActorScopeProvider scope={"A".repeat(43)}>
        <LectorShell
          apiBase="https://api.example/api"
          token="tok"
          bookSlug="emociones-en-construccion"
          initial={initial}
          unit={unitWithFiveAnchors()}
          marks={null}
        />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>,
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Open one reading from Chapter Home's route list. */
async function openFromHome(index: number) {
  fireEvent.click(await screen.findByTestId("reader-open-chapter-home"));
  const cardsEls = await screen.findAllByTestId("route-card");
  const button = cardsEls[index].querySelector("button");
  if (!button) throw new Error("route card has no control");
  fireEvent.click(button);
  await settle();
}

/** The compact navigator's rows, in order. */
const navRows = () => screen.getAllByTestId("rgp-route-item");
const navText = () => navRows().map((li) => li.textContent ?? "");

describe("the chapter's route stays inside the reader", () => {
  it("shows all five readings while one is playing, and marks the active one", async () => {
    renderReader();
    await settle();
    await openFromHome(0);

    expect(screen.getByTestId("reader-guide-panel")).toBeInTheDocument();
    expect(screen.getByTestId("player-pin")).toHaveTextContent(KEYS[0]);

    // The whole repair: the other four are still reachable from in here.
    expect(navRows()).toHaveLength(5);

    // Which one is on screen is announced, not merely coloured.
    const current = navRows()
      .map((li) => li.querySelector("button"))
      .filter((b) => b?.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain(TITLES[0]);
  });

  it("keeps the five after one is completed, and updates only that one", async () => {
    renderReader();
    await settle();
    await openFromHome(0);

    expect(navText()[0]).toContain("Sin empezar");

    // The server now says the first is done. The player reports the
    // transition; the shell re-asks for every pin.
    getExperienceCardStates.mockResolvedValue(
      cards(["COMPLETED", "START", "START", "START", "START"]),
    );
    fireEvent.click(screen.getByText("Simular COMPLETED"));
    await settle();

    const rows = navText();
    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain("Completada");
    expect(rows[1]).toContain("Sin empezar");
    expect(rows[2]).toContain("Sin empezar");
    expect(rows[3]).toContain("Sin empezar");
    expect(rows[4]).toContain("Sin empezar");

    // Finishing one neither closes the panel nor starts the next.
    expect(screen.getByTestId("reader-guide-panel")).toBeInTheDocument();
    expect(screen.getByTestId("player-pin")).toHaveTextContent(KEYS[0]);
  });

  it("switches to another reading without closing the panel", async () => {
    renderReader();
    await settle();
    await openFromHome(0);

    getExperienceCardStates.mockResolvedValue(
      cards(["COMPLETED", "START", "START", "START", "START"]),
    );
    fireEvent.click(screen.getByText("Simular COMPLETED"));
    await settle();

    fireEvent.click(navRows()[1].querySelector("button") as HTMLElement);
    // The shell re-asks about the new pin before the panel can prove it is
    // runnable, so the assertion waits for the answer rather than one tick.
    await waitFor(() =>
      expect(screen.getByTestId("player-pin")).toHaveTextContent(KEYS[1]),
    );

    expect(screen.getByTestId("reader-guide-panel")).toBeInTheDocument();
    // The one already finished still reads as finished.
    expect(navText()[0]).toContain("Completada");
    expect(navRows()).toHaveLength(5);
  });
});

describe("leaving one in progress", () => {
  it("switching away neither cancels nor completes the running reading", async () => {
    getExperienceCardStates.mockResolvedValue(
      cards(["CONTINUE", "START", "START", "START", "START"]),
    );
    renderReader();
    await settle();
    await openFromHome(0);

    expect(navText()[0]).toContain("En curso");

    fireEvent.click(navRows()[1].querySelector("button") as HTMLElement);
    await waitFor(() =>
      expect(screen.getByTestId("player-pin")).toHaveTextContent(KEYS[1]),
    );
    // No command was sent about the first: its verdict is unchanged.
    expect(navText()[0]).toContain("En curso");

    // And going back offers to continue it, not to start it over.
    fireEvent.click(navRows()[0].querySelector("button") as HTMLElement);
    await waitFor(() =>
      expect(screen.getByTestId("player-pin")).toHaveTextContent(KEYS[0]),
    );
    expect(navText()[0]).toContain("En curso");
  });
});

describe("when every reading is done", () => {
  it("still lists five, all of them reviewable", async () => {
    getExperienceCardStates.mockResolvedValue(
      cards(["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED"]),
    );
    renderReader();
    await settle();
    await openFromHome(0);

    const rows = navText();
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r).toContain("Completada");
    // The route does not vanish because the chapter is finished.
    expect(screen.getByTestId("rgp-route-count")).toHaveTextContent("5 de 5");

    // Every one is still openable — as a review, never as a fresh run.
    for (const li of navRows()) {
      expect(li.querySelector("button")).not.toBeDisabled();
    }
  });
});

describe("a verdict the server never gave", () => {
  it("renders the row inert rather than offering a fresh run", async () => {
    getExperienceCardStates.mockResolvedValue({
      // Only the first pin has an answer.
      items: cards(["START", "START", "START", "START", "START"]).items.slice(
        0,
        1,
      ),
    });
    renderReader();
    await settle();
    await openFromHome(0);

    const buttons = navRows().map((li) => li.querySelector("button"));
    expect(buttons[0]).not.toBeDisabled();
    for (const b of buttons.slice(1)) expect(b).toBeDisabled();
  });
});
