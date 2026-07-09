import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { EmotionalMapDimension } from "@psico/types";
import { MapInfoButton } from "./MapInfoButton";

const DIMENSIONS: EmotionalMapDimension[] = [
  { key: "calma", value: 0.6, confidence: 0.7, sources: "tono del diario" },
  {
    key: "conexion",
    value: 0,
    confidence: 0.05,
    sources: "lectura y conversaciones con Eco",
  },
];

describe("MapInfoButton", () => {
  it("is closed by default (no dialog rendered)", () => {
    render(<MapInfoButton dimensions={DIMENSIONS} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the transparency modal with the privacy guarantee", async () => {
    const user = userEvent.setup();
    render(<MapInfoButton dimensions={DIMENSIONS} />);
    await user.click(
      screen.getByRole("button", {
        name: /cómo se mide tu mapa emocional/i,
      }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Privacidad primero/i)).toBeInTheDocument();
    // Covered axis shows a percentage; uncovered shows "Reuniendo datos"
    // (the intro paragraph also mentions the term, so there are ≥2).
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(
      screen.getAllByText("Reuniendo datos").length,
    ).toBeGreaterThanOrEqual(1);
    // The source hints are surfaced so the user knows what feeds each axis.
    expect(screen.getByText("tono del diario")).toBeInTheDocument();
  });

  it("closes when the × button is clicked", async () => {
    const user = userEvent.setup();
    render(<MapInfoButton dimensions={DIMENSIONS} />);
    await user.click(screen.getByRole("button", { name: /cómo se mide/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
