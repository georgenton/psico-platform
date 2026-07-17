import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type {
  ContentUnitMarks,
  ContentUnitRead,
  LectorChapterResponse,
} from "@psico/types";
import { LectorShell } from "./LectorShell";

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
        kind: "PARAGRAPH",
        order: 1,
        content: "Empieza así.",
        meta: null,
      },
      {
        blockKey: "bk-2",
        legacyBlockId: "b-2",
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
) =>
  render(
    <LectorShell
      apiBase="https://api.example/api"
      token="bearer-stub"
      bookSlug="emociones-en-construccion"
      initial={buildInitial(overrides)}
      unit={unit}
      marks={marks}
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

describe("LectorShell — write path uses blockKey (CC-6B)", () => {
  it("POSTs a highlight anchored by the stable blockKey, not the legacy id", async () => {
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
    renderShell({
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
    } as unknown as Partial<LectorChapterResponse>);

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
