import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type {
  ContentUnitMarks,
  ContentUnitRead,
  LectorChapterResponse,
} from "@psico/types";
import { LectorShell } from "./LectorShell";
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
  it("renders book and chapter title in the header", () => {
    renderShell();
    expect(screen.getByText("Emociones en Construcción")).toBeInTheDocument();
    expect(screen.getByText(/Cap\. 1.*El primer paso/)).toBeInTheDocument();
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
      .mockResolvedValue(new Response("{}", { status: 200 }));
    renderShell();
    const calledLector = fetchSpy.mock.calls.some((c) =>
      String(c[0]).includes("/lector/"),
    );
    expect(calledLector).toBe(false);
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
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
    const verSelectedIndex = html.indexOf("Ver");
    const selectedTrueBeforeVer = html.lastIndexOf(
      'aria-selected="true"',
      verSelectedIndex,
    );
    const selectedFalseBeforeVer = html.lastIndexOf(
      'aria-selected="false"',
      verSelectedIndex,
    );
    expect(selectedFalseBeforeVer).toBeGreaterThan(selectedTrueBeforeVer);
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

  it("with no locatable passage the guide says so and cannot start", async () => {
    // The seeded chapter of the ordinary dev database looks exactly like this:
    // real blocks, but not the ones this guide is about.
    renderShell();
    fireEvent.click(screen.getByTestId(GUIDE_TAB));

    expect(
      await screen.findByTestId("reader-guide-unavailable"),
    ).toHaveTextContent("Lectura guiada no disponible por ahora.");
    expect(screen.queryByTestId("reader-guide-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Empezar" }),
    ).not.toBeInTheDocument();
  });

  it("the unavailable copy never names an internal mechanism", async () => {
    renderShell();
    fireEvent.click(screen.getByTestId(GUIDE_TAB));
    const text = (await screen.findByTestId("reader-guide-unavailable"))
      .textContent!;
    for (const internal of [
      "blockKey",
      "blockVersionId",
      "ingest",
      "seed",
      "Content Core",
    ]) {
      expect(text).not.toContain(internal);
    }
  });

  it("only ONE tab is selected while the guide is open", () => {
    renderWithGuide(unitWithAnchor());
    const selected = () =>
      screen.getAllByRole("tab").filter((t) => t.ariaSelected === "true");

    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toHaveTextContent("Leer");

    fireEvent.click(screen.getByTestId(GUIDE_TAB));
    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toBe(screen.getByTestId(GUIDE_TAB));

    // …and closing gives the reading mode its selection back.
    fireEvent.click(screen.getByTestId(GUIDE_TAB));
    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toHaveTextContent("Leer");
  });

  it("the guide tab points at the panel it controls", async () => {
    renderWithGuide(unitWithAnchor());
    fireEvent.click(screen.getByTestId(GUIDE_TAB));
    const tab = screen.getByTestId(GUIDE_TAB);
    const panel = await screen.findByTestId("reader-guide-panel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
  });

  it("Escape closes the panel", async () => {
    renderWithGuide(unitWithAnchor());
    fireEvent.click(screen.getByTestId(GUIDE_TAB));
    expect(await screen.findByTestId("reader-guide-panel")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByTestId("reader-guide-panel"),
      ).not.toBeInTheDocument(),
    );
  });

  it("the open drawer reserves its width instead of covering the text", () => {
    const { container } = renderWithGuide(unitWithAnchor());
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.guideOpen).toBe("false");

    fireEvent.click(screen.getByTestId(GUIDE_TAB));
    expect(root.dataset.guideOpen).toBe("true");
    expect(root.className).toContain("reader-guide-open");
  });
});
