import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapFeed } from "./MapFeed";

/**
 * Fase C — MapFeed is now a pointer to Mi Evolución. The map page must not
 * present engagement counters as map sources (copy contract).
 */
describe("MapFeed", () => {
  it("renders the pointer to Mi Evolución with no counters", () => {
    render(<MapFeed />);
    expect(screen.getByText("Tu actividad")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver mi actividad en Evolución/i }),
    ).toHaveAttribute("href", "/dashboard/evolucion");
  });

  it("carries no engagement counts nor source framing", () => {
    const { container } = render(<MapFeed />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/alimentando tu mapa/i);
    expect(text).not.toMatch(/racha actual/i);
    expect(text).not.toMatch(/minutos de lectura/i);
    // No numeric chips at all.
    expect(container.querySelectorAll(".feed-chip .n")).toHaveLength(0);
  });
});
