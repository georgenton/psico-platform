import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
 * C.3R (#639) — the browser stopped deciding which chapter a guide belongs to.
 *
 * ── What this file is about ─────────────────────────────────────────────────
 *
 * The reader used to answer applicability itself, by comparing the anchor's
 * `(bookSlug, chapterOrder)` with the chapter on screen — `anchorAppliesTo`.
 * That is placement compared against placement: after an editorial reorder the
 * guide followed the NUMBER, so it appeared over whichever unit inherited it
 * and disappeared from the unit it is actually about.
 *
 * The server answers it now, by resolving the guide's editorial target and the
 * reader's unit to internal ids and comparing THOSE. Neither id crosses the
 * wire. What arrives is a closed word, and this file pins what the reader does
 * with it — including the two cases the old code could not express:
 *
 *   - the anchor's own chapter number is NOT the screen's, and the guide runs
 *     anyway, because the server says it belongs here;
 *   - the numbers agree perfectly, and the guide does NOT run, because the
 *     server says it does not.
 *
 * Both are inverted from the previous behaviour, which is the point.
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

/** A complete card answer. Every field the C.3R contract requires. */
const card = (
  status: GuideExperienceCardState["status"],
  applicability: GuideExperienceCardState["applicability"],
  pin: { guideKey: string; guideVersion: number } = EEC_PIN,
  resumePin: { guideKey: string; guideVersion: number } = pin,
): GuideExperienceCardState => ({
  guidePin: pin,
  status,
  resumePin,
  applicability,
  evaluatedPin: resumePin,
});

function initialFor(order: number): LectorChapterResponse {
  return {
    book: {
      id: "b-1",
      slug: GUIDE_READER_ANCHOR.bookSlug,
      title: "Libro",
      totalChapters: 3,
    },
    chapter: {
      id: `ch-${order}`,
      order,
      title: "Capítulo",
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

/**
 * The unit the reader is served, carrying the guide's own passage.
 *
 * `order` and `unitKey` move independently on purpose: a reorder changes where
 * a unit SITS without changing which unit it is, and the whole point of C.3R is
 * that the verdict follows the unit.
 */
function unitAt(order: number, unitKey = `unit-${order}`): ContentUnitRead {
  return {
    editionKey: `${GUIDE_READER_ANCHOR.bookSlug}-1e`,
    revisionNumber: 1,
    unitKey,
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

function renderReader({
  order = GUIDE_READER_ANCHOR.chapterOrder,
  unitKey,
}: { order?: number; unitKey?: string } = {}) {
  rendered = render(
    <GuideAvailabilityProvider available>
      <GuideActorScopeProvider scope={"A".repeat(43)}>
        <LectorShell
          apiBase="https://api.example/api"
          token="tok"
          bookSlug={GUIDE_READER_ANCHOR.bookSlug}
          initial={initialFor(order)}
          unit={unitAt(order, unitKey)}
          marks={null}
        />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>,
  );
  return rendered;
}

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
  createGuideSession.mockResolvedValue({
    created: true,
    replayed: false,
    session: {},
  });
});

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
});

// ── The context the reader states ───────────────────────────────────────────

describe("C.3R · the question carries where the reader is", () => {
  it("sends the SERVED unit's key, not something derived from the route", async () => {
    // The route says chapter 1; the unit served is `u-abc`. The context has to
    // describe the text on screen, because that is what a verdict is about.
    getExperienceCardStates.mockResolvedValue({
      items: [card("START", "APPLIES", EEC_EXPERIENCE.guidePin)],
    });
    renderReader({ unitKey: "u-abc" });
    await openChapterHome();

    await waitFor(() => expect(getExperienceCardStates).toHaveBeenCalled());
    const [, reader] = getExperienceCardStates.mock.calls[0] as [
      unknown,
      { bookSlug: string; chapterOrder: number; unitKey: string },
    ];
    expect(reader).toEqual({
      bookSlug: GUIDE_READER_ANCHOR.bookSlug,
      chapterOrder: GUIDE_READER_ANCHOR.chapterOrder,
      unitKey: "u-abc",
    });
  });

  it("never sends an internal identifier", async () => {
    getExperienceCardStates.mockResolvedValue({
      items: [card("START", "APPLIES", EEC_EXPERIENCE.guidePin)],
    });
    renderReader();
    await openChapterHome();

    await waitFor(() => expect(getExperienceCardStates).toHaveBeenCalled());
    const sent = JSON.stringify(getExperienceCardStates.mock.calls[0]);
    // `contentUnitId` is the server's own identity for the unit. A client that
    // could name one could name someone else's.
    expect(sent).not.toContain("contentUnitId");
    expect(sent).not.toContain("revisionId");
    expect(sent).not.toContain("editionId");
  });

  it("a DIFFERENT unit at the same number is a different question", async () => {
    // The reorder case, from the browser's side: same book, same chapter
    // number, another unit. If the context did not carry the unit, the second
    // screen would silently reuse the first screen's answer.
    getExperienceCardStates.mockResolvedValue({
      items: [card("START", "APPLIES", EEC_EXPERIENCE.guidePin)],
    });
    renderReader({ unitKey: "u-primera" });
    await openChapterHome();
    await settle();
    rendered?.unmount();
    rendered = null;

    renderReader({ unitKey: "u-segunda" });
    await openChapterHome();
    await settle();

    const keys = getExperienceCardStates.mock.calls.map(
      (c) => (c[1] as { unitKey: string }).unitKey,
    );
    expect(keys).toContain("u-primera");
    expect(keys).toContain("u-segunda");
  });
});

// ── The verdict, and what the reader does with it ───────────────────────────

describe("C.3R · the server decides applicability, and the browser obeys", () => {
  it("APPLIES + runnable → the card opens the journey", async () => {
    getExperienceCardStates.mockResolvedValue({
      items: [card("START", "APPLIES", EEC_EXPERIENCE.guidePin)],
    });
    renderReader();
    await openChapterHome();

    fireEvent.click(await screen.findByRole("button", { name: /Empezar/ }));
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();
  });

  it("UNAVAILABLE → the same card is visible and inert", async () => {
    // Everything else is identical to the case above: the same pin, the same
    // bundle, the same passage in the same blocks. Only the server's word
    // changed, and that is the only thing that may change the outcome.
    getExperienceCardStates.mockResolvedValue({
      items: [card("START", "UNAVAILABLE", EEC_EXPERIENCE.guidePin)],
    });
    renderReader();
    await openChapterHome();
    await settle();

    const cardEl = await screen.findByTestId(
      `experience-card-${EEC_EXPERIENCE.experienceKey}`,
    );
    // Visible, and saying which of the two negatives this is.
    expect(cardEl).toHaveAttribute("data-status", "start");
    expect(cardEl).toHaveAttribute("data-runnable", "false");
    const button = await screen.findByRole("button", {
      name: /No disponible aquí/,
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.queryByTestId("reader-guide-panel")).toBeNull();
  });

  it("UNAVAILABLE does not rewrite the STATUS word", async () => {
    // An open run exists whatever this screen can do about it. Turning «En
    // curso» into «Empezar» because the guide is not for here would offer a
    // fresh start over a session the reader already has.
    getExperienceCardStates.mockResolvedValue({
      items: [card("CONTINUE", "UNAVAILABLE", EEC_EXPERIENCE.guidePin)],
    });
    renderReader();
    await openChapterHome();
    await settle();

    // The BADGE still says «En curso» — where the reader stands does not
    // change because this screen cannot open the door.
    const cardEl = await screen.findByTestId(
      `experience-card-${EEC_EXPERIENCE.experienceKey}`,
    );
    expect(cardEl).toHaveAttribute("data-status", "continue");
    expect(cardEl).toHaveAttribute("data-runnable", "false");
    expect(cardEl).toHaveTextContent(/En curso/);
    expect(screen.queryByRole("button", { name: /Empezar/ })).toBeNull();
  });

  it("says out loud why the card cannot be opened", async () => {
    getExperienceCardStates.mockResolvedValue({
      items: [card("START", "UNAVAILABLE", EEC_EXPERIENCE.guidePin)],
    });
    renderReader();
    await openChapterHome();

    expect(
      await screen.findByText(/no puede abrirse en este capítulo/i),
    ).toBeInTheDocument();
  });

  it("a MISSING verdict fails closed (the rolling deploy window)", async () => {
    // An older server, answering without `applicability`. The honest reading is
    // "nobody said this belongs here", and opening on that is the one thing
    // that can put a journey over the wrong chapter.
    getExperienceCardStates.mockResolvedValue({
      items: [
        {
          guidePin: EEC_EXPERIENCE.guidePin,
          status: "START",
          resumePin: EEC_EXPERIENCE.guidePin,
        },
      ],
    });
    renderReader();
    await openChapterHome();
    await settle();

    const cardEl = await screen.findByTestId(
      `experience-card-${EEC_EXPERIENCE.experienceKey}`,
    );
    expect(cardEl).toHaveAttribute("data-runnable", "false");
  });

  it("an UNKNOWN word is not a verdict either", async () => {
    getExperienceCardStates.mockResolvedValue({
      items: [
        {
          ...card("START", "APPLIES", EEC_EXPERIENCE.guidePin),
          applicability: "MAYBE",
        },
      ],
    });
    renderReader();
    await openChapterHome();
    await settle();

    const cardEl = await screen.findByTestId(
      `experience-card-${EEC_EXPERIENCE.experienceKey}`,
    );
    expect(cardEl).toHaveAttribute("data-runnable", "false");
  });
});

// ── The two cases the old positional code could not express ─────────────────

describe("C.3R · position no longer decides, in either direction", () => {
  it("runs on a chapter NUMBER the anchor was never written for", async () => {
    // The guide's anchor names chapter 1; the reader is standing at 7 because
    // the book was reordered. The passage is in the blocks served, and the
    // server says this unit is the one the guide is about — so it runs.
    //
    // `anchorAppliesTo(bookSlug, 7, locator)` would have returned false and the
    // card would have been dead. That is the bug, and this is its inverse.
    const order = GUIDE_READER_ANCHOR.chapterOrder + 6;
    getExperienceCardStates.mockResolvedValue({
      items: [card("START", "APPLIES", EEC_EXPERIENCE.guidePin)],
    });
    renderReader({ order });
    await openChapterHome();

    const [, reader] = getExperienceCardStates.mock.calls[0] as [
      unknown,
      { chapterOrder: number },
    ];
    expect(reader.chapterOrder).toBe(order);
    fireEvent.click(await screen.findByRole("button", { name: /Empezar/ }));
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();
  });

  it("refuses on the EXACT number the anchor names, when the server says so", async () => {
    // The other half. Book and chapter agree with the anchor down to the
    // number, so the old gate would have opened; the unit at that number is
    // simply not the one this guide is about any more.
    getExperienceCardStates.mockResolvedValue({
      items: [card("START", "UNAVAILABLE", EEC_EXPERIENCE.guidePin)],
    });
    renderReader({ order: GUIDE_READER_ANCHOR.chapterOrder });
    await openChapterHome();
    await settle();

    const cardEl = await screen.findByTestId(
      `experience-card-${EEC_EXPERIENCE.experienceKey}`,
    );
    expect(cardEl).toHaveAttribute("data-runnable", "false");
    expect(
      await screen.findByRole("button", { name: /No disponible aquí/ }),
    ).toBeDisabled();
  });

  it("the guided passage is gated on the verdict, not on the number", async () => {
    // Discovery is the other way in. Since C.3R its `available` IS an identity
    // comparison, so a guided run opened from it may go to its passage.
    getGuideDiscovery.mockResolvedValue({ available: true, ...EEC_PIN });
    getExperienceCardStates.mockResolvedValue({ items: [] });
    listPublishedForChapter.mockResolvedValue({ items: [] });
    renderReader({ order: GUIDE_READER_ANCHOR.chapterOrder + 3 });
    await settle();

    // The guided tab exists at a number the anchor never named, because the
    // server answered about the unit rather than the position.
    expect(await screen.findByTestId("reader-mode-guiada")).toBeInTheDocument();
  });

  it("no verdict for the run pin → no passage to go to", async () => {
    // Discovery says nothing and no card answered, so nobody has said this
    // guide belongs here. The panel must not offer a passage on the strength of
    // the text merely being present.
    getGuideDiscovery.mockResolvedValue({ available: false });
    getExperienceCardStates.mockResolvedValue({ items: [] });
    listPublishedForChapter.mockResolvedValue({ items: [] });
    renderReader();
    await settle();

    expect(screen.queryByTestId("reader-mode-guiada")).toBeNull();
  });
});

// ── The verdict is about the pin that would RUN ─────────────────────────────

describe("C.3R · the verdict is bound to evaluatedPin", () => {
  it("a CONTINUE card is judged on the pin it resumes", async () => {
    // The catalog published `@2`; the reader's run is `@1`. The server judged
    // `@1` — the pin a click lands on — and echoes it as `evaluatedPin`.
    const published = { guideKey: EEC_PIN.guideKey, guideVersion: 2 };
    listPublishedForChapter.mockResolvedValue({
      items: [{ ...EEC_EXPERIENCE, guidePin: published }],
    });
    getExperienceCardStates.mockResolvedValue({
      items: [card("CONTINUE", "APPLIES", published, EEC_PIN)],
    });
    renderReader();
    await openChapterHome();

    fireEvent.click(await screen.findByRole("button", { name: /Continuar/ }));
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();
  });

  it("an UNAVAILABLE verdict on the resumed pin closes the card", async () => {
    const published = { guideKey: EEC_PIN.guideKey, guideVersion: 2 };
    listPublishedForChapter.mockResolvedValue({
      items: [{ ...EEC_EXPERIENCE, guidePin: published }],
    });
    getExperienceCardStates.mockResolvedValue({
      items: [card("CONTINUE", "UNAVAILABLE", published, EEC_PIN)],
    });
    renderReader();
    await openChapterHome();
    await settle();

    const cardEl = await screen.findByTestId(
      `experience-card-${EEC_EXPERIENCE.experienceKey}`,
    );
    expect(cardEl).toHaveAttribute("data-status", "continue");
    expect(cardEl).toHaveAttribute("data-runnable", "false");
  });
});
