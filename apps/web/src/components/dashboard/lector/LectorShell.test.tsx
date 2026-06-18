import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { LectorChapterResponse } from "@psico/types";
import { LectorShell } from "./LectorShell";

/**
 * Smoke tests for the LectorShell orchestrator (Sprint 3 del roadmap).
 *
 * The component owns highlights / annotations / progress + heartbeat
 * lifecycle. We mock all network calls (the Lector uses raw `fetch`,
 * not the apiClient wrapper, because the access token is passed in as
 * a prop from the Server Component). We also mock the AudioBar — it's
 * already covered by its own test file and pulling it in here would
 * trigger `<audio>` loading which jsdom doesn't implement.
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
});

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
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
    blocks: [
      {
        id: "b-1",
        order: 1,
        kind: "PARAGRAPH",
        content: "Empieza así.",
        meta: null,
      },
      {
        id: "b-2",
        order: 2,
        kind: "PARAGRAPH",
        content: "Y continúa con otro.",
        meta: null,
      },
    ],
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

const renderShell = (overrides: Partial<LectorChapterResponse> = {}) =>
  render(
    <LectorShell
      apiBase="https://api.example/api"
      token="bearer-stub"
      bookSlug="emociones-en-construccion"
      initial={buildInitial(overrides)}
    />,
  );

describe("LectorShell — header + blocks", () => {
  it("renders book and chapter title in the header", () => {
    renderShell();
    expect(screen.getByText("Emociones en Construcción")).toBeInTheDocument();
    expect(screen.getByText(/Cap\. 1.*El primer paso/)).toBeInTheDocument();
  });

  it("renders every block's content in order", () => {
    renderShell();
    expect(screen.getByText("Empieza así.")).toBeInTheDocument();
    expect(screen.getByText("Y continúa con otro.")).toBeInTheDocument();
  });

  it("exposes the preferences + notes toggle buttons", () => {
    renderShell();
    expect(
      screen.getByRole("button", { name: /preferencias de lectura/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ver notas/i }),
    ).toBeInTheDocument();
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

describe("LectorShell — annotations panel", () => {
  it("is closed initially and opens when the user taps the notes button", () => {
    renderShell({
      annotations: [
        {
          id: "a-1",
          blockId: "b-1",
          text: "Mi primera nota",
          updatedAt: new Date().toISOString(),
        },
      ],
    } as unknown as Partial<LectorChapterResponse>);

    // Closed initially — the annotation text isn't on the screen because
    // the panel is rendered with display:none / closed state.
    expect(screen.queryByText("Mi primera nota")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ver notas/i }));

    // After opening, the existing annotation is visible.
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
