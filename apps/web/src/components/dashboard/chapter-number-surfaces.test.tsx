import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ChapterListItem,
  HomeContinueBook,
  ResonanceSummary,
} from "@psico/types";
import { ChaptersList } from "./detalle/ChaptersList";
import { ContinueBookCard } from "./home/ContinueBookCard";
import { MapResonances } from "./mapa/MapResonances";
import { ChapterExperienceHome } from "./lector/ChapterExperienceHome";
import type { BookExperienceModeView } from "./lector/book-experience";

vi.mock("@/app/dashboard/mapa/actions", () => ({
  deleteResonanceAction: vi.fn(async () => ({ ok: true as const })),
  setResonanceImportantAction: vi.fn(async () => ({ ok: true as const })),
}));

/**
 * A chapter number is a claim about the BOOK. `Chapter.order` is a claim about
 * our reading sequence. They are not the same number, and in «Parejas que
 * Perduran» they differ by one for every chapter — the preface holds `order 1`,
 * so the book's own chapter 1 sits at `order 2`.
 *
 * This file is the sweep: every surface that shows a reader something about a
 * chapter renders here with the Parejas shape, and none of them may print the
 * platform order as an editorial number. Adding a surface? Add it here.
 *
 * What it deliberately does NOT change is anything the order is actually for:
 * the reader route still ends in `/lector/2`, and rows still come out in the
 * order the book gave them. Those are pinned below too, so a future "fix"
 * cannot quietly renumber the routes to make a label look right.
 */

/** The editorial chapter 1 of Parejas, at platform order 2. */
const PAREJAS_CH1_TITLE = "Cuando amar también sana";
const PAREJAS_PREFACE_TITLE = "Prefacio e introducción";

function chapter(over: Partial<ChapterListItem>): ChapterListItem {
  return {
    n: 1,
    readerRef: { kind: "chapter" as const, id: `ch-parejas-1` },
    title: "t",
    durationMinutes: 10,
    lockedByTier: false,
    partNumber: null,
    partTitle: null,
    userProgress: { status: "not-started", progressPct: 0 },
    ...over,
  };
}

/**
 * The assertion every surface shares. «2» on its own is not searched for —
 * durations, percentages and counts legitimately contain digits — so this
 * looks for the shapes a chapter number actually takes.
 */
function expectNoEditorialNumber(text: string) {
  expect(text).not.toMatch(/Cap\.\s*\d/);
  expect(text).not.toMatch(/Capítulo\s*\d/);
  expect(text).not.toMatch(/Chapter\s*\d/);
}

describe("PAREJAS_BOOK_DETAIL_DOES_NOT_SHOW_CHAPTER_2_FOR_EDITORIAL_CHAPTER_1", () => {
  const parejas = [
    chapter({ n: 1, title: PAREJAS_PREFACE_TITLE }),
    chapter({ n: 2, title: PAREJAS_CH1_TITLE }),
    chapter({ n: 3, title: "Amenazas silenciosas" }),
  ];

  it("names each chapter by its title and numbers none of them", () => {
    const { container } = render(
      <ChaptersList bookSlug="parejas-que-perduran" chapters={parejas} />,
    );
    expect(screen.getByText(PAREJAS_CH1_TITLE)).toBeInTheDocument();
    expectNoEditorialNumber(container.textContent ?? "");
    // The specific defect: a badge reading «2» beside the book's chapter 1.
    expect(screen.queryByText("2")).toBeNull();
  });

  it("ROUTE_REACHES_THE_SAME_CHAPTER — now by stable identity, not position", () => {
    // This pin was written for the numbering fix, to prove that changing the
    // LABEL had not changed the LINK. Phase B.A changes the link deliberately:
    // position located a chapter, identity names one, and a positional URL
    // cannot survive a reorder. What the pin still protects is unchanged — the
    // row links to THIS chapter, and no editorial number is displayed.
    render(<ChaptersList bookSlug="parejas-que-perduran" chapters={parejas} />);
    expect(screen.getByText(PAREJAS_CH1_TITLE).closest("a")).toHaveAttribute(
      "href",
      "/dashboard/biblioteca/parejas-que-perduran/lector/c/ch-parejas-1",
    );
  });

  it("SORT_ORDER_UNCHANGED — rows keep the reading sequence", () => {
    const { container } = render(
      <ChaptersList bookSlug="parejas-que-perduran" chapters={parejas} />,
    );
    const titles = [...container.querySelectorAll("a")].map((a) =>
      a.querySelector("div > div")?.textContent?.trim(),
    );
    expect(titles).toEqual([
      PAREJAS_PREFACE_TITLE,
      PAREJAS_CH1_TITLE,
      "Amenazas silenciosas",
    ]);
  });
});

describe("PAREJAS_HOME_CARDS_DO_NOT_SHOW_PLATFORM_ORDER", () => {
  const book: HomeContinueBook = {
    bookId: "b1",
    bookSlug: "parejas-que-perduran",
    readerRef: { kind: "chapter", id: "ch-parejas-1" },
    title: "Parejas que perduran",
    author: "David Jaramillo",
    cover: "cool",
    chapterN: 2,
    chapterTitle: PAREJAS_CH1_TITLE,
    progressPct: 40,
    lastReadAt: new Date("2026-07-10T12:00:00.000Z"),
  };

  it("the continue card names the chapter without numbering it", () => {
    const { container } = render(<ContinueBookCard book={book} />);
    expect(screen.getByText(new RegExp(PAREJAS_CH1_TITLE))).toBeInTheDocument();
    expectNoEditorialNumber(container.textContent ?? "");
  });
});

describe("PAREJAS_MAP_PROVENANCE_DOES_NOT_SHOW_PLATFORM_ORDER", () => {
  const resonance: ResonanceSummary = {
    id: "r1",
    conceptKey: "pqp-amar-tambien-sana",
    conceptLabel: "Amar también sana",
    bookSlug: "parejas-que-perduran",
    chapterOrder: 2,
    source: "highlight",
    confirmedAt: "2026-07-10T12:00:00.000Z",
    important: false,
  };

  it("keeps the provenance it can prove and drops the number it cannot", () => {
    const { container } = render(<MapResonances initial={[resonance]} />);
    expect(screen.getByText(/Confirmado por ti/)).toBeInTheDocument();
    expectNoEditorialNumber(container.textContent ?? "");
  });
});

describe("PAREJAS_CHAPTER_HOME_DOES_NOT_SHOW_PLATFORM_ORDER", () => {
  const mode = (
    over: Partial<BookExperienceModeView> = {},
  ): BookExperienceModeView => ({
    kind: "BOOK",
    state: "PUBLISHED",
    label: "Leer",
    ...over,
  });

  it("leads with the chapter title, with no «Capítulo 2» above it", () => {
    const { container } = render(
      <ChapterExperienceHome
        book={{
          title: "Parejas que perduran",
          authorName: "David Jaramillo",
          slug: "parejas-que-perduran",
        }}
        chapter={{
          order: 2,
          title: PAREJAS_CH1_TITLE,
          durationMinutes: 14,
          partNumber: null,
          partTitle: null,
        }}
        progressPct={0.4}
        modeViews={{
          leer: mode(),
          escuchar: mode({
            kind: "AUDIOBOOK",
            state: "HIDDEN",
            label: "Escuchar",
          }),
          ver: mode({ kind: "VIDEO", state: "HIDDEN", label: "Ver" }),
        }}
        guidedView={mode({ kind: "GUIDED", state: "HIDDEN", label: "Guiada" })}
        experiencesEnabled={false}
        experiences={[]}
        experienceStates={{ status: "ready", states: new Map() }}
        onOpenExperience={() => {}}
        activityCount={0}
        onContinueReading={() => {}}
        onPickMode={() => {}}
        onOpenActivities={() => {}}
      />,
    );
    expect(screen.getByText(PAREJAS_CH1_TITLE)).toBeInTheDocument();
    expectNoEditorialNumber(container.textContent ?? "");
  });
});

describe("NO_SLUG_SPECIAL_CASES", () => {
  /**
   * The tempting shortcut — «if the book is Parejas, subtract one» — would
   * swap a wrong number for a wrong number that nobody notices. It is banned
   * at the source level, not just by behaviour, because a per-book offset can
   * pass every test above while still being a lie about a different book.
   */
  const SURFACES = [
    "detalle/ChaptersList.tsx",
    "home/ContinueBookCard.tsx",
    "home/InicioV2.tsx",
    "mapa/MapResonances.tsx",
    "lector/chapter-label.ts",
    "lector/ChapterExperienceHome.tsx",
    "lector/LectorShell.tsx",
  ];

  it("no surface derives an editorial number from the platform order", () => {
    for (const file of SURFACES) {
      const src = readFileSync(join(__dirname, file), "utf8");
      const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code, `${file} hardcodes a book slug`).not.toMatch(
        /["'`]parejas-que-perduran["'`]/,
      );
      expect(code, `${file} derives a chapter number`).not.toMatch(
        /(order|chapterN|chapterOrder)\s*[-+]\s*1\b/,
      );
      expect(code, `${file} prints an order as a chapter number`).not.toMatch(
        /(Cap\.|Capítulo)\s*\{/,
      );
    }
  });
});
