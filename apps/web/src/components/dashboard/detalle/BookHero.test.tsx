import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  BookDetail,
  BookUserProgressSummary,
  ReaderChapterRef,
} from "@psico/types";
import { BookHero } from "./BookHero";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/**
 * Starting a book must succeed before the reader opens, and must open the
 * chapter the server named.
 *
 * The old CTA swallowed every failure and navigated anyway, so a reader whose
 * start never registered saw the chapter open and the state they expected never
 * arrive. And it chose the chapter with `ceil(pct / 100 * book.chapters)` — a
 * guess at a position, from a percentage, against a possibly stale count.
 */

const book = {
  id: "b1",
  slug: "libro",
  title: "Libro",
  subtitle: null,
  description: "d",
  summary: "s",
  cover: "cool",
  coverArtUrl: null,
  chapters: 10,
  pages: 100,
  durationMinutes: 60,
  publishedOn: null,
  rating: 0,
  reviewCount: 0,
  tierRequired: "free",
  isFavorite: false,
  isBookmarked: false,
} as unknown as BookDetail;

const LEGACY: ReaderChapterRef = { kind: "chapter", id: "ch-1" };
const NATIVE: ReaderChapterRef = { kind: "unit", id: "u-7" };

const started = (pct: number): BookUserProgressSummary =>
  ({
    startedAt: new Date("2026-08-01T00:00:00.000Z"),
    lastChapterRead: 1,
    progressPct: pct,
    completedAt: null,
  }) as BookUserProgressSummary;

function mount(opts: {
  userProgress?: BookUserProgressSummary | null;
  first?: ReaderChapterRef | null;
  cont?: ReaderChapterRef | null;
  isLocked?: boolean;
  token?: string | null;
}) {
  return render(
    <BookHero
      book={book}
      author={null}
      userProgress={opts.userProgress ?? null}
      isLocked={opts.isLocked ?? false}
      apiBase="https://api.test"
      token={opts.token === undefined ? "t" : opts.token}
      idOrSlug="libro"
      firstReaderRef={opts.first === undefined ? LEGACY : opts.first}
      continueReaderRef={opts.cont ?? null}
    />,
  );
}

const cta = () =>
  screen.getByRole("button", { name: /Empezar|Seguir|Hazte Pro/i });

beforeEach(() => {
  push.mockReset();
  vi.restoreAllMocks();
});

describe("BookHero — starting a book", () => {
  it("a successful start opens the legacy first chapter by identity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    mount({});

    await userEvent.click(cta());

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/dashboard/biblioteca/libro/lector/c/ch-1",
      ),
    );
  });

  it("a successful start opens a native first chapter by unit id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    mount({ first: NATIVE });

    await userEvent.click(cta());

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/dashboard/biblioteca/libro/lector/u/u-7",
      ),
    );
  });

  for (const status of [400, 401, 403, 500]) {
    it(`a ${status} does not open the reader`, async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status,
        // A body that would be alarming if it ever reached the screen.
        text: async () => "column UserProgress.chapterId violates constraint",
      } as unknown as Response);
      mount({});

      await userEvent.click(cta());

      await screen.findByRole("alert");
      expect(push).not.toHaveBeenCalled();
      expect(
        screen.getByText(/No pudimos iniciar el libro/i),
      ).toBeInTheDocument();
      // Nothing from the server reaches the reader.
      expect(screen.queryByText(/UserProgress|constraint|column/)).toBeNull();
    });
  }

  it("a network failure does not open the reader either", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    mount({});

    await userEvent.click(cta());

    await screen.findByRole("alert");
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText(/offline/)).toBeNull();
  });
});

describe("BookHero — continuing a book", () => {
  it("resumes the chapter the server named, without re-posting start", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mount({ userProgress: started(50), cont: NATIVE });

    expect(cta()).toHaveTextContent(/Seguir leyendo/);
    await userEvent.click(cta());

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/dashboard/biblioteca/libro/lector/u/u-7",
      ),
    );
    // Start already happened; navigating is not a state change.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("50% does not become chapter 5", async () => {
    mount({ userProgress: started(50), cont: LEGACY });

    await userEvent.click(cta());

    await waitFor(() => expect(push).toHaveBeenCalled());
    const href = push.mock.calls[0][0] as string;
    expect(href).toBe("/dashboard/biblioteca/libro/lector/c/ch-1");
    // `ceil(50/100 * 10)` was 5. Nothing in the URL is a number now.
    expect(href).not.toMatch(/\/lector\/\d+$/);
  });

  it("a stale chapter count cannot move the target", async () => {
    // `book.chapters` is 10 here and deliberately wrong; the ref decides.
    mount({ userProgress: started(100), cont: LEGACY });

    await userEvent.click(cta());

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/dashboard/biblioteca/libro/lector/c/ch-1",
      ),
    );
  });

  it("started at 0% still says «Seguir leyendo»", () => {
    mount({ userProgress: started(0), cont: LEGACY });
    expect(cta()).toHaveTextContent(/Seguir leyendo/);
  });

  it("falls back to the first chapter when there is nothing to resume", async () => {
    // A completion with no surviving session, for instance.
    mount({ userProgress: started(100), cont: null, first: LEGACY });

    await userEvent.click(cta());

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/dashboard/biblioteca/libro/lector/c/ch-1",
      ),
    );
  });
});

describe("BookHero — gates that must not change", () => {
  it("a locked Pro book still shows the paywall CTA and does not navigate", async () => {
    mount({ isLocked: true });

    expect(cta()).toHaveTextContent(/Hazte Pro/);
    await userEvent.click(cta());
    expect(push).not.toHaveBeenCalled();
  });

  it("without a token nothing happens", async () => {
    mount({ token: null });

    await userEvent.click(cta());
    expect(push).not.toHaveBeenCalled();
  });

  it("with no chapters at all there is nothing to open", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mount({ first: null });

    await userEvent.click(cta());

    expect(push).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
