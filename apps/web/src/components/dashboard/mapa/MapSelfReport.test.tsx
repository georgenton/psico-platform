import { render, screen } from "@testing-library/react";
import type { EmotionalMapDimension } from "@psico/types";

import { MapSelfReport } from "./MapSelfReport";

/**
 * Fase F (decision L2) — the radar survives ONLY as "Resumen de tus
 * respuestas": check-in axes, "Autoinformado" label, honest gathering states,
 * and never a global percentage.
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

const answered = (
  key: EmotionalMapDimension["key"],
  value: number,
  n: number,
) =>
  dim(key, {
    value,
    confidence: 1,
    measured: true,
    evidence: { modelId: "CHK-S1", n },
    sources: "Tus respuestas al check-in diario",
  });

describe("MapSelfReport — Fase F (L2)", () => {
  it("shows the check-in CTA when no axis has answers", () => {
    render(
      <MapSelfReport
        dimensions={[dim("claridad"), dim("compasion"), dim("consciencia")]}
      />,
    );
    expect(
      screen.getByText(/Responde el check-in de 5 segundos/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Autoinformado")).not.toBeInTheDocument();
  });

  it("renders answered axes with the Autoinformado chip + answer count, never 'Medido'", () => {
    render(
      <MapSelfReport
        dimensions={[
          answered("claridad", 0.75, 6),
          dim("compasion"),
          dim("consciencia"),
        ]}
      />,
    );
    expect(screen.getAllByText("Autoinformado")).toHaveLength(1);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(
      screen.getByText(/Basado en 6 respuestas tuyas al check-in/),
    ).toBeInTheDocument();
    // Unanswered axes gather honestly.
    expect(screen.getAllByText("Reuniendo datos")).toHaveLength(2);
    // L2: no "Medido" badge and no global percentage label anywhere.
    expect(screen.queryByText("Medido")).not.toBeInTheDocument();
    expect(screen.queryByText(/Comprensión/)).not.toBeInTheDocument();
  });

  it("does not treat an LLM-covered axis as answered (CHK-S1 only)", () => {
    render(
      <MapSelfReport
        dimensions={[
          dim("claridad", {
            value: 0.8,
            confidence: 0.9,
            measured: false,
            evidence: { modelId: "H1", n: 12 },
          }),
          dim("compasion"),
          dim("consciencia"),
        ]}
      />,
    );
    expect(screen.queryByText("Autoinformado")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Responde el check-in de 5 segundos/),
    ).toBeInTheDocument();
  });

  it("compact mode renders the rows without the section frame", () => {
    render(
      <MapSelfReport
        dimensions={[
          answered("claridad", 0.5, 3),
          dim("compasion"),
          dim("consciencia"),
        ]}
        compact
      />,
    );
    expect(screen.getByText("Autoinformado")).toBeInTheDocument();
    expect(screen.queryByText("Cómo me describí")).not.toBeInTheDocument();
  });
});
