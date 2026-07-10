import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChapterListItem } from "@psico/types";
import { ChaptersList } from "./ChaptersList";

function ch(over: Partial<ChapterListItem>): ChapterListItem {
  return {
    n: 1,
    title: "Cap",
    durationMinutes: 10,
    lockedByTier: false,
    partNumber: null,
    partTitle: null,
    userProgress: { status: "not-started", progressPct: 0 },
    ...over,
  };
}

describe("ChaptersList — part grouping", () => {
  it("renders a 'PARTE I · …' heading when chapters carry a part", () => {
    render(
      <ChaptersList
        bookSlug="emociones-en-construccion"
        chapters={[
          ch({ n: 1, title: "¿Qué es una emoción?", partNumber: 1, partTitle: "Deconstruyendo lo que sabíamos" }), // prettier-ignore
          ch({ n: 2, title: "¿Emociones universales?", partNumber: 1, partTitle: "Deconstruyendo lo que sabíamos" }), // prettier-ignore
        ]}
      />,
    );
    expect(
      screen.getByText("Parte I · Deconstruyendo lo que sabíamos"),
    ).toBeInTheDocument();
    expect(screen.getByText("¿Qué es una emoción?")).toBeInTheDocument();
    expect(screen.getByText("¿Emociones universales?")).toBeInTheDocument();
  });

  it("shows one heading per part and keeps chapter order", () => {
    render(
      <ChaptersList
        bookSlug="x"
        chapters={[
          ch({ n: 1, partNumber: 1, partTitle: "Uno" }),
          ch({ n: 2, partNumber: 1, partTitle: "Uno" }),
          ch({ n: 3, partNumber: 2, partTitle: "Dos" }),
        ]}
      />,
    );
    expect(screen.getByText("Parte I · Uno")).toBeInTheDocument();
    expect(screen.getByText("Parte II · Dos")).toBeInTheDocument();
  });

  it("renders a flat list (no part heading) for part-less books", () => {
    render(
      <ChaptersList bookSlug="x" chapters={[ch({ n: 1 }), ch({ n: 2 })]} />,
    );
    expect(screen.queryByText(/Parte/)).not.toBeInTheDocument();
  });
});
