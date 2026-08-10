import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContentUnitRead, LectorChapterResponse } from "@psico/types";
import type * as ApiClientModule from "@psico/api-client";

import { LectorShell } from "./LectorShell";

/**
 * Creating a NEW highlight on text that editorial formatting has broken into
 * nested DOM nodes.
 *
 * Rendering an EXISTING highlight over formatted text is already pinned in
 * `InlineFormatting.test.tsx`. The open question was the other direction: a
 * reader drags across `text · <span underline> · <strong> · <em>` and the shell
 * has to turn that browser Selection back into offsets into the ORIGINAL plain
 * string.
 *
 * The audit found the existing implementation already correct — it builds a
 * `Range` over `.reader-text` and measures with `Range.toString().length`, which
 * concatenates every descendant text node and is blind to element boundaries.
 * Nothing was rewritten. These tests exist so it stays that way: the formatting
 * feature made this code load-bearing in a way it was not before, and a future
 * "optimisation" to `textNode.firstChild` would silently corrupt every highlight
 * created on a formatted paragraph.
 *
 * Everything here drives the REAL shell and the REAL selection listener. None of
 * the offset arithmetic is reimplemented in the test — that would only prove the
 * test agrees with itself.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// No guide for this chapter: the guide surface is a different feature, and its
// panels would only add noise between a reader's selection and the popover.
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

/** The sentence the whole ratchet is built on. */
const CONTENT = "Una mente flexible aprende del cambio.";

/**
 * Overlapping editorial marks, chosen so the rendered DOM has several adjacent
 * and nested boundaries rather than one tidy span.
 *
 *   UNDERLINE  "mente flexible"
 *   BOLD       "flexible aprende"
 *   ITALIC     "aprende del"
 */
const MARKS = {
  inlineMarks: [
    { type: "UNDERLINE", startOffset: 4, endOffset: 18 },
    { type: "BOLD", startOffset: 10, endOffset: 26 },
    { type: "ITALIC", startOffset: 19, endOffset: 30 },
  ],
};

/** Mirrors the fixture in `LectorShell.test.tsx`; the shell reads more of this
 * envelope than the selection path itself needs. */
function buildInitial(): LectorChapterResponse {
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
  } as unknown as LectorChapterResponse;
}

function buildUnit(meta: Record<string, unknown> | null): ContentUnitRead {
  return {
    editionKey: "emociones-en-construccion-1e",
    revisionNumber: 2,
    unitKey: "unit-1",
    title: "El primer paso",
    summary: null,
    order: 1,
    partNumber: null,
    partTitle: null,
    source: "content-core",
    blocks: [
      {
        blockKey: "bk-1",
        legacyBlockId: "b-1",
        blockVersionId: "bv-1",
        kind: "PARAGRAPH",
        order: 1,
        content: CONTENT,
        meta,
      },
    ],
  } as unknown as ContentUnitRead;
}

function renderShell(meta: Record<string, unknown> | null = MARKS) {
  return render(
    <LectorShell
      apiBase="https://api.example/api"
      token="bearer-stub"
      bookSlug="emociones-en-construccion"
      initial={buildInitial()}
      unit={buildUnit(meta)}
      marks={null}
      marksUnavailable={false}
    />,
  );
}

// Typed loosely on purpose: the global fetch overloads do not collapse into
// a single MockInstance signature, and the tests only read `mock.calls`.
let fetchSpy: { mock: { calls: unknown[][] }; mockClear: () => void };

beforeEach(() => {
  // IntersectionObserver isn't in jsdom; the shell observes blocks for progress.
  class FakeIO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    FakeIO as unknown as typeof IntersectionObserver;

  // jsdom's Range has no layout, and the selection handler reads a bounding
  // rect to place the popover. Without this it throws before it ever sets state.
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

  // Echoes the geometry it was sent, so the round-trip test renders the mark
  // the reader actually asked for rather than a fixture's idea of one.
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(((
    url: unknown,
    init?: RequestInit,
  ) => {
    if (String(url).includes("/media")) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      );
    }
    const sent = init?.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : {};
    return Promise.resolve(
      new Response(
        JSON.stringify({
          highlight: {
            id: "h-real",
            blockKey: "bk-1",
            blockId: "b-1",
            startOffset: sent.startOffset ?? 0,
            endOffset: sent.endOffset ?? 1,
            color: sent.color ?? "YELLOW",
            note: null,
            createdAt: new Date().toISOString(),
          },
        }),
        { status: 200 },
      ),
    );
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.getSelection()?.removeAllRanges();
});

/**
 * Select a visible phrase by walking the rendered text nodes.
 *
 * Deliberately expressed as "the Nth and Mth character a reader can SEE",
 * without knowing which element each lands in — that is the whole point. The
 * DOM shape is an output of the formatting, and the test must not depend on it.
 */
function selectVisibleRange(
  container: HTMLElement,
  from: number,
  to: number,
): void {
  const readerText = container.querySelector(".reader-text") as HTMLElement;
  const walker = document.createTreeWalker(readerText, NodeFilter.SHOW_TEXT);

  let seen = 0;
  let startNode: Text | null = null;
  let startAt = 0;
  let endNode: Text | null = null;
  let endAt = 0;

  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.data.length;
    if (startNode === null && seen + len >= from) {
      startNode = node;
      startAt = from - seen;
    }
    if (endNode === null && seen + len >= to) {
      endNode = node;
      endAt = to - seen;
    }
    seen += len;
    node = walker.nextNode() as Text | null;
  }

  const range = document.createRange();
  range.setStart(startNode!, startAt);
  range.setEnd(endNode!, endAt);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

/** Drive the real popover, then read what the shell actually POSTed. */
async function highlightSelection(): Promise<{
  startOffset: number;
  endOffset: number;
  blockKey: string;
  blockVersionId?: string;
  blockId?: string;
}> {
  const swatch = await screen.findByRole("button", {
    name: /subrayar en amarillo/i,
  });
  fireEvent.click(swatch);

  let body: Record<string, unknown> | null = null;
  await waitFor(() => {
    const call = fetchSpy.mock.calls.find((c) =>
      String(c[0]).endsWith("/highlights"),
    );
    expect(call).toBeTruthy();
    body = JSON.parse((call![1] as RequestInit).body as string);
  });
  return body as never;
}

describe("the DOM actually has formatting boundaries to trip over", () => {
  it("renders the phrase across several nested elements", () => {
    const { container } = renderShell();
    const readerText = container.querySelector(".reader-text") as HTMLElement;

    // If this ever collapses to one text node the rest of the file stops
    // testing anything, so it is asserted rather than assumed.
    const walker = document.createTreeWalker(readerText, NodeFilter.SHOW_TEXT);
    let count = 0;
    while (walker.nextNode()) count += 1;
    expect(count).toBeGreaterThan(3);

    expect(readerText.querySelector("strong")).not.toBeNull();
    expect(readerText.querySelector("em")).not.toBeNull();
    expect(readerText.textContent).toBe(CONTENT);
  });
});

describe("a new highlight over formatted text", () => {
  it("THE case — a selection crossing every boundary lands on canonical offsets", async () => {
    // "mente flexible aprende del" spans plain → underline → bold → italic and
    // back out again.
    const PHRASE = "mente flexible aprende del";
    const from = CONTENT.indexOf(PHRASE);
    const to = from + PHRASE.length;

    const { container } = renderShell();
    selectVisibleRange(container, from, to);
    const body = await highlightSelection();

    // Offsets index the ORIGINAL plain string, not the rendered markup.
    expect(CONTENT.slice(body.startOffset, body.endOffset)).toBe(PHRASE);
    // Which is exactly how the server derives the stored quote.
    expect(body.startOffset).toBe(from);
    expect(body.endOffset).toBe(to);
  });

  it.each([
    ["entirely inside UNDERLINE", "mente flexible"],
    ["entirely inside BOLD+ITALIC", "aprende"],
    ["plain text into UNDERLINE", "Una mente"],
    ["out of ITALIC into plain text", "del cambio."],
    ["the whole paragraph", CONTENT],
  ])("%s", async (_label, phrase) => {
    const from = CONTENT.indexOf(phrase);
    const to = from + phrase.length;

    const { container } = renderShell();
    selectVisibleRange(container, from, to);
    const body = await highlightSelection();

    expect(CONTENT.slice(body.startOffset, body.endOffset)).toBe(phrase);
  });

  it("carries no markup characters into the selected text", async () => {
    const { container } = renderShell();
    selectVisibleRange(container, 4, 18);
    const body = await highlightSelection();

    const selected = CONTENT.slice(body.startOffset, body.endOffset);
    expect(selected).toBe("mente flexible");
    expect(selected).not.toMatch(/[<>_*]/);
  });

  it("writes the same identity fields formatting or not", async () => {
    // Formatting is metadata; it must not touch the anchor a mark is written
    // against.
    const { container } = renderShell();
    selectVisibleRange(container, 4, 18);
    const body = await highlightSelection();

    expect(body.blockKey).toBe("bk-1");
    expect(body.blockVersionId).toBe("bv-1");
    expect(body.blockId).toBeUndefined();
  });
});

describe("formatting does not move the offsets at all", () => {
  it("produces byte-identical geometry with and without marks", async () => {
    // The strongest form of the claim: run the same visible selection twice,
    // once on a formatted block and once on the same text unformatted, and
    // compare. Any DOM-dependent drift shows up here as a difference.
    const PHRASE = "mente flexible aprende del";
    const from = CONTENT.indexOf(PHRASE);
    const to = from + PHRASE.length;

    const formatted = renderShell(MARKS);
    selectVisibleRange(formatted.container, from, to);
    const withMarks = await highlightSelection();
    formatted.unmount();
    fetchSpy.mockClear();

    const plain = renderShell(null);
    selectVisibleRange(plain.container, from, to);
    const withoutMarks = await highlightSelection();

    expect(withMarks.startOffset).toBe(withoutMarks.startOffset);
    expect(withMarks.endOffset).toBe(withoutMarks.endOffset);
  });
});

describe("emoji and accents keep the offsets highlights already use", () => {
  const EMOJI = "Una café 🌿 mente flexible.";
  const EMOJI_MARKS = {
    inlineMarks: [{ type: "BOLD", startOffset: 4, endOffset: 10 }],
  };

  it("counts UTF-16 code units, exactly as Highlight.startOffset does", async () => {
    // The emoji is two code units. Switching to grapheme counting here would
    // silently disagree with every highlight already stored.
    const phrase = "mente flexible";
    const from = EMOJI.indexOf(phrase);
    const to = from + phrase.length;

    const { container } = render(
      <LectorShell
        apiBase="https://api.example/api"
        token="bearer-stub"
        bookSlug="emociones-en-construccion"
        initial={buildInitial()}
        unit={
          {
            ...buildUnit(EMOJI_MARKS),
            blocks: [
              {
                blockKey: "bk-1",
                legacyBlockId: "b-1",
                blockVersionId: "bv-1",
                kind: "PARAGRAPH",
                order: 1,
                content: EMOJI,
                meta: EMOJI_MARKS,
              },
            ],
          } as unknown as ContentUnitRead
        }
        marks={null}
        marksUnavailable={false}
      />,
    );

    selectVisibleRange(container, from, to);
    const body = await highlightSelection();

    expect(EMOJI.slice(body.startOffset, body.endOffset)).toBe(phrase);
    // Pins the convention itself, so a change of mind is a failing test.
    expect("🌿".length).toBe(2);
  });
});

describe("round trip — the new highlight renders as one mark", () => {
  it("stays a single element even though it crosses formatting boundaries", async () => {
    // Selection → payload → the existing renderer. A highlight is one thing to
    // a reader, so `data-highlight-id` has to identify one element no matter
    // how many editorial segments it happens to span.
    const PHRASE = "mente flexible aprende del";
    const from = CONTENT.indexOf(PHRASE);
    const to = from + PHRASE.length;

    const { container } = renderShell();
    selectVisibleRange(container, from, to);
    await highlightSelection();

    await waitFor(() => {
      const marks = container.querySelectorAll("mark");
      expect(marks.length).toBe(1);
      expect(marks[0]!.textContent).toBe(PHRASE);
    });

    const ids = new Set(
      [...container.querySelectorAll("mark")].map((m) =>
        m.getAttribute("data-highlight-id"),
      ),
    );
    expect(ids.size).toBe(1);
    // And the paragraph's text is still exactly the stored content.
    expect(
      (container.querySelector(".reader-text") as HTMLElement).textContent,
    ).toBe(CONTENT);
  });
});
