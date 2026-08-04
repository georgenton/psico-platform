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
import { GuideAvailabilityProvider } from "../guide/guide-availability";
import { GuideActorScopeProvider } from "../guide/guide-actor-scope";
import type * as ApiClientModule from "@psico/api-client";

/**
 * Book Experience V2 — vertical 1: Chapter Home + Reader Experience.
 *
 * Two things are under test and they are really one thing.
 *
 * The FIRST is the chapter home: a list of the ways through this chapter,
 * derived from what the reader already resolved. Its rules are the standard's:
 * a format nobody announced has no row, an announced-but-unproduced one has a
 * row that says so and does not open, and the number of rows is whatever the
 * chapter has — never a layout that assumes four.
 *
 * The SECOND is the separation this vertical exists to fix. The chapter text,
 * its activities, its exercises list and «Marcar capítulo como leído» used to
 * render unconditionally, so choosing Escuchar gave you the player AND the whole
 * chapter under it. Those assertions are the negative ones below, and they are
 * the reason the reading composition now lives in its own component.
 */

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: mockPush }),
}));

/** Guide discovery. Per-test: an answer, or «this chapter has no guide». */
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

const mediaItem = (
  kind: ChapterMediaSummary["kind"],
  mediaKey: string,
  availability: ChapterMediaSummary["availability"] = "AVAILABLE",
): ChapterMediaSummary => ({
  mediaKey,
  mediaVersion: 1,
  kind,
  title: kind,
  description: "d",
  durationSec: null,
  availability,
  hasTranscript: false,
  hasCaptions: false,
  chapters: [],
});

let fetchSpy: MockInstance<typeof fetch>;
/** Every manifest request this render made. One chapter, one manifest. */
let manifestCalls: string[];

/** Serve a manifest with exactly these items; answer everything else 200 {}. */
function mockNetwork(items: ChapterMediaSummary[]) {
  manifestCalls = [];
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
  ) => {
    const url = String(input);
    if (url.includes("/media") && !url.includes("/access")) {
      manifestCalls.push(url);
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
  getGuideDiscovery.mockResolvedValue({ available: false });
  mockPush.mockClear();
  window.localStorage.clear();
  mockNetwork([]);
});

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
  vi.restoreAllMocks();
});

function buildInitial(audioAvailable = false): LectorChapterResponse {
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
      order: 1,
      title: "El cuerpo sabe antes que la mente",
      subtitle: null,
      durationMinutes: 20,
      audioAvailable,
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

/**
 * `anchored` adds the heading + sentence the Emociones guide anchors to. The
 * reader only offers a guide once discovery, the bundle AND the anchor all
 * resolve against the blocks it was actually served, so a test about the guided
 * row has to serve a chapter the guide is really about.
 */
function buildUnit(anchored = false): ContentUnitRead {
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
      ...(anchored
        ? [
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
          ]
        : []),
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

/**
 * `guidePilot` mirrors production: discovery is only asked for a reader the
 * pilot gate lets in, so a test about the guided row has to say so.
 * `audioAvailable` is the chapter envelope's own flag — the audiobook panel
 * needs it as well as a manifest item.
 */
const renderReader = ({
  guidePilot = false,
  audioAvailable = false,
}: { guidePilot?: boolean; audioAvailable?: boolean } = {}) => {
  const shell = (
    <LectorShell
      apiBase="https://api.example/api"
      token="bearer-stub"
      bookSlug="emociones-en-construccion"
      initial={buildInitial(audioAvailable)}
      unit={buildUnit(guidePilot)}
      marks={null}
    />
  );
  return render(
    guidePilot ? (
      <GuideAvailabilityProvider available>
        <GuideActorScopeProvider scope={"A".repeat(43)}>
          {shell}
        </GuideActorScopeProvider>
      </GuideAvailabilityProvider>
    ) : (
      shell
    ),
  );
};

/** Settle the manifest + discovery promises the shell fires on mount. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const openHome = () =>
  fireEvent.click(screen.getByTestId("reader-open-chapter-home"));

const routeKeys = () =>
  screen
    .getAllByTestId(/^chapter-route-/)
    .map((el) => el.getAttribute("data-testid")!.replace("chapter-route-", ""));

// ── Chapter Home ──────────────────────────────────────────────────────────

describe("Chapter Home — what the chapter offers", () => {
  it("1 · «Seguir leyendo» is the primary action", async () => {
    renderReader();
    await settle();
    openHome();
    expect(screen.getByTestId("chapter-home-continue")).toHaveTextContent(
      "Seguir leyendo",
    );
  });

  it("2 · a chapter with only the book shows exactly one route", async () => {
    renderReader();
    await settle();
    openHome();
    expect(routeKeys()).toEqual(["leer", "actividades"]);
  });

  it("3 · book + audiobook shows Escuchar", async () => {
    mockNetwork([mediaItem("AUDIOBOOK", "a1")]);
    renderReader();
    await settle();
    openHome();
    expect(routeKeys()).toContain("escuchar");
    expect(screen.getByTestId("chapter-route-escuchar")).toHaveAttribute(
      "data-enabled",
      "true",
    );
  });

  it("4 · a podcast with no audiobook still opens Escuchar — it is the audio family", async () => {
    mockNetwork([mediaItem("PODCAST", "p1")]);
    renderReader();
    await settle();
    openHome();
    expect(screen.getByTestId("chapter-route-escuchar")).toHaveAttribute(
      "data-enabled",
      "true",
    );
  });

  it("5 · video without podcast shows Ver and no Escuchar", async () => {
    mockNetwork([mediaItem("VIDEO", "v1")]);
    renderReader();
    await settle();
    openHome();
    expect(routeKeys()).toContain("ver");
    expect(routeKeys()).not.toContain("escuchar");
  });

  it("6 · a guided experience the server confirmed gets its own row", async () => {
    getGuideDiscovery.mockResolvedValue({
      available: true,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
    renderReader({ guidePilot: true });
    await settle();
    openHome();
    await waitFor(() => expect(routeKeys()).toContain("guiada"));
  });

  it("7 · no guide for this chapter means no guided row at all", async () => {
    renderReader();
    await settle();
    openHome();
    expect(screen.queryByTestId("chapter-route-guiada")).toBeNull();
  });

  it("8 · UNKNOWN_MODE=HIDDEN — a format nobody announced has no row", async () => {
    // The manifest is empty: neither audio nor video is part of this chapter's
    // editorial plan. A grey row would be an offer we cannot make.
    renderReader();
    await settle();
    openHome();
    expect(screen.queryByTestId("chapter-route-escuchar")).toBeNull();
    expect(screen.queryByTestId("chapter-route-ver")).toBeNull();
  });

  it("9 · COMING_SOON_MODE=VISIBLE_DISABLED — announced, said so, not clickable", async () => {
    mockNetwork([mediaItem("VIDEO", "v1", "COMING_SOON")]);
    renderReader();
    await settle();
    openHome();
    const row = screen.getByTestId("chapter-route-ver");
    expect(row).toHaveAttribute("data-enabled", "false");
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row).toHaveTextContent("Próximamente");
    // Pressing it changes nothing: the home stays, no mode is adopted.
    fireEvent.click(row);
    await settle();
    expect(screen.getByTestId("chapter-experience-home")).toBeInTheDocument();
  });

  it("10 · the row count follows the chapter, not a fixed layout", async () => {
    mockNetwork([mediaItem("AUDIOBOOK", "a1"), mediaItem("VIDEO", "v1")]);
    renderReader();
    await settle();
    openHome();
    expect(routeKeys()).toEqual(["leer", "escuchar", "ver", "actividades"]);
    expect(screen.getByText("4 ramas")).toBeInTheDocument();
  });
});

// ── Reader Experience ─────────────────────────────────────────────────────

describe("Reader Experience — reading keeps everything it had", () => {
  it("11–14 · text, activities, exercises list and the complete CTA are all in Leer", async () => {
    renderReader();
    await settle();
    expect(screen.getByTestId("reader-experience-view")).toBeInTheDocument();
    expect(screen.getByText("El cuerpo se adelanta.")).toBeInTheDocument();
    // Curated activities for (emociones-en-construccion, 1).
    expect(
      screen.getByText("Actividades de este capítulo"),
    ).toBeInTheDocument();
    // The chapter's lessons list.
    expect(screen.getByText("Nombrar sin cerrar")).toBeInTheDocument();
    expect(
      screen.getByText("✓ Marcar capítulo como leído"),
    ).toBeInTheDocument();
  });

  it("15 · the notes affordance still opens the companion dock", async () => {
    renderReader();
    await settle();
    fireEvent.click(screen.getByLabelText("Abrir panel del lector"));
    expect(
      await screen.findByLabelText("Panel del lector: Eco, Notas y Reflexión"),
    ).toBeInTheDocument();
  });

  it("16 · reading progress is not reset by looking at the chapter home", async () => {
    renderReader();
    await settle();
    const before = document.querySelector<HTMLElement>('[style*="width: 50%"]');
    expect(before).not.toBeNull();
    openHome();
    openHome(); // back to the reader
    await settle();
    expect(
      document.querySelector<HTMLElement>('[style*="width: 50%"]'),
    ).not.toBeNull();
  });

  it("17 · «Marcar capítulo como leído» still posts", async () => {
    renderReader();
    await settle();
    fireEvent.click(screen.getByText("✓ Marcar capítulo como leído"));
    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some((c) => String(c[0]).includes("complete")),
      ).toBe(true),
    );
  });
});

// ── The separation this vertical exists for ───────────────────────────────

describe("Modality separation — one surface at a time", () => {
  it("18–19 · Escuchar shows the player and NOT the chapter text or its footer", async () => {
    mockNetwork([mediaItem("AUDIOBOOK", "a1")]);
    renderReader();
    await settle();
    fireEvent.click(screen.getByTestId("reader-mode-escuchar"));
    await settle();

    expect(screen.queryByTestId("reader-experience-view")).toBeNull();
    expect(screen.queryByText("El cuerpo se adelanta.")).toBeNull();
    expect(screen.queryByText("✓ Marcar capítulo como leído")).toBeNull();
    expect(screen.queryByText("Nombrar sin cerrar")).toBeNull();
    expect(screen.queryByText("Actividades de este capítulo")).toBeNull();
  });

  it("20–21 · Ver shows the video surface and NOT the chapter text or its footer", async () => {
    mockNetwork([mediaItem("VIDEO", "v1")]);
    renderReader();
    await settle();
    fireEvent.click(screen.getByTestId("reader-mode-ver"));
    await settle();

    expect(screen.queryByTestId("reader-experience-view")).toBeNull();
    expect(screen.queryByText("El cuerpo se adelanta.")).toBeNull();
    expect(screen.queryByText("✓ Marcar capítulo como leído")).toBeNull();
  });

  it("22 · MANIFEST_REQUESTS_PER_READER_CHAPTER=1 across every surface", async () => {
    mockNetwork([mediaItem("AUDIOBOOK", "a1"), mediaItem("VIDEO", "v1")]);
    renderReader();
    await settle();
    fireEvent.click(screen.getByTestId("reader-mode-escuchar"));
    await settle();
    fireEvent.click(screen.getByTestId("reader-mode-ver"));
    await settle();
    openHome();
    await settle();
    expect(manifestCalls).toHaveLength(1);
  });

  it("23 · no empty-state flash — a chapter WITH audio never shows «Audio en producción»", async () => {
    mockNetwork([mediaItem("AUDIOBOOK", "a1")]);
    renderReader({ audioAvailable: true });
    await settle();
    fireEvent.click(screen.getByTestId("reader-mode-escuchar"));
    expect(screen.queryByText("Audio en producción")).toBeNull();
    await settle();
    expect(screen.queryByText("Audio en producción")).toBeNull();
  });

  it("24 · RETURN_TO_CHAPTER_HOME=true — and «Seguir leyendo» brings the text back", async () => {
    renderReader();
    await settle();
    openHome();
    expect(screen.getByTestId("chapter-experience-home")).toBeInTheDocument();
    expect(screen.queryByTestId("reader-experience-view")).toBeNull();

    fireEvent.click(screen.getByTestId("chapter-home-continue"));
    await settle();
    expect(screen.getByTestId("reader-experience-view")).toBeInTheDocument();
    expect(screen.queryByTestId("chapter-experience-home")).toBeNull();
  });

  it("25 · DIRECT_READER_ACCESS=true — opening a chapter lands on the text", async () => {
    renderReader();
    // Before any promise settles: the text is already the surface. Nobody who
    // just wants to read has to pass a menu first.
    expect(screen.getByTestId("reader-experience-view")).toBeInTheDocument();
    expect(screen.queryByTestId("chapter-experience-home")).toBeNull();
    await settle();
    expect(screen.getByTestId("reader-experience-view")).toBeInTheDocument();
  });
});

// ── Privacy ───────────────────────────────────────────────────────────────

describe("Privacy — vertical 1 writes nothing new", () => {
  it("26–27 · walking the chapter home writes no mood, map or resonance", async () => {
    mockNetwork([mediaItem("AUDIOBOOK", "a1")]);
    renderReader();
    await settle();
    openHome();
    fireEvent.click(screen.getByTestId("chapter-route-escuchar"));
    await settle();
    openHome();
    fireEvent.click(screen.getByTestId("chapter-home-continue"));
    await settle();

    const posted = fetchSpy.mock.calls
      .filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
      .map((c) => String(c[0]));
    for (const path of ["/mood", "/emotional-map", "/resonances"]) {
      expect(posted.filter((u) => u.includes(path))).toHaveLength(0);
    }
  });

  it("28 · the chapter home carries no diagnosis, score or debt", async () => {
    mockNetwork([mediaItem("AUDIOBOOK", "a1")]);
    renderReader();
    await settle();
    openHome();
    const text =
      screen.getByTestId("chapter-experience-home").textContent ?? "";
    for (const banned of [
      "comprensión emocional",
      "puntaje",
      "nivel de calma",
      "te faltan",
      "racha",
      "notamos que",
      "pareces",
    ]) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });

  it("29 · the chapter home shows no private content", async () => {
    renderReader();
    await settle();
    openHome();
    const text =
      screen.getByTestId("chapter-experience-home").textContent ?? "";
    // Reflections and notes are the reader's; the map of a chapter never
    // quotes them.
    expect(text).not.toContain("Reflexión");
    expect(text).not.toContain("Nota");
  });
});

// ── Closure pass: the four boundaries found in review ──────────────────────

/** Count only the reading heartbeat, which is a PATCH to `/lector/session`. */
const readingBeats = () =>
  fetchSpy.mock.calls.filter(
    (c) =>
      String(c[0]).includes("/lector/session") &&
      (c[1] as RequestInit | undefined)?.method === "PATCH",
  ).length;

/** Let the 5 s interval fire `n` times under fake timers. */
async function tick(n = 3) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(n * 5_000);
  });
}

/**
 * `waitFor` schedules on real timers, so under `useFakeTimers` it just hangs.
 * This drains microtasks by advancing the fake clock by nothing, which is what
 * the discovery → bundle → anchor chain needs to resolve.
 */
async function settleFake(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

describe("Reading signal — other modes are not reading time", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("READ_MODE_READING_HEARTBEATS>0 — reading still beats", async () => {
    renderReader();
    await tick(2);
    expect(readingBeats()).toBeGreaterThan(0);
  });

  it("CHAPTER_HOME_READING_HEARTBEATS=0", async () => {
    renderReader();
    await tick(1);
    openHome();
    fetchSpy.mockClear();
    await tick(4);
    expect(readingBeats()).toBe(0);
  });

  it("LISTEN_MODE_READING_HEARTBEATS=0 — twenty minutes of audio is not reading", async () => {
    mockNetwork([mediaItem("AUDIOBOOK", "a1")]);
    renderReader({ audioAvailable: true });
    await tick(1);
    fireEvent.click(screen.getByTestId("reader-mode-escuchar"));
    fetchSpy.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60_000);
    });
    expect(readingBeats()).toBe(0);
  });

  it("VIDEO_MODE_READING_HEARTBEATS=0", async () => {
    mockNetwork([mediaItem("VIDEO", "v1")]);
    renderReader();
    await tick(1);
    fireEvent.click(screen.getByTestId("reader-mode-ver"));
    fetchSpy.mockClear();
    await tick(6);
    expect(readingBeats()).toBe(0);
  });

  it("GUIDE_OPEN_READING_HEARTBEATS=0", async () => {
    getGuideDiscovery.mockResolvedValue({
      available: true,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
    renderReader({ guidePilot: true });
    await settleFake();
    fireEvent.click(screen.getByTestId("reader-mode-guiada"));
    fetchSpy.mockClear();
    await tick(6);
    expect(readingBeats()).toBe(0);
  });
});

describe("Chapter Home — activities row and units", () => {
  it("ACTIVITIES_ROUTE opens the reader AND lands on the section, focused, same route", async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    renderReader();
    await settle();
    openHome();

    const row = screen.getByTestId("chapter-route-actividades");
    expect(row).toHaveTextContent("Actividades y ejercicios");
    fireEvent.click(row);
    await settle();

    // ACTIVITIES_ROUTE_OPENS_READER
    expect(screen.getByTestId("reader-experience-view")).toBeInTheDocument();
    const section = screen.getByTestId("reader-activities-section");
    // ACTIVITIES_SECTION_FULLY_VISIBLE — scrolled into view, at its start.
    expect(scrollSpy).toHaveBeenCalledWith({ block: "start" });
    // ACTIVITIES_SECTION_FOCUSED
    expect(document.activeElement).toBe(section);
    // ACTIVITIES_ROUTE_CHANGED=false — no navigation was attempted.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("the count folds curated activities and chapter exercises without double-counting", async () => {
    // The fixture's lesson is «Nombrar sin cerrar»; the curated catalog for
    // (emociones-en-construccion, 1) contributes its own two. Three cards, so
    // three is what the row must say.
    renderReader();
    await settle();
    openHome();
    expect(screen.getByTestId("chapter-route-actividades")).toHaveTextContent(
      "3 en el capítulo",
    );
  });

  it("AUDIO_ITEM_COUNT_LABEL_CORRECT — audio is counted as audio", async () => {
    mockNetwork([mediaItem("AUDIOBOOK", "a1")]);
    renderReader();
    await settle();
    openHome();
    expect(screen.getByTestId("chapter-route-escuchar")).toHaveTextContent(
      "1 contenido de audio",
    );
  });

  it("VIDEO_COUNT_USES_PISTAS=false — videos are videos", async () => {
    mockNetwork([mediaItem("VIDEO", "v1"), mediaItem("VIDEO", "v2")]);
    renderReader();
    await settle();
    openHome();
    const row = screen.getByTestId("chapter-route-ver");
    expect(row).toHaveTextContent("2 videos");
    expect(row.textContent ?? "").not.toContain("pista");
  });
});

describe("Chapter Home — reader controls and overlays", () => {
  it("hides the reading controls: Aa, the mini player and the notes counter", async () => {
    mockNetwork([mediaItem("AUDIOBOOK", "a1")]);
    renderReader({ audioAvailable: true });
    await settle();
    expect(screen.getByLabelText("Preferencias de lectura")).toBeVisible();

    openHome();
    expect(screen.getByLabelText("Preferencias de lectura")).not.toBeVisible();
    expect(screen.getByLabelText("Abrir panel del lector")).not.toBeVisible();
    expect(screen.queryByTestId("audio-bar")).toBeNull();
  });

  it("the Recorrido control is reachable, named and reversible", async () => {
    renderReader();
    await settle();
    const btn = screen.getByTestId("reader-open-chapter-home");
    expect(btn).toHaveAccessibleName("Cómo recorrerlo");
    expect(btn.style.minHeight).toBe("44px");
    expect(btn.style.minWidth).toBe("44px");

    fireEvent.click(btn);
    expect(btn).toHaveAccessibleName("Volver al lector");
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("entering the home closes the dock and clears the selection, without ending anything", async () => {
    renderReader();
    await settle();

    // Open the dock, then walk to the chapter home.
    fireEvent.click(screen.getByLabelText("Abrir panel del lector"));
    expect(
      await screen.findByLabelText("Panel del lector: Eco, Notas y Reflexión"),
    ).toBeInTheDocument();

    openHome();
    await settle();
    expect(
      screen.queryByLabelText("Panel del lector: Eco, Notas y Reflexión"),
    ).toBeNull();
    expect(window.getSelection()?.toString() ?? "").toBe("");

    // GUIDE_SESSION_CANCELLED=false — nothing was DELETEd or abandoned.
    const destructive = fetchSpy.mock.calls.filter((c) => {
      const m = (c[1] as RequestInit | undefined)?.method;
      return m === "DELETE" || String(c[0]).includes("/abandon");
    });
    expect(destructive).toHaveLength(0);
    // PROGRESS_RESET=false — the bar still reads what the session said.
    expect(
      document.querySelector<HTMLElement>('[style*="width: 50%"]'),
    ).not.toBeNull();
    // ROUTE_CHANGED=false
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("closing the guided panel on the way in never ends its session", async () => {
    getGuideDiscovery.mockResolvedValue({
      available: true,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
    renderReader({ guidePilot: true });
    await settle();
    await waitFor(() => screen.getByTestId("reader-mode-guiada"));
    fireEvent.click(screen.getByTestId("reader-mode-guiada"));
    await settle();

    openHome();
    await settle();
    expect(screen.getByTestId("reader-mode-guiada")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    const destructive = fetchSpy.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
    );
    expect(destructive).toHaveLength(0);
  });
});
