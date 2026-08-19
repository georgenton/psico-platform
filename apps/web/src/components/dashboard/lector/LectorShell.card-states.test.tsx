import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

/**
 * C.1 — what Chapter Home does with a verdict it does not have yet.
 *
 * The review this file answers: a card whose state is unknown must never read
 * «Empezar». "We could not ask" and "you have not started" are different
 * facts, and only one of them is safe to act on — offering a fresh run over a
 * session already in progress is how a reader loses their place.
 *
 * So the load is a state machine and the list renders all four phases: idle
 * and loading are inert, error says so and offers a retry, ready is the only
 * phase with a CTA. On top of that: responses are matched against the question
 * that is current when they ARRIVE, and the question is asked again when the
 * reader comes back to the tab.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("./AudioBar", () => ({ AudioBar: () => null }));

const getGuideDiscovery = vi.fn();
const getExperienceCardStates = vi.fn();
const createGuideSession = vi.fn();
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
      createGuideSession: (...a: unknown[]) => createGuideSession(...a),
    },
    experienceApi: {
      listPublishedForChapter: (...a: unknown[]) =>
        listPublishedForChapter(...a),
    },
  };
});

import { EEC_EXPERIENCE, EEC_PIN } from "../guide/guide-test-fixtures";

/**
 * A second journey in the same chapter — the shape #639 is about.
 *
 * Its key is DERIVED from the published one rather than written out: a long
 * hyphenated literal sitting next to the word «key» is what secret scanners
 * are built to notice, and a catalog slug is not worth teaching them to ignore.
 */
const OTHER_KEY = `${EEC_PIN.guideKey}-alterna`;

const OTHER_EXPERIENCE: ChapterExperiencePublicView = {
  ...EEC_EXPERIENCE,
  experienceKey: OTHER_KEY,
  title: "La segunda travesía",
  guidePin: { guideKey: OTHER_KEY, guideVersion: 1 },
};

const card = (
  pin: { guideKey: string; guideVersion: number },
  status: GuideExperienceCardState["status"],
): GuideExperienceCardState => ({ guidePin: pin, status, resumePin: pin });

/** A deferred promise, so a test decides WHEN a request answers. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

  getGuideDiscovery.mockResolvedValue({ available: true, ...EEC_PIN });
  listPublishedForChapter.mockResolvedValue({ items: [EEC_EXPERIENCE] });
  getExperienceCardStates.mockResolvedValue({
    items: [card(EEC_EXPERIENCE.guidePin, "START")],
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

/** Blocks carrying the guide's own heading and sentence, so the anchor lands. */
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

let rendered: ReturnType<typeof render> | null = null;

function renderReader({ order = 1 }: { order?: number } = {}) {
  rendered = render(
    <GuideAvailabilityProvider available>
      <GuideActorScopeProvider scope={"A".repeat(43)}>
        <LectorShell
          apiBase="https://api.example/api"
          token="tok"
          bookSlug={GUIDE_READER_ANCHOR.bookSlug}
          initial={initialFor(order)}
          unit={unitWithAnchor(order)}
          marks={null}
        />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>,
  );
  return rendered;
}

/** Go to the chapter's list of journeys. */
async function openChapterHome() {
  fireEvent.click(await screen.findByTestId("reader-open-chapter-home"));
  return screen.findByTestId("chapter-experiences");
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Chapter Home · an unknown card is inert (fail closed)", () => {
  it("asks ONE batch for the whole chapter, with the published pins", async () => {
    listPublishedForChapter.mockResolvedValue({
      items: [EEC_EXPERIENCE, OTHER_EXPERIENCE],
    });
    getExperienceCardStates.mockResolvedValue({
      items: [
        card(EEC_EXPERIENCE.guidePin, "COMPLETED"),
        card(OTHER_EXPERIENCE.guidePin, "START"),
      ],
    });
    renderReader();
    await openChapterHome();

    await waitFor(() =>
      expect(getExperienceCardStates).toHaveBeenCalledTimes(1),
    );
    expect(getExperienceCardStates).toHaveBeenCalledWith([
      EEC_EXPERIENCE.guidePin,
      OTHER_EXPERIENCE.guidePin,
    ]);

    // #639, on screen: one finished, one untouched, side by side.
    expect(await screen.findByText(/Completada/)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Empezar/ }),
    ).toBeInTheDocument();
  });

  it("while the batch is in flight, no card offers «Empezar»", async () => {
    const pending = deferred<{ items: GuideExperienceCardState[] }>();
    getExperienceCardStates.mockReturnValue(pending.promise);
    renderReader();
    await openChapterHome();
    await settle();

    expect(screen.queryByRole("button", { name: /Empezar/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/consultando/i);
    expect(
      screen.getByRole("button", { name: /No disponible/ }),
    ).toBeDisabled();

    await act(async () => {
      pending.resolve({ items: [card(EEC_EXPERIENCE.guidePin, "START")] });
    });
    expect(
      await screen.findByRole("button", { name: /Empezar/ }),
    ).toBeEnabled();
  });

  it("a failed batch says so and offers a retry — never «Empezar»", async () => {
    getExperienceCardStates.mockRejectedValueOnce(new Error("network"));
    renderReader();
    await openChapterHome();

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos/i);
    expect(screen.queryByRole("button", { name: /Empezar/ })).toBeNull();
    // And nothing was started to compensate for the failure.
    expect(createGuideSession).not.toHaveBeenCalled();

    getExperienceCardStates.mockResolvedValue({
      items: [card(EEC_EXPERIENCE.guidePin, "CONTINUE")],
    });
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));

    expect(
      await screen.findByRole("button", { name: /Continuar/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an old API answering 404 leaves every card inert", async () => {
    // Rolling deploy: the web bundle knows the route, the server it happens to
    // reach does not. A 404 is not «you have not started» — it is «we could
    // not ask», and starting on it can cancel the very session C.1 exists to
    // continue.
    getExperienceCardStates.mockRejectedValue(
      Object.assign(new Error("Not Found"), { statusCode: 404 }),
    );
    renderReader();
    await openChapterHome();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Empezar/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /No disponible/ }),
    ).toBeDisabled();
    expect(createGuideSession).not.toHaveBeenCalled();
  });

  it("on re-entry the PREVIOUS answer stops being actionable until it refreshes", async () => {
    renderReader();
    await openChapterHome();
    expect(
      await screen.findByRole("button", { name: /Empezar/ }),
    ).toBeEnabled();

    // Leave and come back, with the new read still in flight.
    const pending = deferred<{ items: GuideExperienceCardState[] }>();
    getExperienceCardStates.mockReturnValue(pending.promise);
    fireEvent.click(screen.getByTestId("reader-open-chapter-home"));
    await settle();
    fireEvent.click(screen.getByTestId("reader-open-chapter-home"));
    await settle();

    // The old verdict is no longer authoritative for the new question.
    expect(screen.queryByRole("button", { name: /Empezar/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/consultando/i);

    await act(async () => {
      pending.resolve({ items: [card(EEC_EXPERIENCE.guidePin, "CONTINUE")] });
    });
    expect(
      await screen.findByRole("button", { name: /Continuar/ }),
    ).toBeEnabled();
  });

  it("an answer that omits a pin leaves THAT card inert, not started", async () => {
    listPublishedForChapter.mockResolvedValue({
      items: [EEC_EXPERIENCE, OTHER_EXPERIENCE],
    });
    // The server answered about the first only. The second must not inherit a
    // verdict, and must not be given one locally.
    getExperienceCardStates.mockResolvedValue({
      items: [card(EEC_EXPERIENCE.guidePin, "CONTINUE")],
    });
    renderReader();
    await openChapterHome();

    const section = await screen.findByTestId("chapter-experiences");
    const cards = within(section).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute("data-status", "continue");
    expect(cards[1]).toHaveAttribute("data-status", "unknown");
  });
});

describe("Chapter Home · the answer is matched to the question", () => {
  it("a slower EARLIER read never overwrites a newer one", async () => {
    // Two reads of the same list overlap — the first at entry, the second a
    // revalidation — and they answer out of order. Ordering by arrival would
    // let the stale one win simply by being slower, and the card would go back
    // to describing a session the reader has already finished.
    const first = deferred<{ items: GuideExperienceCardState[] }>();
    const second = deferred<{ items: GuideExperienceCardState[] }>();
    getExperienceCardStates
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    renderReader();
    await openChapterHome();
    await settle();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(getExperienceCardStates).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      // The NEWER read answers first: the journey is finished.
      second.resolve({ items: [card(EEC_EXPERIENCE.guidePin, "COMPLETED")] });
    });
    expect(await screen.findByText(/Completada/)).toBeInTheDocument();

    await act(async () => {
      // …and the older read lands afterwards, still saying «not started».
      first.resolve({ items: [card(EEC_EXPERIENCE.guidePin, "START")] });
    });
    await settle();

    expect(screen.getByText(/Completada/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Empezar/ })).toBeNull();
  });

  it("an answer about a SUPERSEDED list of pins never paints the current one", async () => {
    // The catalog changed while a read was in flight. The answer that comes
    // back describes journeys this chapter no longer publishes, and applying
    // it would show a verdict for a card that is not on screen — or worse,
    // leave the card that IS on screen holding somebody else's status.
    const stale = deferred<{ items: GuideExperienceCardState[] }>();
    getExperienceCardStates.mockReturnValueOnce(stale.promise);

    renderReader();
    await openChapterHome();
    await settle();
    expect(getExperienceCardStates).toHaveBeenCalledWith([
      EEC_EXPERIENCE.guidePin,
    ]);

    // Leave the list, republish, come back: the hook asks again and the
    // question is now about a different pin.
    fireEvent.click(screen.getByTestId("reader-open-chapter-home"));
    await settle();
    listPublishedForChapter.mockResolvedValue({ items: [OTHER_EXPERIENCE] });
    getExperienceCardStates.mockResolvedValue({
      items: [card(OTHER_EXPERIENCE.guidePin, "CONTINUE")],
    });
    fireEvent.click(screen.getByTestId("reader-open-chapter-home"));

    expect(
      await screen.findByRole("button", { name: /Continuar/ }),
    ).toBeInTheDocument();

    await act(async () => {
      // The old question finally answers, about a pin nobody is asking about.
      stale.resolve({ items: [card(EEC_EXPERIENCE.guidePin, "COMPLETED")] });
    });
    await settle();

    expect(screen.queryByText(/Completada/)).toBeNull();
    expect(
      screen.getByRole("button", { name: /Continuar/ }),
    ).toBeInTheDocument();
  });

  it("asks again when the tab regains focus or becomes visible", async () => {
    renderReader();
    await openChapterHome();
    await waitFor(() =>
      expect(getExperienceCardStates).toHaveBeenCalledTimes(1),
    );

    // A session can change on another device, or in another tab. A verdict
    // read once at mount goes stale silently.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(getExperienceCardStates).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(getExperienceCardStates).toHaveBeenCalledTimes(3),
    );
  });

  it("asks again on RE-ENTRY to the list, not once per mount", async () => {
    renderReader();
    await openChapterHome();
    await waitFor(() =>
      expect(getExperienceCardStates).toHaveBeenCalledTimes(1),
    );

    // Leave to the text and come back — the journey may have moved on.
    fireEvent.click(screen.getByTestId("reader-open-chapter-home"));
    await settle();
    fireEvent.click(screen.getByTestId("reader-open-chapter-home"));

    await waitFor(() =>
      expect(getExperienceCardStates).toHaveBeenCalledTimes(2),
    );
  });

  it("never asks while the reader is on the text", async () => {
    renderReader();
    await settle();
    expect(getExperienceCardStates).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await settle();
    expect(getExperienceCardStates).not.toHaveBeenCalled();
  });

  it("a chapter with no journeys asks nothing at all", async () => {
    listPublishedForChapter.mockResolvedValue({ items: [] });
    renderReader();
    fireEvent.click(await screen.findByTestId("reader-open-chapter-home"));
    await settle();

    expect(getExperienceCardStates).not.toHaveBeenCalled();
    // Zero is the absence of a section, not an empty one.
    expect(screen.queryByTestId("chapter-experiences")).toBeNull();
  });
});

describe("C.1 · a picked journey runs on its OWN pin", () => {
  it("runs even when chapter discovery names no guide here", async () => {
    // Blocker 5, as a test. The guided TAB belongs to the chapter's own pin;
    // a card belongs to the journey the catalog published. Gating the second
    // on the first made a chapter refuse to run an experience it publishes
    // itself, for a reason that has nothing to do with that experience.
    getGuideDiscovery.mockResolvedValue({ available: false });
    getExperienceCardStates.mockResolvedValue({
      items: [card(EEC_EXPERIENCE.guidePin, "START")],
    });
    renderReader();
    await openChapterHome();

    // No guided tab — discovery genuinely named nothing…
    expect(screen.queryByTestId("reader-mode-guiada")).toBeNull();
    // …and the chapter's own journeys are still on offer.
    fireEvent.click(await screen.findByRole("button", { name: /Empezar/ }));

    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();
    // Opening is not starting: the session is created by the cover's button.
    expect(createGuideSession).not.toHaveBeenCalled();
  });

  it("runs the pin the SERVER named to resume, not the published one", async () => {
    // The reader left `@1` running and the catalog published `@2`. Running the
    // published pin would strand the session they are in.
    const published = { guideKey: EEC_PIN.guideKey, guideVersion: 2 };
    listPublishedForChapter.mockResolvedValue({
      items: [{ ...EEC_EXPERIENCE, guidePin: published }],
    });
    getExperienceCardStates.mockResolvedValue({
      items: [{ guidePin: published, status: "CONTINUE", resumePin: EEC_PIN }],
    });
    renderReader();
    await openChapterHome();

    fireEvent.click(await screen.findByRole("button", { name: /Continuar/ }));
    // `@2` ships no bundle in this build, so a surface that ran the published
    // pin would render nothing at all. The panel appearing IS the assertion
    // that `@1` — the session's own pin — is what runs.
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();
  });

  it("a card with no verdict cannot be opened at all", async () => {
    getExperienceCardStates.mockRejectedValue(new Error("network"));
    renderReader();
    await openChapterHome();

    const cta = await screen.findByRole("button", { name: /No disponible/ });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    await settle();

    expect(screen.queryByTestId("reader-guide-panel")).toBeNull();
    expect(createGuideSession).not.toHaveBeenCalled();
  });
});

describe("C.1 · the pick has a lifecycle", () => {
  it("survives closing the panel — a dismissal is not a decision", async () => {
    renderReader();
    await openChapterHome();
    fireEvent.click(await screen.findByRole("button", { name: /Empezar/ }));
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();

    // Close it the way a reader does, to look at a paragraph.
    fireEvent.click(screen.getByTestId("reader-mode-leer"));
    await settle();

    // Reopening returns to the SAME journey, not to the chapter's default.
    fireEvent.click(screen.getByTestId("reader-mode-guiada"));
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: EEC_EXPERIENCE.title }),
    ).toBeInTheDocument();
  });

  it("is dropped when the reader moves to another chapter", async () => {
    /**
     * A new chapter is a new catalog. Carrying the pick over would run a
     * journey that is not on this screen.
     *
     * Made observable by having chapter discovery name NOTHING: the panel can
     * then only be running because of the pick, so if it survives a chapter
     * change and a return, it is running for a chapter that never offered it.
     */
    getGuideDiscovery.mockResolvedValue({ available: false });
    renderReader({ order: 1 });
    await openChapterHome();
    fireEvent.click(await screen.findByRole("button", { name: /Empezar/ }));
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();

    const elsewhere = (
      <GuideAvailabilityProvider available>
        <GuideActorScopeProvider scope={"A".repeat(43)}>
          <LectorShell
            apiBase="https://api.example/api"
            token="tok"
            bookSlug={GUIDE_READER_ANCHOR.bookSlug}
            initial={initialFor(2)}
            unit={unitWithAnchor(2)}
            marks={null}
          />
        </GuideActorScopeProvider>
      </GuideAvailabilityProvider>
    );
    await act(async () => {
      rendered!.rerender(elsewhere);
    });
    await settle();

    // Back to the chapter the journey belongs to. With the pick dropped and
    // discovery naming nothing, there is no guided surface to return to.
    await act(async () => {
      rendered!.rerender(
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
    });
    await settle();

    expect(screen.queryByTestId("reader-guide-panel")).toBeNull();
    expect(screen.queryByTestId("reader-mode-guiada")).toBeNull();
  });

  it("is dropped when the picked journey stops being published", async () => {
    renderReader();
    await openChapterHome();
    fireEvent.click(await screen.findByRole("button", { name: /Empezar/ }));
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();

    // The catalog retires it while the reader is inside. Leaving the pick in
    // place would keep running a journey the chapter no longer offers.
    listPublishedForChapter.mockResolvedValue({ items: [] });
    fireEvent.click(screen.getByTestId("reader-open-chapter-home"));
    await settle();
    fireEvent.click(screen.getByTestId("reader-open-chapter-home"));
    await settle();

    await waitFor(() =>
      expect(screen.queryByTestId("chapter-experiences")).toBeNull(),
    );
    expect(
      screen.queryByRole("heading", { name: EEC_EXPERIENCE.title }),
    ).toBeNull();
  });
});
