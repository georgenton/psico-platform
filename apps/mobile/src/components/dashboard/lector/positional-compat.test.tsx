import { render, waitFor } from "@testing-library/react-native";

const mockGetLocator = jest.fn();
const mockGetChapter = jest.fn();
const mockRedirect = jest.fn((_props: { href: string }) => null);

jest.mock("@psico/api-client", () => ({
  lectorApi: {
    getLocator: (...a: unknown[]) => mockGetLocator(...a),
    getChapter: (...a: unknown[]) => mockGetChapter(...a),
    getChapterByRef: jest.fn(),
  },
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ slug: "libro", chapterOrder: "3" }),
  Redirect: (props: { href: string }) => mockRedirect(props),
}));

import PositionalLectorRoute from "../../../../app/(tabs)/books/[slug]/lector/[chapterOrder]";

/**
 * The positional route is a redirect, not a reader.
 *
 * Old installed apps and existing deep links still carry a chapter number.
 * Resolving one must not look, in the reader's own history, like having opened
 * the chapter — which is exactly what rendering the full reader to discover the
 * target would have caused.
 */
describe("positional compatibility route", () => {
  beforeEach(() => {
    mockGetLocator.mockReset();
    mockGetChapter.mockReset();
    mockRedirect.mockReset().mockReturnValue(null);
  });

  it("resolves the position through the READ-ONLY locator", async () => {
    mockGetLocator.mockResolvedValue({
      bookSlug: "libro",
      readerRef: { kind: "unit", id: "u-b" },
    });

    render(<PositionalLectorRoute />);

    await waitFor(() => expect(mockRedirect).toHaveBeenCalled());
    expect(mockGetLocator).toHaveBeenCalledWith("libro", 3);
    // The write-bearing reader is never called for this.
    expect(mockGetChapter).not.toHaveBeenCalled();
    expect(mockRedirect.mock.calls[0][0]).toEqual({
      href: "/books/libro/lector/u/u-b",
    });
  });

  it("sends a legacy position to the chapter route", async () => {
    mockGetLocator.mockResolvedValue({
      bookSlug: "libro",
      readerRef: { kind: "chapter", id: "ch-c" },
    });

    render(<PositionalLectorRoute />);

    await waitFor(() => expect(mockRedirect).toHaveBeenCalled());
    expect(mockRedirect.mock.calls[0][0]).toEqual({
      href: "/books/libro/lector/c/ch-c",
    });
  });

  it("falls back to the book when nothing occupies that position", async () => {
    mockGetLocator.mockRejectedValue({ statusCode: 404 });

    render(<PositionalLectorRoute />);

    await waitFor(() => expect(mockRedirect).toHaveBeenCalled());
    // The book's chapter list is built from identities, so it is the one place
    // guaranteed to offer links we actually generated.
    expect(mockRedirect.mock.calls[0][0]).toEqual({ href: "/books/libro" });
    expect(mockGetChapter).not.toHaveBeenCalled();
  });
});
