/**
 * The book detail screen must call the same hooks, in the same order, in every
 * state it can render.
 *
 * ── What this is defending ────────────────────────────────────────────────
 *
 * `useState` used to be declared at line 147, AFTER three early returns
 * (`!user`, `loading`, `error || !detail`). The first render returns inside the
 * loading branch and never reaches the hook; the next one does. React counts
 * hooks per render, so it threw
 *
 *   "Rendered more hooks than during the previous render"
 *
 * and the screen crashed on EVERY open — the main route out of the library.
 *
 * Nothing caught it: `react-hooks/rules-of-hooks` was not configured for this
 * workspace (the shared ESLint config has no React plugin at all), CI excludes
 * mobile from `build` so Metro never bundles the app, and this route had no
 * test.
 *
 * The lint rule is now enabled and is the primary guard — it catches the defect
 * statically, before anything runs. This test is the behavioural half: it drives
 * the component through loading → success and loading → error and asserts React
 * never complains, which is what "the user can open a book" actually means.
 */
import { act, render, waitFor } from "@testing-library/react-native";

const mockUseLocalSearchParams = jest.fn(() => ({ slug: "libro-de-prueba" }));
const mockGetDetail = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@psico/api-client", () => ({
  booksApi: {
    // The real method names. An earlier version of this mock used `getBook`,
    // which does not exist — so the component called `undefined`, its try/catch
    // caught the TypeError, and the "error state" test passed for entirely the
    // wrong reason. Named exactly as the component calls them.
    getDetail: (...args: unknown[]) => mockGetDetail(...args),
    start: jest.fn(),
    toggleFavorite: jest.fn(),
    toggleBookmark: jest.fn(),
  },
}));

jest.mock("@/context/auth", () => ({
  useAuth: () => ({ user: { id: "u1", plan: "FREE" } }),
}));

import BookDetailScreen from "./[slug]";

/**
 * React reports a changed hook count by throwing during render, which React
 * Native Testing Library surfaces as a failed render. It ALSO logs the error,
 * so the console is watched: a swallowed hook error would otherwise look like a
 * passing test with an empty tree.
 */
function watchConsole() {
  const seen: string[] = [];
  const spy = jest
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      seen.push(args.map(String).join(" "));
    });
  return {
    seen,
    restore: () => spy.mockRestore(),
    assertNoHookError() {
      const offending = seen.filter((m) =>
        /hooks than during|Rules of Hooks/i.test(m),
      );
      expect(offending).toStrictEqual([]);
    },
  };
}

/**
 * Shaped from `BookDetailResponse` in `@psico/types`, not invented. Earlier
 * drafts guessed field by field and the test failed on fixture shape instead of
 * on the thing it is about.
 */
const detail = {
  book: {
    id: "b1",
    slug: "libro-de-prueba",
    title: "Libro de prueba",
    subtitle: null,
    authorId: "a1",
    authorName: "Autora",
    cover: "warm",
    coverArtUrl: null,
    categoryId: null,
    categorySlug: null,
    chapters: 1,
    pages: 100,
    durationMinutes: 30,
    publishedOn: null,
    rating: 0,
    reviewCount: 0,
    tierRequired: "free",
    summary: null,
    isFavorite: false,
    isBookmarked: false,
    favoritedAt: null,
    bookmarkedAt: null,
    userProgress: null,
  },
  author: { id: "a1", name: "Autora", bio: null, avatarUrl: null },
  chaptersList: [
    {
      n: 1,
      readerRef: { kind: "chapter", id: "c1" },
      title: "Capítulo uno",
      durationMinutes: 15,
      lockedByTier: false,
      partNumber: null,
      partTitle: null,
      userProgress: { status: "not-started", progressPct: 0 },
    },
  ],
  rating: { avg: 0, count: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
  reviews: [],
  userProgress: null,
  continueReaderRef: null,
  isFavorite: false,
  isBookmarked: false,
};

describe("BookDetailScreen · hook order is stable across states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ slug: "libro-de-prueba" });
  });

  /**
   * Asserted on the console rather than on rendered text, deliberately.
   *
   * What this test is about is the hook COUNT across renders, not the layout.
   * Querying for specific copy would couple it to the whole component tree —
   * icons, theme, nested lists — and make it fail for reasons that have nothing
   * to do with the invariant. React reports the defect by throwing during
   * render and logging it, so the log is the precise signal.
   */
  it("loading → success does not change the hook count", async () => {
    const c = watchConsole();
    let resolve!: (v: unknown) => void;
    mockGetDetail.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<BookDetailScreen />);
    // The first commit is the loading branch — the state whose early return
    // used to skip the hook. The fetch starts in an effect, which RNTL flushes
    // asynchronously, so it is awaited rather than asserted synchronously.
    await waitFor(() =>
      expect(mockGetDetail).toHaveBeenCalledWith("libro-de-prueba"),
    );

    // The second render, with data. This is the transition that threw.
    await act(async () => {
      resolve(detail);
    });

    c.assertNoHookError();
    c.restore();
  });

  it("loading → error does not change the hook count either", async () => {
    const c = watchConsole();
    mockGetDetail.mockRejectedValue(new Error("boom"));

    render(<BookDetailScreen />);
    await waitFor(() => expect(mockGetDetail).toHaveBeenCalled());
    await act(async () => {});

    c.assertNoHookError();
    c.restore();
  });

  it("the loading state alone commits without crashing", async () => {
    // Pinned on its own to make an asymmetry visible: with the hook misplaced,
    // this state still commits fine — it is the SECOND render that throws. So
    // the two transition tests above are the ones that bite, and a test that
    // only rendered the loading state would have passed against the bug.
    const c = watchConsole();
    mockGetDetail.mockReturnValue(new Promise(() => {}));

    expect(() => render(<BookDetailScreen />)).not.toThrow();

    c.assertNoHookError();
    c.restore();
  });
});
