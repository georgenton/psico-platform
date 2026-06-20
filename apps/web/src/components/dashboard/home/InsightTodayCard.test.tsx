import { render, screen } from "@testing-library/react";
import type { InsightToday } from "@psico/types";
import { InsightTodayCard } from "./InsightTodayCard";

describe("InsightTodayCard", () => {
  it("renders nothing when insight is null", () => {
    const { container } = render(<InsightTodayCard insight={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders headline + body + kind label", () => {
    const insight: InsightToday = {
      kind: "streak",
      headline: "Llevas 5 días seguidos",
      body: "Tu constancia es la práctica.",
    };
    render(<InsightTodayCard insight={insight} />);
    expect(screen.getByText("Tu racha")).toBeInTheDocument();
    expect(screen.getByText("Llevas 5 días seguidos")).toBeInTheDocument();
    expect(
      screen.getByText("Tu constancia es la práctica."),
    ).toBeInTheDocument();
  });

  it("renders CTA when ctaHref is set", () => {
    const insight: InsightToday = {
      kind: "book-progress",
      headline: "Estás a la mitad",
      body: "Sigue.",
      ctaHref: "/dashboard/biblioteca",
      ctaLabel: "Seguir leyendo",
    };
    render(<InsightTodayCard insight={insight} />);
    const cta = screen.getByRole("link", { name: /Seguir leyendo/ });
    expect(cta).toHaveAttribute("href", "/dashboard/biblioteca");
  });

  it("falls back to 'Continuar' label when ctaLabel is missing", () => {
    const insight: InsightToday = {
      kind: "neutral",
      headline: "Hoy es un buen día",
      body: "Un par de minutos.",
      ctaHref: "/dashboard/eco",
    };
    render(<InsightTodayCard insight={insight} />);
    expect(screen.getByRole("link", { name: /Continuar/ })).toHaveAttribute(
      "href",
      "/dashboard/eco",
    );
  });

  it("does not render a CTA when ctaHref is absent", () => {
    const insight: InsightToday = {
      kind: "mood-trend",
      headline: "Patrón",
      body: "Lo notamos.",
    };
    render(<InsightTodayCard insight={insight} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
