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
  GuideReaderAnchorLocator,
  LectorChapterResponse,
} from "@psico/types";
import { GUIDE_READER_ANCHOR, PAREJAS_READER_ANCHOR } from "@psico/types";
import { LectorShell } from "./LectorShell";
import { GuideAvailabilityProvider } from "../guide/guide-availability";
import { GuideActorScopeProvider } from "../guide/guide-actor-scope";
import type * as ApiClientModule from "@psico/api-client";

/**
 * GR-4 — the reader offers the guide the SERVER named, on the chapter the
 * anchor belongs to, and nothing otherwise.
 *
 * These are the five context expectations of the demo, written as tests so
 * they cannot quietly stop being true:
 *
 *   Emociones ch.1 → the Emociones guide;
 *   Parejas   ch.2 → the Parejas guide (the book's chapter 1);
 *   Parejas   ch.1 → nothing (that is the preface);
 *   Parejas   ch.3 → nothing;
 *   Emociones ch.2 → nothing.
 *
 * Plus the two states the reader must never paper over: while discovery is in
 * flight, and when it fails. Neither may show a guide, and neither may show
 * the OTHER book's guide as a stand-in.
 *
 * Book Experience Standard V1 tightened what «nothing» means. The guided tab
 * is now rendered only once the standard makes the mode visible, which for a
 * guide means PUBLISHED: discovery answered, pin parsed, bundle and anchor
 * resolved. So the assertion for every negative context is the ABSENCE of the
 * tab — there is no longer a button that opens a panel to explain itself.
 *
 * No chapter prose is copied. The fixtures are built from the locators, so
 * this file cannot drift from the catalog.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("./AudioBar", () => ({ AudioBar: () => null }));

const getGuideDiscovery = vi.fn();
const createGuideSession = vi.fn();

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      ...actual.guideApi,
      getGuideDiscovery: (...a: unknown[]) => getGuideDiscovery(...a),
      createGuideSession: (...a: unknown[]) => createGuideSession(...a),
    },
  };
});

const EEC_PIN = { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 };
const PQP_PIN = { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 };
const GUIDE_TAB = "reader-mode-guiada";

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
});

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
});

function initialFor(order: number, title: string): LectorChapterResponse {
  return {
    book: { id: "b", slug: "s", title: "Un libro", totalChapters: 9 },
    chapter: {
      id: `ch-${order}`,
      order,
      title,
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

/** Blocks that carry THIS locator's heading and sentence — nothing else. */
function unitFor(locator: GuideReaderAnchorLocator): ContentUnitRead {
  return {
    editionKey: `${locator.bookSlug}-1e`,
    revisionNumber: 1,
    unitKey: `unit-${locator.chapterOrder}`,
    title: "Capítulo",
    summary: null,
    order: locator.chapterOrder,
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
        content: locator.sourceHeading,
        meta: null,
      },
      {
        blockKey: "bk-p",
        legacyBlockId: "b-p",
        blockVersionId: "bv-p",
        kind: "PARAGRAPH",
        order: 2,
        content: `Un preámbulo. ${locator.passageLastSentence}`,
        meta: null,
      },
    ],
  };
}

/** A chapter with real blocks but none this guide is about. */
function unitWithoutAnchor(order: number): ContentUnitRead {
  return {
    ...unitFor(GUIDE_READER_ANCHOR),
    order,
    unitKey: `unit-${order}`,
    blocks: [
      {
        blockKey: "bk-o",
        legacyBlockId: "b-o",
        blockVersionId: "bv-o",
        kind: "PARAGRAPH",
        order: 1,
        content: "Un párrafo cualquiera de otro capítulo.",
        meta: null,
      },
    ],
  };
}

function renderReader({
  bookSlug,
  order,
  unit,
}: {
  bookSlug: string;
  order: number;
  unit: ContentUnitRead;
}) {
  return render(
    <GuideAvailabilityProvider available>
      <GuideActorScopeProvider scope={"A".repeat(43)}>
        <LectorShell
          apiBase="https://api.example/api"
          token="tok"
          bookSlug={bookSlug}
          initial={initialFor(order, "Un capítulo")}
          unit={unit}
          marks={null}
        />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>,
  );
}

/**
 * Wait for the offer to appear, then take it.
 *
 * `findByTestId` is the assertion as much as the setup: the tab exists only
 * when the guide is genuinely ready, so waiting for it IS waiting for the six
 * conditions to hold.
 */
async function openGuide() {
  fireEvent.click(await screen.findByTestId(GUIDE_TAB));
}

/**
 * Let discovery answer, then assert the reader still offers no guided tab.
 *
 * Waiting for the call first is what makes the absence meaningful: without it
 * the assertion would pass simply because nothing had happened yet.
 */
async function expectNoGuidedTab() {
  await waitFor(() => expect(getGuideDiscovery).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.queryByTestId(GUIDE_TAB)).not.toBeInTheDocument();
  expect(screen.queryByTestId("reader-guide-panel")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Empezar" }),
  ).not.toBeInTheDocument();
}

describe("LectorShell · the five reading contexts", () => {
  it("Emociones ch.1 → the Emociones guide", async () => {
    getGuideDiscovery.mockResolvedValue({ available: true, ...EEC_PIN });
    renderReader({
      bookSlug: "emociones-en-construccion",
      order: 1,
      unit: unitFor(GUIDE_READER_ANCHOR),
    });
    await openGuide();

    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();
    // The cover heading of the panel — the chapter card in the reader carries
    // the same words, so scope the query to the panel itself.
    expect(
      screen.getByRole("heading", {
        name: "El cuerpo sabe antes que la mente",
      }),
    ).toBeInTheDocument();
    // …and NOT the other book's cover.
    expect(
      screen.queryByText("El contacto sostenido en silencio"),
    ).not.toBeInTheDocument();
  });

  it("Parejas ch.2 → the Parejas guide (the book's chapter 1)", async () => {
    getGuideDiscovery.mockResolvedValue({ available: true, ...PQP_PIN });
    renderReader({
      bookSlug: "parejas-que-perduran",
      order: 2,
      unit: unitFor(PAREJAS_READER_ANCHOR),
    });
    await openGuide();

    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();
    expect(
      screen.getByText("El contacto sostenido en silencio"),
    ).toBeInTheDocument();
    expect(getGuideDiscovery).toHaveBeenCalledWith("parejas-que-perduran", 2);
    expect(
      screen.queryByRole("heading", {
        name: "El cuerpo sabe antes que la mente",
      }),
    ).not.toBeInTheDocument();
  });

  it("Parejas ch.1 → nothing: that chapter is the preface", async () => {
    // The server is the one that says no; the reader simply honours it.
    getGuideDiscovery.mockResolvedValue({ available: false });
    renderReader({
      bookSlug: "parejas-que-perduran",
      order: 1,
      unit: unitWithoutAnchor(1),
    });
    await expectNoGuidedTab();
  });

  it("Parejas ch.3 → nothing", async () => {
    getGuideDiscovery.mockResolvedValue({ available: false });
    renderReader({
      bookSlug: "parejas-que-perduran",
      order: 3,
      unit: unitWithoutAnchor(3),
    });
    await expectNoGuidedTab();
  });

  it("Emociones ch.2 → nothing", async () => {
    getGuideDiscovery.mockResolvedValue({ available: false });
    renderReader({
      bookSlug: "emociones-en-construccion",
      order: 2,
      unit: unitWithoutAnchor(2),
    });
    await expectNoGuidedTab();
  });
});

describe("LectorShell · discovery states that must not become a guide", () => {
  it("NO_GUIDE_WHILE_LOADING — and no other book's guide as a stand-in", async () => {
    let settle!: (v: unknown) => void;
    getGuideDiscovery.mockReturnValue(
      new Promise((r) => {
        settle = r;
      }),
    );
    renderReader({
      bookSlug: "parejas-que-perduran",
      order: 2,
      unit: unitFor(PAREJAS_READER_ANCHOR),
    });
    // While the request is in flight there is no offer at all: no tab, no
    // panel, and above all no other book's cover standing in for the answer.
    await waitFor(() => expect(getGuideDiscovery).toHaveBeenCalled());
    expect(screen.queryByTestId(GUIDE_TAB)).not.toBeInTheDocument();
    expect(screen.queryByTestId("reader-guide-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Empezar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "El cuerpo sabe antes que la mente",
      }),
    ).not.toBeInTheDocument();

    // …and once the server answers, the offer appears and can be taken.
    await act(async () => {
      settle({ available: true, ...PQP_PIN });
    });
    await openGuide();
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();
  });

  it("NO_EEC_FALLBACK_ON_ERROR — a failed lookup shows no guide at all", async () => {
    getGuideDiscovery.mockRejectedValue(new Error("network"));
    renderReader({
      bookSlug: "parejas-que-perduran",
      order: 2,
      unit: unitFor(PAREJAS_READER_ANCHOR),
    });
    await expectNoGuidedTab();
    expect(
      screen.queryByRole("heading", {
        name: "El cuerpo sabe antes que la mente",
      }),
    ).not.toBeInTheDocument();
  });

  it("a pin this build does not ship shows no guide", async () => {
    getGuideDiscovery.mockResolvedValue({
      available: true,
      guideKey: "guia-del-futuro",
      guideVersion: 1,
    });
    renderReader({
      bookSlug: "parejas-que-perduran",
      order: 2,
      unit: unitFor(PAREJAS_READER_ANCHOR),
    });
    await expectNoGuidedTab();
  });

  it("the right pin on the WRONG chapter shows no guide", async () => {
    // A catalog mistake: the server names the Parejas guide while the reader
    // is in Emociones. The anchor's own book/chapter is the last guard.
    getGuideDiscovery.mockResolvedValue({ available: true, ...PQP_PIN });
    renderReader({
      bookSlug: "emociones-en-construccion",
      order: 1,
      unit: unitFor(GUIDE_READER_ANCHOR),
    });
    await expectNoGuidedTab();
  });

  it("asks nothing at all when the pilot gate is off", async () => {
    getGuideDiscovery.mockResolvedValue({ available: true, ...PQP_PIN });
    render(
      <GuideAvailabilityProvider available={false}>
        <GuideActorScopeProvider scope={"A".repeat(43)}>
          <LectorShell
            apiBase="https://api.example/api"
            token="tok"
            bookSlug="parejas-que-perduran"
            initial={initialFor(2, "Un capítulo")}
            unit={unitFor(PAREJAS_READER_ANCHOR)}
            marks={null}
          />
        </GuideActorScopeProvider>
      </GuideAvailabilityProvider>,
    );
    // No gate, no question, and therefore nothing to offer.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId(GUIDE_TAB)).not.toBeInTheDocument();
    expect(getGuideDiscovery).not.toHaveBeenCalled();
  });

  it("the panel closes by itself if the guide stops being offered", async () => {
    getGuideDiscovery.mockResolvedValue({ available: true, ...PQP_PIN });
    const { rerender } = renderReader({
      bookSlug: "parejas-que-perduran",
      order: 2,
      unit: unitFor(PAREJAS_READER_ANCHOR),
    });
    await openGuide();
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();

    // The pilot gate closes underneath the reader. The panel must go with it,
    // and nothing else may happen: no session is started and none is
    // cancelled — an unmount is not a decision about anyone's progress.
    rerender(
      <GuideAvailabilityProvider available={false}>
        <GuideActorScopeProvider scope={"A".repeat(43)}>
          <LectorShell
            apiBase="https://api.example/api"
            token="tok"
            bookSlug="parejas-que-perduran"
            initial={initialFor(2, "Un capítulo")}
            unit={unitFor(PAREJAS_READER_ANCHOR)}
            marks={null}
          />
        </GuideActorScopeProvider>
      </GuideAvailabilityProvider>,
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId("reader-guide-panel"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId(GUIDE_TAB)).not.toBeInTheDocument();
    expect(createGuideSession).not.toHaveBeenCalled();
  });
});
