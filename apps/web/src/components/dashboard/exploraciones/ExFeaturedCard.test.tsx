import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JourneyListItem } from "@psico/types";
import { ExFeaturedCard } from "./ExFeaturedCard";

function journey(overrides: Partial<JourneyListItem> = {}): JourneyListItem {
  return {
    id: "j1",
    slug: "domar-autoexigencia",
    title: "Domar la autoexigencia",
    subtitle: "Un recorrido para aflojar la voz interna",
    description: "Combina lecturas y prácticas de 4 semanas",
    coverToken: "cool",
    durationMinutes: 180,
    books: [
      {
        slug: "emociones-en-construccion",
        title: "Emociones en construcción",
        authorName: "Marina Quintana",
        cover: "cool",
        durationMinutes: 120,
      },
    ],
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("ExFeaturedCard", () => {
  it("renders the journey title + description", () => {
    render(<ExFeaturedCard journey={journey()} />);
    expect(screen.getByText("Domar la autoexigencia")).toBeInTheDocument();
    expect(
      screen.getByText(/Combina lecturas y prácticas/i),
    ).toBeInTheDocument();
  });

  it("falls back to subtitle when description is null", () => {
    render(<ExFeaturedCard journey={journey({ description: null })} />);
    expect(
      screen.getByText(/Un recorrido para aflojar la voz interna/i),
    ).toBeInTheDocument();
  });

  it("links the CTA to the first bundled book", () => {
    render(<ExFeaturedCard journey={journey()} />);
    const link = screen.getByRole("link", { name: /Empezar/i });
    expect(link.getAttribute("href")).toBe(
      "/dashboard/biblioteca/emociones-en-construccion",
    );
  });

  it("links to /dashboard/biblioteca when journey has no books", () => {
    render(<ExFeaturedCard journey={journey({ books: [] })} />);
    const link = screen.getByRole("link", { name: /Empezar/i });
    expect(link.getAttribute("href")).toBe("/dashboard/biblioteca");
  });

  it("renders the book count + duration label", () => {
    render(
      <ExFeaturedCard
        journey={journey({
          books: [
            {
              slug: "a",
              title: "A",
              authorName: null,
              cover: "cool",
              durationMinutes: 60,
            },
            {
              slug: "b",
              title: "B",
              authorName: null,
              cover: "warm",
              durationMinutes: 60,
            },
          ],
          durationMinutes: 120,
        })}
      />,
    );
    expect(screen.getByText(/2 libros/i)).toBeInTheDocument();
    expect(screen.getByText(/2 horas/i)).toBeInTheDocument();
  });

  /**
   * #732 — el nivel del título lo decide quien monta la tarjeta.
   *
   * Antes esta tarjeta fijaba h3, y en `/dashboard/exploraciones` eso
   * producía h1 → h3: un salto que no rompe WCAG por sí solo, pero que
   * delataba quién estaba decidiendo. Ahora la página pide h2 y el defecto
   * conserva el nivel de antes para cualquier otro consumidor.
   */
  describe("#732 · el nivel del título", () => {
    it("por defecto conserva h3", () => {
      render(<ExFeaturedCard journey={journey()} />);
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    });

    it("acepta h2 cuando la pantalla se lo pide", () => {
      render(<ExFeaturedCard journey={journey()} tituloComo="h2" />);
      const h2s = screen.getAllByRole("heading", { level: 2 });
      expect(h2s).toHaveLength(1);
      expect(h2s[0]).toHaveTextContent(journey().title);
      // Y no queda ninguno del nivel viejo.
      expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    });
  });
});
