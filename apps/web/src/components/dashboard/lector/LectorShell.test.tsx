import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  renderHook,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type {
  ContentUnitMarks,
  ContentUnitRead,
  LectorChapterResponse,
} from "@psico/types";
import { LectorShell } from "./LectorShell";
import { useChapterMediaManifest } from "./media/use-chapter-media";
import { GuideAvailabilityProvider } from "../guide/guide-availability";
import { GuideActorScopeProvider } from "../guide/guide-actor-scope";
import type * as ApiClientModule from "@psico/api-client";

/**
 * Smoke tests for the LectorShell orchestrator (Sprint 3 del roadmap + CC-6B).
 *
 * The component owns highlights / annotations / progress + heartbeat lifecycle.
 * CC-6B: the chapter's BLOCK TEXT now comes from a Content Core `unit` prop
 * (resolved SSR by page.tsx); the lector envelope keeps book/session/prefs/
 * marks/audio. We mock all network calls (the Lector uses raw `fetch`, not the
 * apiClient wrapper, because the access token is passed in as a prop). We mock
 * the AudioBar — covered by its own test file, and it triggers `<audio>`
 * loading which jsdom doesn't implement.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

/**
 * GR-4 — the reader now ASKS the server which guide this chapter implies.
 * These tests are about the reader's gating, so discovery answers with the
 * Emociones pin (the book they render) and the interesting variations live in
 * `LectorShell.discovery.test.tsx`.
 */
const getGuideDiscovery = vi.fn(
  async (_bookSlug: string, _chapterOrder: number) => ({
    available: true as const,
    guideKey: "eec-c1-cuerpo-antes-que-mente",
    guideVersion: 1,
  }),
);

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      ...actual.guideApi,
      getGuideDiscovery: (bookSlug: string, chapterOrder: number) =>
        getGuideDiscovery(bookSlug, chapterOrder),
    },
  };
});

vi.mock("./AudioBar", () => ({
  AudioBar: () => null,
}));

// IntersectionObserver isn't in jsdom. Stub a no-op that records observers
// so the cleanup path doesn't blow up either.
beforeEach(() => {
  class FakeIO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    FakeIO as unknown as typeof IntersectionObserver;
  vi.spyOn(globalThis, "fetch").mockImplementation(
    withMediaManifest(() => new Response("{}", { status: 200 })),
  );
  // jsdom's Range has no layout — the selection handler reads a bounding rect.
  Range.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    }) as DOMRect;
});

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
  vi.restoreAllMocks();
});

/**
 * Book Experience Standard V1 — the reader now asks for the chapter media
 * manifest on mount, so a mode with nothing playable can be disabled BEFORE
 * the reader picks it. These tests are about other things (hydration, the
 * write path), so the default answer is a chapter that genuinely has both
 * formats: without it every mode would correctly read as unavailable and the
 * assertions below would pass for the wrong reason.
 */
function mediaManifestBody() {
  const item = (kind: string, mediaKey: string) => ({
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
  return {
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    items: [item("AUDIOBOOK", "a1"), item("VIDEO", "v1")],
  };
}

/** Route the media manifest; hand everything else to the test's own answer. */
function withMediaManifest(
  rest: (input: RequestInfo | URL) => Response | Promise<Response>,
) {
  return async (input: RequestInfo | URL) => {
    if (String(input).includes("/media")) {
      return new Response(JSON.stringify(mediaManifestBody()), { status: 200 });
    }
    return rest(input);
  };
}

function buildInitial(
  overrides: Partial<LectorChapterResponse> = {},
): LectorChapterResponse {
  return {
    book: {
      id: "book-1",
      slug: "emociones-en-construccion",
      title: "Emociones en Construcción",
      totalChapters: 12,
    },
    chapter: {
      id: "ch-1",
      readerRef: { kind: "chapter", id: "ch-1" },
      order: 1,
      title: "El primer paso",
      description: "subtitle",
      durationMinutes: 8,
      audioAvailable: false,
    },
    // CC-6B: envelope blocks are ignored by the shell (text comes from `unit`).
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
      lastBlockId: "b-1",
      progressPct: 0.25,
      timeSpentSec: 120,
      completedAt: null,
    },
    ...overrides,
  } as LectorChapterResponse;
}

// A Content Core unit whose blocks carry both the legacy anchor (b-1/b-2, so
// existing marks keep matching) and a stable blockKey (the write identity).
function buildUnit(
  source: "content-core" | "legacy" = "content-core",
): ContentUnitRead {
  return {
    editionKey: "emociones-en-construccion-1e",
    revisionNumber: source === "legacy" ? null : 2,
    unitKey: "unit-1",
    title: "El primer paso",
    summary: null,
    order: 1,
    partNumber: 1,
    partTitle: "Parte 1",
    source,
    blocks: [
      {
        blockKey: "bk-1",
        legacyBlockId: "b-1",
        blockVersionId: source === "legacy" ? null : "bv-1",
        kind: "PARAGRAPH",
        order: 1,
        content: "Empieza así.",
        meta: null,
      },
      {
        blockKey: "bk-2",
        legacyBlockId: "b-2",
        blockVersionId: source === "legacy" ? null : "bv-2",
        kind: "PARAGRAPH",
        order: 2,
        content: "Y continúa con otro.",
        meta: null,
      },
    ],
  };
}

const renderShell = (
  overrides: Partial<LectorChapterResponse> = {},
  unit: ContentUnitRead | null = buildUnit(),
  marks: ContentUnitMarks | null = null,
  marksUnavailable = false,
) =>
  render(
    <LectorShell
      apiBase="https://api.example/api"
      token="bearer-stub"
      bookSlug="emociones-en-construccion"
      initial={buildInitial(overrides)}
      unit={unit}
      marks={marks}
      marksUnavailable={marksUnavailable}
    />,
  );

describe("LectorShell — header + blocks (from Content Core)", () => {
  it("renders the book and the chapter TITLE — never the platform order as a chapter number", () => {
    renderShell();
    expect(screen.getByText("Emociones en Construcción")).toBeInTheDocument();
    expect(screen.getByText("El primer paso")).toBeInTheDocument();
    // `Chapter.order` is an ordering key, not the book's own numbering. No
    // layer stores an editorial label yet, so the heading claims no number at
    // all rather than a plausible wrong one.
    expect(screen.queryByText(/Cap\.\s*\d/)).toBeNull();
    expect(screen.queryByText(/Capítulo\s*\d/)).toBeNull();
  });

  it("PAREJAS_READER_DOES_NOT_SHOW_PLATFORM_ORDER — the off-by-one book", () => {
    // «Parejas que Perduran» keeps its preface at order 1, so the book's own
    // chapter 1 arrives here as order 2. The header used to read «Cap. 2» on
    // the page whose title page says one.
    const { container } = renderShell({
      chapter: {
        id: "ch-2",
        readerRef: { kind: "chapter", id: "ch-2" },
        order: 2,
        title: "Cuando amar también sana",
        description: null,
        durationMinutes: 14,
        audioAvailable: false,
      },
    } as unknown as Partial<LectorChapterResponse>);
    expect(screen.getByText("Cuando amar también sana")).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Cap\.\s*\d/);
    expect(text).not.toMatch(/Capítulo\s*\d/);
  });

  it("renders every block's content from the content-core unit, in order", () => {
    renderShell();
    const emp = screen.getByText("Empieza así.");
    const cont = screen.getByText("Y continúa con otro.");
    expect(emp).toBeInTheDocument();
    expect(cont).toBeInTheDocument();
    // Order preserved (DOM position of the first block precedes the second).
    expect(
      emp.compareDocumentPosition(cont) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the same blocks when the unit is served from legacy", () => {
    renderShell({}, buildUnit("legacy"));
    expect(screen.getByText("Empieza así.")).toBeInTheDocument();
    expect(screen.getByText("Y continúa con otro.")).toBeInTheDocument();
  });

  it("does NOT fetch blocks from /api/lector on mount (unit is provided)", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        withMediaManifest(() => new Response("{}", { status: 200 })),
      );
    renderShell();
    // The media manifest lives under `/lector/:bookId/:order/media`, so the
    // assertion names the BLOCKS route it was always about: the chapter text
    // comes from the `unit` prop and must never be re-fetched.
    const calledForBlocks = fetchSpy.mock.calls.some((c) => {
      const url = String(c[0]);
      return url.includes("/lector/") && !url.includes("/media");
    });
    expect(calledForBlocks).toBe(false);
  });
});

describe("LectorShell — content unavailable (fail-closed, CC-6B)", () => {
  it("shows an unavailable state and no block text when the unit is null", () => {
    renderShell({}, null);
    expect(
      screen.getByText(/contenido temporalmente no disponible/i),
    ).toBeInTheDocument();
    // Fail-closed: it must NOT fall back to any legacy block text.
    expect(screen.queryByText("Empieza así.")).not.toBeInTheDocument();
    // A way back to the book is offered.
    expect(screen.getByText(/volver al libro/i)).toBeInTheDocument();
  });
});

describe("LectorShell — write path uses blockKey + source version (CC-6B/CC-6C)", () => {
  it("POSTs a highlight anchored by the stable blockKey + the read blockVersionId, not the legacy id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      withMediaManifest(
        () =>
          new Response(
            JSON.stringify({
              highlight: {
                id: "h-real",
                blockKey: "bk-1",
                blockId: "b-1",
                startOffset: 0,
                endOffset: 7,
                color: "YELLOW",
                note: null,
                createdAt: new Date().toISOString(),
              },
            }),
            { status: 200 },
          ),
      ),
    );

    const { container } = renderShell();

    // Drive a real text selection inside block b-1's `.reader-text`, then fire
    // the selectionchange the shell listens for.
    const blockEl = container.querySelector(
      '[data-block-id="b-1"]',
    ) as HTMLElement;
    const textSpan = blockEl.querySelector(".reader-text") as HTMLElement;
    const textNode = textSpan.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 7); // "Empieza"
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));

    // The popover appears; pick a colour → createHighlight fires.
    const swatch = await screen.findByRole("button", {
      name: /subrayar en amarillo/i,
    });
    fireEvent.click(swatch);

    await waitFor(() => {
      const highlightCall = fetchSpy.mock.calls.find((c) =>
        String(c[0]).endsWith("/highlights"),
      );
      expect(highlightCall).toBeTruthy();
      const body = JSON.parse(
        (highlightCall![1] as RequestInit).body as string,
      );
      expect(body.blockKey).toBe("bk-1");
      expect(body.blockId).toBeUndefined();
      // CC-6C: the exact version the reader saw travels with the write.
      expect(body.blockVersionId).toBe("bv-1");
    });
  });
});

describe("LectorShell — progress bar", () => {
  it("reflects the initial progressPct in the bar width", () => {
    const { container } = renderShell({
      session: {
        lastBlockId: "b-1",
        progressPct: 0.75,
        timeSpentSec: 0,
        completedAt: null,
      },
    } as unknown as Partial<LectorChapterResponse>);
    // Progress bar inner div has `width: 75%` style.
    const inner = container.querySelector('[style*="width: 75%"]');
    expect(inner).not.toBeNull();
  });
});

describe("LectorShell — marks from the CC-6C surface", () => {
  it("seeds annotations from the marks prop (not the lector envelope) when present", () => {
    renderShell(
      {
        annotations: [
          {
            id: "env-1",
            blockKey: "bk-1",
            blockId: "b-1",
            text: "Nota del envelope",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      } as unknown as Partial<LectorChapterResponse>,
      buildUnit(),
      {
        editionKey: "emociones-en-construccion-1e",
        unitKey: "unit-1",
        highlights: [],
        annotations: [
          {
            id: "mk-1",
            blockKey: "bk-1",
            blockId: "b-1",
            text: "Nota de la superficie CC-6C",
            createdAt: new Date() as unknown as string,
            updatedAt: new Date() as unknown as string,
          },
        ],
      } as unknown as ContentUnitMarks,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /abrir panel del lector/i }),
    );
    // The marks surface wins; the envelope's note is not used.
    expect(screen.getByText("Nota de la superficie CC-6C")).toBeInTheDocument();
    expect(screen.queryByText("Nota del envelope")).not.toBeInTheDocument();
  });
});

describe("LectorShell — companion dock (intact under CC-6B)", () => {
  it("is closed initially and opens on the Notas tab when the user taps the panel button", () => {
    renderShell(
      {
        annotations: [
          {
            id: "a-1",
            blockKey: "bk-1",
            blockId: "b-1",
            text: "Mi primera nota",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      } as unknown as Partial<LectorChapterResponse>,
      // CC-6D — a legacy unit sources its marks from the envelope, so this
      // envelope note is what the dock shows.
      buildUnit("legacy"),
    );

    // Closed initially — the dock returns null, so nothing inside it renders.
    expect(screen.queryByText("Mi primera nota")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /abrir panel del lector/i }),
    );

    // After opening, the dock shows its three tabs + the existing note.
    expect(screen.getByRole("tab", { name: /notas/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /reflexión/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /eco/i })).toBeInTheDocument();
    expect(screen.getByText("Mi primera nota")).toBeInTheDocument();
  });
});

describe("LectorShell — complete CTA copy", () => {
  // The CTA button is always present (the user can always finish on demand).
  // What flips at 0.9 is the helper sentence above it.
  it("shows the 'sigue leyendo' helper while progress is low", () => {
    renderShell({
      session: {
        lastBlockId: "b-1",
        progressPct: 0.25,
        timeSpentSec: 0,
        completedAt: null,
      },
    } as unknown as Partial<LectorChapterResponse>);
    expect(screen.getByText(/sigue leyendo a tu ritmo/i)).toBeInTheDocument();
    // Button is always present.
    expect(
      screen.getByRole("button", { name: /marcar capítulo como leído/i }),
    ).toBeInTheDocument();
  });

  it("shows the 'casi al final' helper once progress ≥ 0.9", () => {
    renderShell({
      session: {
        lastBlockId: "b-2",
        progressPct: 0.95,
        timeSpentSec: 200,
        completedAt: null,
      },
    } as unknown as Partial<LectorChapterResponse>);
    expect(screen.getByText(/casi al final/i)).toBeInTheDocument();
  });
});

describe("LectorShell — legacy-served unit writes by blockId (CC-6D)", () => {
  it("POSTs a highlight anchored by the legacy blockId, never blockKey/blockVersionId", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      withMediaManifest(
        () =>
          new Response(
            JSON.stringify({
              highlight: {
                id: "h-real",
                blockKey: "bk-1",
                blockId: "b-1",
                startOffset: 0,
                endOffset: 7,
                color: "YELLOW",
                note: null,
                createdAt: new Date().toISOString(),
              },
            }),
            { status: 200 },
          ),
      ),
    );

    const { container } = renderShell({}, buildUnit("legacy"));

    const blockEl = container.querySelector(
      '[data-block-id="b-1"]',
    ) as HTMLElement;
    const textSpan = blockEl.querySelector(".reader-text") as HTMLElement;
    const textNode = textSpan.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 7);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));

    const swatch = await screen.findByRole("button", {
      name: /subrayar en amarillo/i,
    });
    fireEvent.click(swatch);

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find((c) =>
        String(c[0]).endsWith("/highlights"),
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      // Legacy anchor only — no Content Core identity travels with the write.
      expect(body.blockId).toBe("b-1");
      expect(body.blockKey).toBeUndefined();
      expect(body.blockVersionId).toBeUndefined();
    });
  });
});

describe("LectorShell — marks read is source-aware + fail-closed (CC-6D)", () => {
  const envelopeNote = {
    id: "a-env",
    blockKey: "bk-1",
    blockId: "b-1",
    text: "Nota del envelope",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("a legacy unit sources its marks from the envelope (no banner)", () => {
    renderShell(
      {
        annotations: [envelopeNote],
      } as unknown as Partial<LectorChapterResponse>,
      buildUnit("legacy"),
    );
    expect(
      screen.queryByText(/no pudimos cargar tus marcas/i),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /abrir panel del lector/i }),
    );
    expect(screen.getByText("Nota del envelope")).toBeInTheDocument();
  });

  it("a content-core unit whose marks read failed shows a banner and NEVER the envelope's marks", () => {
    renderShell(
      {
        annotations: [envelopeNote],
      } as unknown as Partial<LectorChapterResponse>,
      buildUnit("content-core"),
      null, // no marks — the read failed
      true, // marksUnavailable
    );
    // Visible, non-destructive unavailable state.
    expect(
      screen.getByText(/no pudimos cargar tus marcas/i),
    ).toBeInTheDocument();
    // Fail-closed: the envelope note is NOT shown, even after opening the panel.
    fireEvent.click(
      screen.getByRole("button", { name: /abrir panel del lector/i }),
    );
    expect(screen.queryByText("Nota del envelope")).not.toBeInTheDocument();
  });
});

describe("LectorShell — reader mode is hydration-safe", () => {
  /**
   * Regression: the mode used to be seeded from `localStorage` inside the
   * `useState` initialiser. The server has no `localStorage`, so it rendered
   * Leer while the first client render rendered the saved mode — React reported
   * a text-content mismatch, discarded the server HTML for the whole document,
   * and in development painted an error indicator over the reader. That is what
   * put a red «1 error» into a GR-2 evidence capture.
   *
   * The contract: the FIRST render always matches the server (Leer), and the
   * saved preference is adopted afterwards, in an effect.
   */
  it("server-renders Leer even when another mode is stored on the client", () => {
    // The server has no `localStorage`; if the component ever consults it while
    // producing markup, this string would disagree with the client's first
    // render and React would throw the server HTML away.
    window.localStorage.setItem("psico:lector:mode", "ver");
    const html = renderToString(
      <LectorShell
        apiBase="https://api.example/api"
        token="bearer-stub"
        bookSlug="emociones-en-construccion"
        initial={buildInitial()}
        unit={buildUnit()}
        marks={null}
        marksUnavailable={false}
      />,
    );
    const leerSelected =
      /aria-selected="true"[^>]*>[^<]*(?:<[^>]+>)*[^<]*Leer/.test(html);
    expect(html).toContain('aria-label="Modo de lectura"');
    expect(leerSelected || !html.includes("Ver</button>")).toBe(true);
    // The decisive part: the stored mode must NOT appear as selected.
    //
    // Book Experience Standard V1 makes this doubly true on the server. There
    // is no `localStorage` AND no media manifest during SSR, so Escuchar and
    // Ver are not merely unselected — they are not offered at all. Asserting on
    // the Ver tab's position would now assert on markup that legitimately does
    // not exist, so the claim is stated directly: exactly one tab is selected
    // in the mode strip, and it is Leer.
    const modeTabs =
      html.match(/data-testid="reader-mode-(leer|escuchar|ver)"/g) ?? [];
    expect(modeTabs).toContain('data-testid="reader-mode-leer"');
    expect(modeTabs).not.toContain('data-testid="reader-mode-ver"');
    expect(html).not.toMatch(
      /data-testid="reader-mode-ver"[^>]*aria-selected="true"/,
    );
  });

  it("adopts the stored mode after mount, so the preference is not lost", async () => {
    window.localStorage.setItem("psico:lector:mode", "ver");
    renderShell();
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Ver/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
  });

  it("stays on Leer when nothing is stored", () => {
    window.localStorage.removeItem("psico:lector:mode");
    renderShell();
    expect(screen.getByRole("tab", { name: /Leer/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

// ── Book Experience Standard V1 · the mode the reader gets ─────────────────

/**
 * `requestedMode` vs `effectiveMode`.
 *
 * The reader can ASK for a mode the chapter cannot give: a stored preference
 * from another chapter, or one whose manifest has not arrived. What must never
 * happen is that the ask alone mounts the media surface — that is how «Escuchar»
 * came to open a screen with no audio in it.
 */
describe("LectorShell — modes are gated by what can actually play", () => {
  function manifestWith(items: unknown[]) {
    return async (input: RequestInfo | URL) => {
      if (String(input).includes("/media")) {
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
    };
  }

  const comingSoon = {
    mediaKey: "a1",
    mediaVersion: 1,
    kind: "AUDIOBOOK",
    title: "Audiolibro",
    description: "d",
    durationSec: null,
    availability: "COMING_SOON",
    hasTranscript: true,
    hasCaptions: false,
    chapters: [],
  };

  it("MEDIA_SURFACE_MOUNTS_ONLY_WHEN_PLAYABLE=true — nothing mounts while the manifest is in flight", async () => {
    window.localStorage.setItem("psico:lector:mode", "guia");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) =>
        String(input).includes("/media")
          ? // Never settles: the reader must behave for the whole wait, not
            // just after the answer.
            new Promise<Response>(() => {})
          : new Response("{}", { status: 200 }),
      );

    renderShell();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Leer is what is on screen, and the audio surface is nowhere.
    expect(screen.getByRole("tab", { name: /Leer/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByTestId("reader-mode-escuchar"),
    ).not.toBeInTheDocument();
    expect(
      fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/access")),
    ).toHaveLength(0);
    // …and the preference itself is untouched: a request in flight is not a
    // reason to discard somebody's choice.
    expect(window.localStorage.getItem("psico:lector:mode")).toBe("guia");
  });

  it("DISABLED_MODE_NEVER_MOUNTS_MEDIA=true — a coming-soon tab changes nothing when pressed", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(manifestWith([comingSoon]));

    renderShell();
    const tab = await screen.findByTestId("reader-mode-escuchar");
    expect(tab).toHaveAttribute("data-mode-state", "COMING_SOON");
    expect(tab).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(tab);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("tab", { name: /Leer/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(tab).toHaveAttribute("aria-selected", "false");
    expect(
      fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/access")),
    ).toHaveLength(0);
  });

  it("STORED_PREFERENCE_RESET_WHEN_MODE_GONE=true — a saved mode this chapter lacks goes back to Leer", async () => {
    // «guia» is the legacy stored value for Escuchar.
    window.localStorage.setItem("psico:lector:mode", "guia");
    vi.spyOn(globalThis, "fetch").mockImplementation(manifestWith([]));

    renderShell();

    await waitFor(() =>
      expect(window.localStorage.getItem("psico:lector:mode")).toBe("libro"),
    );
    expect(screen.getByRole("tab", { name: /Leer/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByTestId("reader-mode-escuchar"),
    ).not.toBeInTheDocument();
  });

  it("MANIFEST_REQUESTS_PER_READER_CHAPTER=1 — opening a media mode asks nothing more", async () => {
    // The reader already had to fetch the manifest to know whether these tabs
    // may be shown at all. The surfaces receive that answer instead of asking
    // again: two requests for one fact is one request too many, and it opened
    // a window where the surface knew less than the tab that led to it.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      manifestWith([
        { ...comingSoon, availability: "AVAILABLE" },
        {
          ...comingSoon,
          mediaKey: "v1",
          kind: "VIDEO",
          availability: "AVAILABLE",
        },
      ]),
    );
    const manifestCalls = () =>
      fetchSpy.mock.calls.filter(
        (c) =>
          String(c[0]).includes("/media") && !String(c[0]).includes("/access"),
      );

    renderShell();
    await screen.findByTestId("reader-mode-escuchar");
    expect(manifestCalls()).toHaveLength(1);

    fireEvent.click(screen.getByTestId("reader-mode-escuchar"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(manifestCalls()).toHaveLength(1);

    fireEvent.click(screen.getByTestId("reader-mode-ver"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(manifestCalls()).toHaveLength(1);
  });

  it("AUDIO_FAMILY_GATING=true — a podcast-only chapter still opens Escuchar", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      manifestWith([
        comingSoon,
        {
          ...comingSoon,
          mediaKey: "p1",
          kind: "PODCAST",
          availability: "AVAILABLE",
        },
      ]),
    );

    renderShell();
    const escuchar = await screen.findByTestId("reader-mode-escuchar");
    expect(escuchar).toHaveAttribute("data-mode-state", "PUBLISHED");
    expect(escuchar).toHaveAttribute("aria-disabled", "false");
  });

  it("VIDEO_EMPTY_STATE_FLASH=false — Ver is not offered while the manifest is unknown", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) =>
        // Never settles: the reader must behave for the whole wait.
        String(input).includes("/media")
          ? new Promise<Response>(() => {})
          : new Response("{}", { status: 200 }),
    );

    renderShell();
    await act(async () => {
      await Promise.resolve();
    });
    // No tab, so no surface, so no empty video state to flash.
    expect(screen.queryByTestId("reader-mode-ver")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chapter-media-watch")).not.toBeInTheDocument();
  });

  it("MANIFEST_IS_SCOPED_TO_ITS_CHAPTER=true — the previous chapter's answer never gates the next one", async () => {
    let served = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      served += 1;
      return new Response(
        JSON.stringify({
          bookSlug: "emociones-en-construccion",
          chapterOrder: 1,
          items: [{ ...comingSoon, availability: "AVAILABLE" }],
        }),
        { status: 200 },
      );
    });

    const { result, rerender } = renderHook(
      ({ chapterOrder }) =>
        useChapterMediaManifest({
          apiBase: "https://api.example/api",
          token: "t",
          bookId: "book-1",
          chapterOrder,
          enabled: true,
        }),
      { initialProps: { chapterOrder: 1 } },
    );

    await waitFor(() => expect(result.current.items).not.toBeNull());
    const before = served;

    rerender({ chapterOrder: 2 });
    // The instant the question changes, the old answer stops being exposed —
    // not after the new request lands.
    expect(result.current.items).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(served).toBeGreaterThan(before));
    await waitFor(() => expect(result.current.items).not.toBeNull());
  });
});

// ── GR-3 · the guided-reading surface ───────────────────────────────────────

/**
 * The reader is the gate. These tests assert what the reader refuses and what
 * it hands over — the panel's own behaviour has its own file.
 */
describe("LectorShell — guided reading", () => {
  const GUIDE_TAB = "reader-mode-guiada";

  /**
   * The reader with the pilot gate on and an actor resolved — the state a
   * person in the pilot is actually in. Without both, the guide is off for
   * them and the panel must not mount at all.
   */
  function renderWithGuide(unit: ContentUnitRead) {
    return render(
      <GuideAvailabilityProvider available>
        <GuideActorScopeProvider scope={"A".repeat(43)}>
          <LectorShell
            apiBase="https://api.example/api"
            token="bearer-stub"
            bookSlug="emociones-en-construccion"
            initial={buildInitial()}
            unit={unit}
            marks={null}
          />
        </GuideActorScopeProvider>
      </GuideAvailabilityProvider>,
    );
  }

  /** A unit that actually carries the approved passage. */
  function unitWithAnchor(): ContentUnitRead {
    const unit = buildUnit();
    return {
      ...unit,
      blocks: [
        {
          blockKey: "bk-h",
          legacyBlockId: "b-h",
          blockVersionId: "bv-h",
          kind: "HEADING",
          order: 1,
          content: "El cuerpo y la emoción",
          meta: null,
        },
        {
          blockKey: "bk-p",
          legacyBlockId: "b-p",
          blockVersionId: "bv-p",
          kind: "PARAGRAPH",
          order: 2,
          content:
            "El cuerpo se adelanta. Nuestro cuerpo siente antes que nuestra mente entienda.",
          meta: null,
        },
      ],
    };
  }

  /** Wait for the offer, then take it. Its existence is the readiness check. */
  async function openGuide() {
    fireEvent.click(await screen.findByTestId(GUIDE_TAB));
  }

  it("with no locatable passage there is no guided tab to press", async () => {
    // The seeded chapter of the ordinary dev database looks exactly like this:
    // real blocks, but not the ones this guide is about. Under the Book
    // Experience Standard the mode is simply not offered — there is no button
    // whose whole job is to open a panel that apologises.
    // `renderShell` has no pilot gate around it, so the reader does not even
    // ask — and with no answer there is nothing to offer.
    renderShell();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getGuideDiscovery).not.toHaveBeenCalled();
    expect(screen.queryByTestId(GUIDE_TAB)).not.toBeInTheDocument();
    expect(screen.queryByTestId("reader-guide-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Empezar" }),
    ).not.toBeInTheDocument();
  });

  it("says nothing about the internals of why a guide is missing", async () => {
    renderShell();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = document.body.textContent!;
    for (const internal of [
      "blockKey",
      "blockVersionId",
      "ingest",
      "Content Core",
      "anchor",
    ]) {
      expect(text).not.toContain(internal);
    }
  });

  it("only ONE tab is selected while the guide is open", async () => {
    renderWithGuide(unitWithAnchor());
    const selected = () =>
      screen.getAllByRole("tab").filter((t) => t.ariaSelected === "true");

    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toHaveTextContent("Leer");

    await openGuide();
    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toBe(screen.getByTestId(GUIDE_TAB));

    // …and closing gives the reading mode its selection back.
    fireEvent.click(screen.getByTestId(GUIDE_TAB));
    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toHaveTextContent("Leer");
  });

  it("the guide tab points at the panel it controls", async () => {
    renderWithGuide(unitWithAnchor());
    await openGuide();
    const tab = screen.getByTestId(GUIDE_TAB);
    const panel = await screen.findByTestId("reader-guide-panel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
  });

  it("Escape closes the panel", async () => {
    renderWithGuide(unitWithAnchor());
    await openGuide();
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByTestId("reader-guide-panel"),
      ).not.toBeInTheDocument(),
    );
  });

  it("the open drawer reserves its width instead of covering the text", async () => {
    const { container } = renderWithGuide(unitWithAnchor());
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.guideOpen).toBe("false");

    await openGuide();
    expect(root.dataset.guideOpen).toBe("true");
    expect(root.className).toContain("reader-guide-open");
  });
});

/**
 * #579 — the write must name the version the reader actually read.
 *
 * The existing tests above prove the exact `blockVersionId` travels. These prove
 * the other half: what happens when it is absent, and that the anchor is taken
 * from the block ON SCREEN rather than from whatever is newest.
 */
describe("LectorShell — highlight version anchor (#579)", () => {
  it("writes nothing, and leaves no phantom highlight, when a core block has no version", async () => {
    // A content-core block with no `blockVersionId` cannot produce a valid
    // anchor: the server refuses it with SOURCE_BLOCK_VERSION_REQUIRED. The
    // shell must refuse BEFORE the optimistic insert, or the reader would see a
    // tinted highlight that was never written anywhere.
    const unit = buildUnit();
    unit.blocks[0]!.blockVersionId = null;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const { container } = renderShell({}, unit);

    const blockEl = container.querySelector(
      '[data-block-id="b-1"]',
    ) as HTMLElement;
    const textSpan = blockEl.querySelector(".reader-text") as HTMLElement;
    const textNode = textSpan.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 7);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));

    const swatch = await screen.findByRole("button", {
      name: /subrayar en amarillo/i,
    });
    fireEvent.click(swatch);

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some((c) => String(c[0]).endsWith("/highlights")),
      ).toBe(false);
    });
    // No optimistic mark survives: nothing was inserted to roll back.
    expect(container.querySelectorAll("mark").length).toBe(0);
  });

  it("anchors the version on screen, not a newer one that exists elsewhere", async () => {
    // The rendered block is the authority. Even though "bv-2" also exists in
    // this unit, a selection inside b-1 must carry b-1's own version.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          highlight: {
            id: "h-1",
            blockKey: "bk-1",
            blockId: "b-1",
            startOffset: 0,
            endOffset: 7,
            color: "YELLOW",
            note: null,
            createdAt: new Date().toISOString(),
          },
        }),
        { status: 200 },
      ),
    );

    const { container } = renderShell();

    const blockEl = container.querySelector(
      '[data-block-id="b-1"]',
    ) as HTMLElement;
    const textSpan = blockEl.querySelector(".reader-text") as HTMLElement;
    const textNode = textSpan.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 7);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));

    fireEvent.click(
      await screen.findByRole("button", { name: /subrayar en amarillo/i }),
    );

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find((c) =>
        String(c[0]).endsWith("/highlights"),
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.blockVersionId).toBe("bv-1");
      expect(body.blockVersionId).not.toBe("bv-2");
      expect(body.blockKey).toBe("bk-1");
    });
  });
});
