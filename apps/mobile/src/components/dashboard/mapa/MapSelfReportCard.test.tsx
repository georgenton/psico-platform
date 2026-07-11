import { render, screen } from "@testing-library/react-native";
import type { EmotionalMapDimension } from "@psico/types";

import { MapSelfReportCard } from "./MapSelfReportCard";

/**
 * Fase F (decision L2) — mobile twin of MapSelfReport: check-in axes only,
 * "Autoinformado" label, honest gathering, no global percentage.
 */

function dim(
  key: EmotionalMapDimension["key"],
  over: Partial<EmotionalMapDimension> = {},
): EmotionalMapDimension {
  return {
    key,
    value: 0,
    confidence: 0,
    sources: "Se llenará con tus respuestas al check-in diario",
    measured: false,
    evidence: null,
    ...over,
  };
}

describe("MapSelfReportCard — Fase F (L2)", () => {
  it("shows the check-in CTA when no axis has answers", () => {
    render(
      <MapSelfReportCard
        dimensions={[dim("claridad"), dim("compasion"), dim("consciencia")]}
      />,
    );
    expect(
      screen.getByText(/Responde el check-in de 5 segundos/),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Autoinformado")).toBeNull();
  });

  it("renders answered axes with Autoinformado + answer count and gathers the rest", () => {
    render(
      <MapSelfReportCard
        dimensions={[
          dim("claridad", {
            value: 0.8,
            confidence: 1,
            measured: true,
            evidence: { modelId: "CHK-S1", n: 5 },
          }),
          dim("compasion"),
          dim("consciencia"),
        ]}
      />,
    );
    expect(screen.getByText("Autoinformado")).toBeOnTheScreen();
    expect(screen.getByText("80%")).toBeOnTheScreen();
    expect(
      screen.getByText(/Basado en 5 respuestas tuyas al check-in/),
    ).toBeOnTheScreen();
    expect(screen.getAllByText("Reuniendo datos")).toHaveLength(2);
    expect(screen.queryByText("Medido")).toBeNull();
  });

  it("does not treat an LLM-covered axis as answered (CHK-S1 only)", () => {
    render(
      <MapSelfReportCard
        dimensions={[
          dim("compasion", {
            value: 0.83,
            confidence: 0.9,
            measured: false,
            evidence: { modelId: "H1", n: 9 },
          }),
          dim("claridad"),
          dim("consciencia"),
        ]}
      />,
    );
    expect(screen.queryByText("Autoinformado")).toBeNull();
    expect(
      screen.getByText(/Responde el check-in de 5 segundos/),
    ).toBeOnTheScreen();
  });
});
