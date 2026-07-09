import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EmotionalMapAffectDynamics } from "@psico/types";
import { MapAffectDynamics } from "./MapAffectDynamics";

describe("MapAffectDynamics", () => {
  it("renders nothing when data is null (kill-switch off)", () => {
    const { container } = render(<MapAffectDynamics data={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the gathering progress state", () => {
    const data: EmotionalMapAffectDynamics = {
      status: "gathering",
      nObs: 3,
      needed: 8,
      confidence: 0,
      baseline: null,
      recovery: null,
      stability: null,
      inertiaDays: null,
    };
    render(<MapAffectDynamics data={data} />);
    expect(screen.getByText(/Reuniendo datos/)).toBeInTheDocument();
    expect(screen.getByText(/3 de ~8/)).toBeInTheDocument();
    // No fabricated metric values while gathering.
    expect(screen.queryByText("Tono base")).not.toBeInTheDocument();
  });

  it("renders the four estimated metrics when active", () => {
    const data: EmotionalMapAffectDynamics = {
      status: "active",
      nObs: 42,
      needed: 8,
      confidence: 1,
      baseline: 0.6,
      recovery: 0.4,
      stability: 0.7,
      inertiaDays: 2.5,
    };
    render(<MapAffectDynamics data={data} />);
    expect(screen.getByText("Tono base")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument(); // baseline
    expect(screen.getByText("70%")).toBeInTheDocument(); // stability
    expect(screen.getByText("2.5 d")).toBeInTheDocument(); // inertia
    expect(screen.getByText(/Confianza 100%/)).toBeInTheDocument();
    // Non-diagnostic disclaimer present.
    expect(screen.getByText(/no.*un diagnóstico/i)).toBeInTheDocument();
  });
});
