import { render, screen } from "@testing-library/react";
import type { BookListItem } from "@psico/types";
import { BookCard } from "./BookCard";

/**
 * A card must not offer to start a book the reader has already opened.
 *
 * "Started" used to be inferred from `progressPct > 0`, which quietly assumed
 * that opening a book always produces a percentage. It does not: somebody who
 * has started chapter one and finished nothing sits at 0%, and that card told
 * them to "Empezar" a book sitting on their own shelf.
 *
 * The two questions are separate now — whether there is a progress summary at
 * all decides the CTA; whether it is above zero decides the bar.
 */

const book = (userProgress: BookListItem["userProgress"]): BookListItem =>
  ({
    id: "b1",
    slug: "libro",
    title: "Libro",
    subtitle: null,
    authorId: null,
    authorName: "Autora",
    cover: "cool",
    coverArtUrl: null,
    categoryId: null,
    categorySlug: null,
    chapters: 3,
    pages: 100,
    durationMinutes: 60,
    publishedOn: null,
    rating: 0,
    reviewCount: 0,
    tierRequired: "free",
    isFavorite: false,
    isBookmarked: false,
    favoritedAt: null,
    bookmarkedAt: null,
    userProgress,
  }) as BookListItem;

const mount = (userProgress: BookListItem["userProgress"]) =>
  render(
    <BookCard book={book(userProgress)} apiBase="https://api.test" token="t" />,
  );

describe("BookCard — started state", () => {
  it("a book opened but not progressed still says «Seguir leyendo»", () => {
    const { container } = mount({
      startedAt: new Date("2026-08-01T10:00:00.000Z"),
      lastChapterRead: 1,
      progressPct: 0,
      completedAt: null,
    });

    expect(screen.getByText(/Seguir leyendo/)).toBeInTheDocument();
    expect(screen.queryByText(/Empezar/)).toBeNull();
    // No empty bar: 0% communicates nothing the CTA does not already say.
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("a book never opened says «Empezar»", () => {
    mount(null);

    expect(screen.getByText(/Empezar/)).toBeInTheDocument();
    expect(screen.queryByText(/Seguir leyendo/)).toBeNull();
  });

  it("a book in progress says «Seguir leyendo» and shows how far", () => {
    mount({
      startedAt: new Date("2026-08-01T10:00:00.000Z"),
      lastChapterRead: 2,
      progressPct: 40,
      completedAt: null,
    });

    expect(screen.getByText(/Seguir leyendo/)).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("a finished book still says «Seguir leyendo»", () => {
    // Unchanged behaviour — the card has never had a distinct "finished" CTA,
    // and inventing one is not this repair's business.
    mount({
      startedAt: new Date("2026-08-01T10:00:00.000Z"),
      lastChapterRead: 3,
      progressPct: 100,
      completedAt: new Date("2026-08-05T10:00:00.000Z"),
    });

    expect(screen.getByText(/Seguir leyendo/)).toBeInTheDocument();
  });
});
