import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type {
  ChapterExperiencePublicView,
  ContentUnitRead,
  GuideExperienceCardState,
  LectorChapterResponse,
} from "@psico/types";
import { GUIDE_READER_ANCHOR } from "@psico/types";
import { LectorShell } from "./LectorShell";
import { GuideAvailabilityProvider } from "../guide/guide-availability";
import { GuideActorScopeProvider } from "../guide/guide-actor-scope";
import type * as ApiClientModule from "@psico/api-client";
import type * as ExperienceListModule from "../experience/ExperienceList";

/**
 * Defence in depth for `onOpenExperience`.
 *
 * The list already refuses to enable a card it cannot act on, and that is the
 * guard a reader meets. This file removes it on purpose: the stub always
 * renders a live button, so the handler is reached exactly as it would be by a
 * stale render, a replayed event, or a future caller that forgets the rule.
 *
 * Disabling a button is a presentation decision. Not starting a run is a
 * correctness one, and it belongs where the state changes.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("./AudioBar", () => ({ AudioBar: () => null }));

vi.mock("../guide/ReaderGuidePanel", () => ({
  READER_GUIDE_PANEL_ID: "reader-guide-panel",
  ReaderGuidePanel: (props: {
    bundle: { pin: { guideKey: string; guideVersion: number } };
    onClose: () => void;
  }) => (
    <aside data-testid="reader-guide-panel">
      <span data-testid="running-pin">
        {props.bundle.pin.guideKey}@{props.bundle.pin.guideVersion}
      </span>
    </aside>
  ),
}));

/**
 * A list that offers every card, always. Everything else in the module —
 * `experiencePinKey`, the status derivation, the types — stays real, because
 * replacing them would test a fiction.
 */
vi.mock("../experience/ExperienceList", async (importOriginal) => {
  const actual = await importOriginal<typeof ExperienceListModule>();
  return {
    ...actual,
    ExperienceList: ({
      experiences,
      onOpen,
    }: {
      experiences: readonly ChapterExperiencePublicView[];
      onOpen: (experience: ChapterExperiencePublicView) => void;
    }) => (
      <section data-testid="chapter-experiences">
        <ul>
          {experiences.map((experience) => (
            <li key={experience.experienceKey}>
              <button type="button" onClick={() => onOpen(experience)}>
                Abrir · {experience.title}
              </button>
            </li>
          ))}
        </ul>
      </section>
    ),
  };
});

const getGuideDiscovery = vi.fn();
const getExperienceCardStates = vi.fn();
const createGuideSession = vi.fn();
const listPublishedForChapter = vi.fn();

/**
 * These suites are about card machinery — status, pick, handler guards,
 * verdicts — and they use the historical pilot as "some published card in this
 * chapter". Since EEC-C01's five shipped, that pin is no longer OFFERED as a
 * card (one surface per reading); its bundle still resolves so an open session
 * runs. Which pins reach the list is asserted, unmocked, in
 * `ChapterExperienceHome.surfaces.test.tsx`; here we simply say the chapter
 * lists what it is given.
 */
vi.mock("../guide/guide-discovery-surface", () => ({
  guideDiscoverySurface: () => "legacy",
  belongsInLegacyExperienceList: () => true,
}));

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      ...actual.guideApi,
      getGuideDiscovery: (...a: unknown[]) => getGuideDiscovery(...a),
      getExperienceCardStates: (...a: unknown[]) =>
        getExperienceCardStates(...a),
      createGuideSession: (...a: unknown[]) => createGuideSession(...a),
    },
    experienceApi: {
      listPublishedForChapter: (...a: unknown[]) =>
        listPublishedForChapter(...a),
    },
  };
});

import { EEC_EXPERIENCE, EEC_PIN, PQP_PIN } from "../guide/guide-test-fixtures";

/** Pinned to another book's guide: the bundle exists, the passage does not. */
const FOREIGN_EXPERIENCE: ChapterExperiencePublicView = {
  ...EEC_EXPERIENCE,
  experienceKey: `${PQP_PIN.guideKey}-visitante`,
  title: "Otra travesía",
  guidePin: PQP_PIN,
};

const card = (
  pin: { guideKey: string; guideVersion: number },
  status: GuideExperienceCardState["status"] = "START",
  resumePin: { guideKey: string; guideVersion: number } = pin,
  applicability: GuideExperienceCardState["applicability"] = "APPLIES",
): GuideExperienceCardState => ({
  guidePin: pin,
  status,
  resumePin,
  // C.3R — the server's verdict travels with the card. `APPLIES` by default
  // because these cases are about status, pick and handler guards; the ones
  // that are about applicability say so explicitly.
  applicability,
  evaluatedPin: resumePin,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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

  getGuideDiscovery.mockResolvedValue({ available: false });
  listPublishedForChapter.mockResolvedValue({ items: [EEC_EXPERIENCE] });
  getExperienceCardStates.mockResolvedValue({
    items: [card(EEC_EXPERIENCE.guidePin)],
  });
});

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
});

function initialFor(order: number): LectorChapterResponse {
  return {
    book: { id: "b", slug: "s", title: "Un libro", totalChapters: 9 },
    chapter: {
      id: `ch-${order}`,
      order,
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
}

function unitWithAnchor(order: number): ContentUnitRead {
  return {
    editionKey: `${GUIDE_READER_ANCHOR.bookSlug}-1e`,
    revisionNumber: 1,
    unitKey: `unit-${order}`,
    title: "Capítulo",
    summary: null,
    order,
    partNumber: null,
    partTitle: null,
    source: "content-core",
    blocks: [
      {
        blockKey: "bk-h",
        legacyBlockId: "b-h",
        blockVersionId: "bv-h",
        kind: "HEADING",
        order: 1,
        content: GUIDE_READER_ANCHOR.sourceHeading,
        meta: null,
      },
      {
        blockKey: "bk-p",
        legacyBlockId: "b-p",
        blockVersionId: "bv-p",
        kind: "PARAGRAPH",
        order: 2,
        content: `Un preámbulo. ${GUIDE_READER_ANCHOR.passageLastSentence}`,
        meta: null,
      },
    ],
  };
}

function renderReader() {
  return render(
    <GuideAvailabilityProvider available>
      <GuideActorScopeProvider scope={"A".repeat(43)}>
        <LectorShell
          apiBase="https://api.example/api"
          token="tok"
          bookSlug={GUIDE_READER_ANCHOR.bookSlug}
          initial={initialFor(1)}
          unit={unitWithAnchor(1)}
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
  });
}

async function openChapterHome() {
  fireEvent.click(await screen.findByTestId("reader-open-chapter-home"));
  return screen.findByTestId("chapter-experiences");
}

/** Nothing moved: no pick, no surface change, no panel, no session. */
function nothingHappened() {
  expect(screen.queryByTestId("reader-guide-panel")).toBeNull();
  expect(screen.queryByTestId("running-pin")).toBeNull();
  // Still on the list — the handler did not switch surface either.
  expect(screen.getByTestId("chapter-experiences")).toBeInTheDocument();
  expect(createGuideSession).not.toHaveBeenCalled();
}

describe("onOpenExperience · the guards that do not depend on the button", () => {
  it("refuses a card whose resumePin cannot run here", async () => {
    listPublishedForChapter.mockResolvedValue({ items: [FOREIGN_EXPERIENCE] });
    getExperienceCardStates.mockResolvedValue({
      items: [card(FOREIGN_EXPERIENCE.guidePin)],
    });
    renderReader();
    await openChapterHome();
    await settle();

    fireEvent.click(await screen.findByRole("button", { name: /Abrir/ }));
    await settle();

    nothingHappened();
  });

  it("refuses while the verdict is still in flight", async () => {
    const pending = deferred<{ items: GuideExperienceCardState[] }>();
    getExperienceCardStates.mockReturnValue(pending.promise);
    renderReader();
    await openChapterHome();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /Abrir/ }));
    await settle();

    nothingHappened();
  });

  it("refuses after the answer failed", async () => {
    getExperienceCardStates.mockRejectedValue(new Error("network"));
    renderReader();
    await openChapterHome();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /Abrir/ }));
    await settle();

    nothingHappened();
  });

  it("refuses a verdict that has been superseded by a newer asking", async () => {
    renderReader();
    await openChapterHome();
    await settle();

    // The answer is settled and runnable — this card WOULD open…
    const cta = screen.getByRole("button", { name: /Abrir/ });
    const pending = deferred<{ items: GuideExperienceCardState[] }>();
    getExperienceCardStates.mockReturnValue(pending.promise);

    // …until the reader asks again. No settle: the click lands inside the
    // window this guard exists for.
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    fireEvent.click(cta);

    nothingHappened();
  });

  it("opens when the verdict is current AND the pin runs here", async () => {
    // The negative cases above are only meaningful if the positive one works:
    // a guard that refuses everything is not a guard.
    renderReader();
    await openChapterHome();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /Abrir/ }));

    expect(await screen.findByTestId("running-pin")).toHaveTextContent(
      `${EEC_PIN.guideKey}@${EEC_PIN.guideVersion}`,
    );
  });
});
