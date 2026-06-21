import { render, screen } from "@testing-library/react";
import type { JourneyListItem } from "@psico/types";
import { JourneyCard } from "./JourneyCard";

const baseJourney: JourneyListItem = {
  id: "j1",
  slug: "asentar-emociones",
  title: "Asentar las emociones",
  subtitle: "Un camino para mirar lo que sientes.",
  description: "Empieza por nombrar y termina con una práctica.",
  coverToken: "cool",
  durationMinutes: 96,
  books: [
    {
      slug: "emociones-en-construccion",
      title: "Emociones en Construcción",
      authorName: "Marina Quintana",
      cover: "warm",
      durationMinutes: 96,
    },
  ],
  publishedAt: new Date("2026-06-01"),
};

describe("JourneyCard", () => {
  it("renders title, subtitle and description", () => {
    render(<JourneyCard journey={baseJourney} />);
    expect(screen.getByText("Asentar las emociones")).toBeInTheDocument();
    expect(
      screen.getByText("Un camino para mirar lo que sientes."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Empieza por nombrar/)).toBeInTheDocument();
  });

  it("shows duration label + book count summary", () => {
    render(<JourneyCard journey={baseJourney} />);
    expect(screen.getByText(/1 libro/)).toBeInTheDocument();
    // "2 horas" appears twice: once in the journey eyebrow + once on the
    // single book row (it has the same total). Both surfaces are wanted.
    expect(screen.getAllByText(/2 horas/).length).toBeGreaterThanOrEqual(1);
  });

  it("links each book to its biblioteca detail page", () => {
    render(<JourneyCard journey={baseJourney} />);
    expect(
      screen.getByRole("link", { name: /Emociones en Construcción/ }),
    ).toHaveAttribute(
      "href",
      "/dashboard/biblioteca/emociones-en-construccion",
    );
  });

  it("falls back to 'Sin autor' when the author is null", () => {
    const j = {
      ...baseJourney,
      books: [{ ...baseJourney.books[0]!, authorName: null }],
    };
    render(<JourneyCard journey={j} />);
    expect(screen.getByText(/Sin autor/)).toBeInTheDocument();
  });

  it("renders multi-book pluralization", () => {
    const j = {
      ...baseJourney,
      books: [
        baseJourney.books[0]!,
        { ...baseJourney.books[0]!, slug: "familias-ensambladas", title: "B" },
      ],
    };
    render(<JourneyCard journey={j} />);
    expect(screen.getByText(/2 libros/)).toBeInTheDocument();
  });
});
