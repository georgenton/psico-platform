import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JourneyListItem } from "@psico/types";
import { ExCard } from "./ExCard";

function journey(overrides: Partial<JourneyListItem> = {}): JourneyListItem {
  return {
    id: "j1",
    slug: "del-perfeccionismo",
    title: "Del perfeccionismo a lo suficiente",
    subtitle: "Aprende a soltar el todo o nada",
    description: "Tres semanas de práctica con ejercicios",
    coverToken: "mixed",
    durationMinutes: 90,
    books: [
      {
        slug: "perfeccionismo",
        title: "Perfeccionismo",
        authorName: "Autor",
        cover: "warm",
        durationMinutes: 90,
      },
    ],
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("ExCard", () => {
  it("renders the journey title + description", () => {
    render(<ExCard journey={journey()} index={0} />);
    expect(
      screen.getByText("Del perfeccionismo a lo suficiente"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Tres semanas de práctica/i)).toBeInTheDocument();
  });

  it("renders the subtitle in the connect-pattern chip", () => {
    render(<ExCard journey={journey()} index={0} />);
    expect(
      screen.getByText(/Aprende a soltar el todo o nada/i),
    ).toBeInTheDocument();
  });

  it("maps mixed coverToken to the c3 cover class", () => {
    const { container } = render(<ExCard journey={journey()} index={0} />);
    expect(container.querySelector(".ex-cover.c3")).not.toBeNull();
  });

  it("maps cool coverToken to c1 + warm to c2", () => {
    const { container: c1 } = render(
      <ExCard journey={journey({ coverToken: "cool" })} index={0} />,
    );
    expect(c1.querySelector(".ex-cover.c1")).not.toBeNull();

    const { container: c2 } = render(
      <ExCard journey={journey({ coverToken: "warm" })} index={1} />,
    );
    expect(c2.querySelector(".ex-cover.c2")).not.toBeNull();
  });

  it("renders 1 lectura singular vs N lecturas plural", () => {
    const { rerender } = render(<ExCard journey={journey()} index={0} />);
    expect(screen.getByText(/1 lectura/i)).toBeInTheDocument();

    rerender(
      <ExCard
        journey={journey({
          books: [
            {
              slug: "a",
              title: "A",
              authorName: null,
              cover: "cool",
              durationMinutes: 30,
            },
            {
              slug: "b",
              title: "B",
              authorName: null,
              cover: "warm",
              durationMinutes: 30,
            },
            {
              slug: "c",
              title: "C",
              authorName: null,
              cover: "mixed",
              durationMinutes: 30,
            },
          ],
        })}
        index={0}
      />,
    );
    expect(screen.getByText(/3 lecturas/i)).toBeInTheDocument();
  });
});
