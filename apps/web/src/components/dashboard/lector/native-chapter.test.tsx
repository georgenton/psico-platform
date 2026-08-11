import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContentUnitRead, LectorChapterResponse } from "@psico/types";
import type * as ApiClientModule from "@psico/api-client";

import { LectorShell } from "./LectorShell";

/**
 * The web reader opening a chapter that has no legacy Chapter row.
 *
 * No database is needed to prove the CONTRACT, which is what actually matters
 * here: the envelope hands the client a stable `contentUnitId`, and every write
 * the reader makes has to carry it back. Position locates a chapter; it must
 * never be what identifies one, because a structural publish can move a chapter
 * while this page is open.
 *
 * The real shell, the real hook, the real completion call.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      ...actual.guideApi,
      getGuideDiscovery: async () => ({ available: false as const }),
    },
  };
});

vi.mock("./AudioBar", () => ({ AudioBar: () => null }));

const UNIT_ID = "cu-native-42";

/** The envelope a native chapter produces: no blocks, no lessons, no audio. */
function nativeEnvelope(): LectorChapterResponse {
  return {
    book: {
      id: "book-1",
      slug: "libro-nativo",
      title: "Libro Nativo",
      authorName: "Autora",
      cover: "warm",
      totalChapters: 3,
    },
    chapter: {
      id: UNIT_ID,
      order: 3,
      title: "Capítulo nativo",
      subtitle: "Un resumen nativo.",
      durationMinutes: 11,
      audioAvailable: false,
      partNumber: 2,
      partTitle: "Parte II",
      // The stable write identity.
      contentUnitId: UNIT_ID,
    },
    blocks: [],
    lessons: [],
    highlights: [],
    annotations: [],
    session: {
      lastBlockId: null,
      progressPct: 0,
      timeSpentSec: 0,
      startedAt: new Date(),
      lastSeenAt: new Date(),
      completedAt: null,
    },
    preferences: {
      theme: "system",
      font: "serif",
      fontSize: 18,
      lineHeight: 1.6,
    },
  } as unknown as LectorChapterResponse;
}

/** Content Core carries the actual text, exactly as for a legacy chapter. */
function nativeUnit(): ContentUnitRead {
  return {
    editionKey: "libro-nativo-1e", // gitleaks:allow — a book slug, not a key
    revisionNumber: 4,
    unitKey: "u-nativa",
    title: "Capítulo nativo",
    summary: "Un resumen nativo.",
    order: 3,
    partNumber: 2,
    partTitle: "Parte II",
    source: "content-core",
    blocks: [
      {
        blockKey: "bk-n1",
        legacyBlockId: null,
        blockVersionId: "bv-n1",
        kind: "PARAGRAPH",
        order: 1,
        content: "El texto nativo del capítulo.",
        meta: null,
      },
    ],
  } as unknown as ContentUnitRead;
}

let fetchSpy: { mock: { calls: unknown[][] } };

beforeEach(() => {
  class FakeIO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    FakeIO as unknown as typeof IntersectionObserver;

  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(((url: unknown) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(url).includes("/media")
              ? { items: [] }
              : String(url).includes("/complete")
                ? { nextChapter: 4 }
                : { ok: true, progressPct: 0.3 },
          ),
          { status: 200 },
        ),
      )) as never) as never;
});

afterEach(() => vi.restoreAllMocks());

const renderNative = () =>
  render(
    <LectorShell
      apiBase="https://api.example/api"
      token="bearer-stub"
      bookSlug="libro-nativo"
      initial={nativeEnvelope()}
      unit={nativeUnit()}
      marks={null}
      marksUnavailable={false}
    />,
  );

describe("the reader renders a native chapter", () => {
  it("shows the Content Core title and part, not a legacy one", () => {
    renderNative();
    expect(screen.getByText("Capítulo nativo")).toBeInTheDocument();
    expect(screen.getByText(/Parte II/i)).toBeInTheDocument();
  });

  it("renders the Content Core text", () => {
    const { container } = renderNative();
    expect(container.textContent).toContain("El texto nativo del capítulo.");
  });

  it("survives having no media, no lessons and no marks", () => {
    // The whole point of "zero optional extras is still a valid chapter".
    const { container } = renderNative();
    expect(container.querySelector(".reader-text")).not.toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("every write carries the stable identity", () => {
  it("sends contentUnitId on completion, not just the position", async () => {
    renderNative();

    const complete = await screen.findByRole("button", {
      name: /marcar capítulo como leído/i,
    });
    fireEvent.click(complete);

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find((c) =>
        String(c[0]).endsWith("/complete"),
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      // The identity the envelope handed us, echoed back.
      expect(body.contentUnitId).toBe(UNIT_ID);
    });
  });

  it("derives that identity from the envelope, never from the DOM or the order", async () => {
    renderNative();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /marcar capítulo como leído/i,
      }),
    );

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find((c) =>
        String(c[0]).endsWith("/complete"),
      );
      const body = JSON.parse((call![1] as RequestInit).body as string);
      // Not the position, which is what a reorder would invalidate.
      expect(body.contentUnitId).not.toBe("3");
      expect(body.contentUnitId).toBe(nativeEnvelope().chapter.contentUnitId);
    });
  });
});

describe("a legacy chapter is unchanged", () => {
  it("sends no identity, so the server resolves it by position as before", async () => {
    const legacy = nativeEnvelope();
    legacy.chapter.id = "chapter-legacy";
    legacy.chapter.contentUnitId = null;

    render(
      <LectorShell
        apiBase="https://api.example/api"
        token="bearer-stub"
        bookSlug="libro-nativo"
        initial={legacy}
        unit={nativeUnit()}
        marks={null}
        marksUnavailable={false}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /marcar capítulo como leído/i,
      }),
    );

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find((c) =>
        String(c[0]).endsWith("/complete"),
      );
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.contentUnitId).toBeUndefined();
    });
  });
});
