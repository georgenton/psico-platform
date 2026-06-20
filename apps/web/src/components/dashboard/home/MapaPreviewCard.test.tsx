import { render, screen } from "@testing-library/react";
import { MapaPreviewCard } from "./MapaPreviewCard";

describe("MapaPreviewCard", () => {
  it("renders the heading + eyebrow + sample-data note", () => {
    render(<MapaPreviewCard />);
    expect(screen.getByText("Mapa Emocional")).toBeInTheDocument();
    expect(screen.getByText("Tu firma de hoy")).toBeInTheDocument();
    expect(screen.getByText(/datos de muestra/i)).toBeInTheDocument();
  });

  it("links the CTA to /dashboard/mapa", () => {
    render(<MapaPreviewCard />);
    expect(screen.getByRole("link", { name: /Ver completo/ })).toHaveAttribute(
      "href",
      "/dashboard/mapa",
    );
  });

  it("renders an accessible SVG", () => {
    const { container } = render(<MapaPreviewCard />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-label", expect.stringContaining("Mapa"));
  });
});
