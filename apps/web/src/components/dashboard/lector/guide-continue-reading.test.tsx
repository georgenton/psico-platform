import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  ChapterMediaSummary,
  ContentUnitRead,
  LectorChapterResponse,
} from "@psico/types";
import { GUIDE_READER_ANCHOR } from "@psico/types";
import { LectorShell } from "./LectorShell";
import { storedToMode } from "./reader-mode";
import { GuideAvailabilityProvider } from "../guide/guide-availability";
import { GuideActorScopeProvider } from "../guide/guide-actor-scope";
import type * as ApiClientModule from "@psico/api-client";

/**
 * Closing a guide and continuing to read are two different sentences.
 *
 * «Cerrar» is a dismissal. The reader is done with the panel and gets back
 * whatever they were doing — which may well have been listening. Nothing about
 * their chosen format is a decision the panel gets to make for them.
 *
 * «Continuar leyendo» says the opposite out loud: I finished the guide and I
 * want to go on READING. Treating it as a plain close dropped a person who had
 * arrived from Escuchar straight back into the audiobook, which is not what
 * they just asked for.
 *
 * Both are exercised at the `LectorShell` boundary. The guide panel and the two
 * media surfaces are stubbed to markers, because what is under test is which
 * surface the shell puts on screen and which mode it persists — not how any of
 * those three render.
 */

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: mockPush }),
}));

const getGuideDiscovery = vi.fn(
  async (): Promise<
    | { available: true; guideKey: string; guideVersion: number }
    | { available: false }
  > => ({ available: false }),
);

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      ...actual.guideApi,
      getGuideDiscovery: () => getGuideDiscovery(),
    },
  };
});

vi.mock("./AudioBar", () => ({ AudioBar: () => null }));

/** The two media surfaces, reduced to «am I on screen». */
vi.mock("./media/ChapterMediaListen", () => ({
  ChapterMediaListen: () => <div data-testid="listen-surface" />,
  RetryCompletion: () => null,
}));
vi.mock("./media/ChapterMediaWatch", () => ({
  ChapterMediaWatch: () => <div data-testid="watch-surface" />,
}));

/**
 * The guide panel, reduced to its three exits.
 *
 * The real panel puts «Continuar leyendo» and «Volver al pasaje» behind a
 * started session, which is its own test's job (`ReaderGuidePanel.test.tsx`).
 * Here they are three plain buttons so the shell's response to each is what the
 * assertion is about.
 */
vi.mock("../guide/ReaderGuidePanel", () => ({
  READER_GUIDE_PANEL_ID: "reader-guide-panel",
  ReaderGuidePanel: ({
    onClose,
    onContinueReading,
    onGoToPassage,
  }: {
    onClose: () => void;
    onContinueReading: () => void;
    onGoToPassage: () => void;
  }) => (
    <div data-testid="reader-guide-panel">
      <button type="button" onClick={onClose}>
        Cerrar
      </button>
      <button type="button" onClick={onContinueReading}>
        Continuar leyendo
      </button>
      <button type="button" onClick={onGoToPassage}>
        Volver al pasaje
      </button>
    </div>
  ),
}));

const mediaItem = (
  kind: ChapterMediaSummary["kind"],
  mediaKey: string,
): ChapterMediaSummary => ({
  mediaKey,
  mediaVersion: 1,
  kind,
  title: kind,
  description: "d",
  durationSec: null,
  availability: "AVAILABLE",
  hasTranscript: false,
  hasCaptions: false,
  chapters: [],
});

let fetchSpy: MockInstance<typeof fetch>;

function mockNetwork(items: ChapterMediaSummary[]) {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
  ) => {
    const url = String(input);
    if (url.includes("/media") && !url.includes("/access")) {
      return new Response(
        JSON.stringify({
          bookSlug: "emociones-en-construccion",
          chapterOrder: 1,
          items,
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 200 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
}

beforeEach(() => {
  class FakeIO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    FakeIO as unknown as typeof IntersectionObserver;
  Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0 }) as DOMRect;
  getGuideDiscovery.mockResolvedValue({
    available: true,
    guideKey: "eec-c1-cuerpo-antes-que-mente",
    guideVersion: 1,
  });
  mockPush.mockClear();
  window.localStorage.clear();
  mockNetwork([]);
});

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
  vi.restoreAllMocks();
});

function buildInitial(): LectorChapterResponse {
  return {
    book: {
      id: "book-1",
      slug: "emociones-en-construccion",
      title: "Emociones en Construcción",
      authorName: "Marina Quintana",
      cover: "c",
      totalChapters: 12,
    },
    chapter: {
      id: "ch-1",
      readerRef: { kind: "chapter", id: "ch-1" },
      order: 1,
      title: "El cuerpo sabe antes que la mente",
      subtitle: null,
      durationMinutes: 20,
      audioAvailable: true,
      partNumber: 1,
      partTitle: "Deconstruyendo lo que sabíamos",
    },
    blocks: [],
    lessons: [{ id: "l-1", title: "Nombrar sin cerrar", status: "available" }],
    preferences: {
      font: "serif",
      fontSize: 18,
      theme: "system",
      lineHeight: 1.6,
    },
    highlights: [],
    annotations: [],
    session: {
      lastBlockId: "b-1",
      progressPct: 0.5,
      timeSpentSec: 120,
      completedAt: null,
    },
  } as unknown as LectorChapterResponse;
}

/** The anchored chapter — the guide only becomes visible against it. */
function buildUnit(): ContentUnitRead {
  return {
    editionKey: "emociones-en-construccion-1e",
    revisionNumber: 2,
    unitKey: "unit-1",
    title: "El cuerpo sabe antes que la mente",
    summary: null,
    order: 1,
    partNumber: 1,
    partTitle: "Deconstruyendo lo que sabíamos",
    source: "content-core",
    blocks: [
      {
        blockKey: "bk-h",
        legacyBlockId: "b-h",
        blockVersionId: "bv-h",
        kind: "HEADING",
        order: 0,
        content: GUIDE_READER_ANCHOR.sourceHeading,
        meta: null,
      },
      {
        blockKey: "bk-p",
        legacyBlockId: "b-p",
        blockVersionId: "bv-p",
        kind: "PARAGRAPH",
        order: 1,
        content: `Un preámbulo. ${GUIDE_READER_ANCHOR.passageLastSentence}`,
        meta: null,
      },
      {
        blockKey: "bk-1",
        legacyBlockId: "b-1",
        blockVersionId: "bv-1",
        kind: "PARAGRAPH",
        order: 2,
        content: "El cuerpo se adelanta.",
        meta: null,
      },
    ],
  } as unknown as ContentUnitRead;
}

const renderReader = () =>
  render(
    <GuideAvailabilityProvider available>
      <GuideActorScopeProvider scope={"A".repeat(43)}>
        <LectorShell
          apiBase="https://api.example/api"
          token="bearer-stub"
          bookSlug="emociones-en-construccion"
          initial={buildInitial()}
          unit={buildUnit()}
          marks={null}
        />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>,
  );

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Land on a media mode with the guide open over it. */
async function openGuideFrom(mode: "escuchar" | "ver") {
  renderReader();
  await settle();
  fireEvent.click(screen.getByTestId(`reader-mode-${mode}`));
  await settle();
  await waitFor(() => screen.getByTestId("reader-mode-guiada"));
  fireEvent.click(screen.getByTestId("reader-mode-guiada"));
  await settle();
  expect(screen.getByTestId("reader-guide-panel")).toBeInTheDocument();
}

const stored = () =>
  storedToMode(window.localStorage.getItem("psico:lector:mode"));

/** Anything that would end a run, clear recovery, or record an event. */
const writeCalls = () =>
  fetchSpy.mock.calls.filter((c) => {
    const method = (c[1] as RequestInit | undefined)?.method ?? "GET";
    return method !== "GET";
  });

describe("Closing the guide is not continuing to read — from Escuchar", () => {
  beforeEach(() => mockNetwork([mediaItem("AUDIOBOOK", "a1")]));

  it("Cerrar gives the audiobook back", async () => {
    await openGuideFrom("escuchar");
    fireEvent.click(screen.getByText("Cerrar"));
    await settle();

    expect(screen.getByTestId("listen-surface")).toBeInTheDocument();
    expect(screen.queryByTestId("reader-experience-view")).toBeNull();
    expect(screen.getByTestId("reader-mode-escuchar")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(stored()).toBe("escuchar");
  });

  it("CONTINUE_READING_FROM_LISTEN_RESULT=leer", async () => {
    await openGuideFrom("escuchar");
    fireEvent.click(screen.getByText("Continuar leyendo"));
    await settle();

    expect(screen.getByTestId("reader-experience-view")).toBeInTheDocument();
    expect(screen.queryByTestId("listen-surface")).toBeNull();
    expect(screen.getByTestId("reader-mode-leer")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The reader said it out loud, so it is theirs on the next chapter too.
    expect(stored()).toBe("leer");
  });
});

describe("Closing the guide is not continuing to read — from Ver", () => {
  beforeEach(() => mockNetwork([mediaItem("VIDEO", "v1")]));

  it("Cerrar gives the video back", async () => {
    await openGuideFrom("ver");
    fireEvent.click(screen.getByText("Cerrar"));
    await settle();

    expect(screen.getByTestId("watch-surface")).toBeInTheDocument();
    expect(screen.queryByTestId("reader-experience-view")).toBeNull();
    expect(screen.getByTestId("reader-mode-ver")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(stored()).toBe("ver");
  });

  it("CONTINUE_READING_FROM_VIDEO_RESULT=leer", async () => {
    await openGuideFrom("ver");
    fireEvent.click(screen.getByText("Continuar leyendo"));
    await settle();

    expect(screen.getByTestId("reader-experience-view")).toBeInTheDocument();
    expect(screen.queryByTestId("watch-surface")).toBeNull();
    expect(screen.getByTestId("reader-mode-leer")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(stored()).toBe("leer");
  });
});

describe("«Volver al pasaje» is a third thing", () => {
  beforeEach(() => mockNetwork([mediaItem("AUDIOBOOK", "a1")]));

  it("GUIDE_RETURN_TO_PASSAGE_KEEPS_PANEL_OPEN=true", async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    await openGuideFrom("escuchar");

    fireEvent.click(screen.getByText("Volver al pasaje"));
    await settle();

    // The panel stays. It is a look, not an exit.
    expect(screen.getByTestId("reader-guide-panel")).toBeInTheDocument();
    expect(screen.getByTestId("reader-experience-view")).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalled();
    // …and it does not become a mode change, a route change or a mark.
    expect(stored()).toBe("escuchar");
    expect(mockPush).not.toHaveBeenCalled();
    expect(
      fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/highlights")),
    ).toHaveLength(0);
  });

  it("the focused block is the anchored passage", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await openGuideFrom("escuchar");
    fireEvent.click(screen.getByText("Volver al pasaje"));
    await settle();

    expect(document.activeElement).toHaveAttribute("data-block-id", "b-p");
  });
});

describe("Neither action ends anything", () => {
  beforeEach(() => mockNetwork([mediaItem("AUDIOBOOK", "a1")]));

  it("GUIDE_SESSION_CANCELLED=false · GUIDE_RECOVERY_CLEARED=false · NEW_EVENTS=0", async () => {
    await openGuideFrom("escuchar");
    fetchSpy.mockClear();

    fireEvent.click(screen.getByText("Continuar leyendo"));
    await settle();

    // No DELETE, no POST, no PATCH: nothing was ended, cleared or recorded.
    expect(writeCalls()).toHaveLength(0);
  });

  it("ROUTE_CHANGED=false · PROGRESS_RESET=false", async () => {
    await openGuideFrom("escuchar");
    fireEvent.click(screen.getByText("Continuar leyendo"));
    await settle();

    expect(mockPush).not.toHaveBeenCalled();
    // The bar still reads what the session said.
    expect(
      document.querySelector<HTMLElement>('[style*="width: 50%"]'),
    ).not.toBeNull();
  });
});
