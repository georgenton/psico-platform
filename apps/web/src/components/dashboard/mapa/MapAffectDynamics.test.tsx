import { cleanup, render, screen } from "@testing-library/react";
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
      recoveryNeeded: 20,
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

  it("renders the human story (headline + phrases + hybrid % chips) when active", () => {
    const data: EmotionalMapAffectDynamics = {
      status: "active",
      nObs: 42,
      needed: 8,
      recoveryNeeded: 20,
      confidence: 1,
      baseline: 0.72,
      recovery: 0.83,
      stability: 0.66,
      inertiaDays: 0.2,
    };
    render(<MapAffectDynamics data={data} />);
    // Fase B' — descriptive headline (never an evaluation of the person).
    expect(
      screen.getByText(
        "Tus registros recientes se concentran en categorías agradables.",
      ),
    ).toBeInTheDocument();
    // Descriptive phrases, not evaluative claims.
    expect(
      screen.getByText("Nivel central en categorías agradables"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ritmo de retorno estimado: rápido"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Variación moderada alrededor de tu tendencia"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tono base")).not.toBeInTheDocument();
    // Hybrid: the numbers stay as small chips.
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByText("66%")).toBeInTheDocument();
    // Footer: honest evidence label (no certainty percentage) + inertia.
    expect(
      screen.getByText(/Basado en 42 registros de ánimo · base moderada/),
    ).toBeInTheDocument();
    expect(screen.getByText(/unas horas/)).toBeInTheDocument();
    // Non-diagnostic disclaimer present.
    expect(
      screen.getByText(/no constituyen un diagnóstico/i),
    ).toBeInTheDocument();
  });

  it("Etapa 4: leads with the direction and explains the detrended stability", () => {
    // A recovering user — v1 detected an upward trend.
    const data: EmotionalMapAffectDynamics = {
      status: "active",
      nObs: 43,
      needed: 8,
      recoveryNeeded: 20,
      confidence: 1,
      baseline: 0.98,
      recovery: 0.97,
      stability: 0.8,
      inertiaDays: 0.1,
      trend: "up",
    };
    render(<MapAffectDynamics data={data} />);
    // The trend IS the headline — described neutrally (Fase B' §23.5).
    expect(
      screen.getByText(
        "Durante las últimas semanas, tus registros han tendido hacia categorías que marcaste como más agradables.",
      ),
    ).toBeInTheDocument();
    // Explainer: current level ≠ window average; rising ≠ instability.
    expect(
      screen.getByText(/subir no cuenta como inestabilidad/i),
    ).toBeInTheDocument();
    // The three cards still render beneath.
    expect(
      screen.getByText("Nivel central en categorías agradables"),
    ).toBeInTheDocument();
  });

  it("Etapa 4: no trend banner when the mood is stationary", () => {
    const data: EmotionalMapAffectDynamics = {
      status: "active",
      nObs: 42,
      needed: 8,
      recoveryNeeded: 20,
      confidence: 1,
      baseline: 0.72,
      recovery: 0.83,
      stability: 0.66,
      inertiaDays: 0.2,
      trend: null,
    };
    render(<MapAffectDynamics data={data} />);
    expect(
      screen.queryByText(/no cuenta como inestabilidad/i),
    ).not.toBeInTheDocument();
  });

  it("Etapa 3: renders ± margins on the chips and explains them in the footer", () => {
    const data: EmotionalMapAffectDynamics = {
      status: "active",
      nObs: 42,
      needed: 8,
      recoveryNeeded: 20,
      confidence: 1,
      baseline: 0.72,
      recovery: 0.83,
      stability: 0.66,
      inertiaDays: 0.2,
      trend: null,
      margins: { baseline: 0.08, recovery: 0.17, stability: 0.2 },
    };
    render(<MapAffectDynamics data={data} />);
    expect(screen.getByText("72% ±8")).toBeInTheDocument();
    expect(screen.getByText("83% ±17")).toBeInTheDocument();
    expect(screen.getByText("66% ±20")).toBeInTheDocument();
    expect(
      screen.getByText(/El ± marca el rango probable/),
    ).toBeInTheDocument();
  });

  it("Etapa 3: plain chips (no ±, no footer note) for cached pre-Etapa-3 blobs", () => {
    const data: EmotionalMapAffectDynamics = {
      status: "active",
      nObs: 42,
      needed: 8,
      recoveryNeeded: 20,
      confidence: 1,
      baseline: 0.72,
      recovery: 0.83,
      stability: 0.66,
      inertiaDays: 0.2,
    };
    render(<MapAffectDynamics data={data} />);
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(
      screen.queryByText(/El ± marca el rango probable/),
    ).not.toBeInTheDocument();
  });

  it("Fase B' (L1): renders NO early-warning note even when a cached blob carries EWS data", () => {
    // EWS-R1 is research-only (sensitivity 40%, paper E5). Even if a cached
    // response still carries the block, the UI must not surface it.
    const base: EmotionalMapAffectDynamics = {
      status: "active",
      nObs: 90,
      needed: 8,
      recoveryNeeded: 100,
      confidence: 1,
      baseline: 0.4,
      recovery: 0.4,
      stability: 0.31,
      inertiaDays: 1.7,
      trend: null,
      ews: { status: "rising", tauAc: 0.87, tauVar: 0.84, needed: 60 },
    };
    render(<MapAffectDynamics data={base} />);
    expect(screen.queryByText(/Señal temprana/)).not.toBeInTheDocument();

    cleanup();
    render(
      <MapAffectDynamics
        data={{
          ...base,
          ews: { status: "steady", tauAc: -0.2, tauVar: 0.1, needed: 60 },
        }}
      />,
    );
    expect(screen.queryByText(/Señal temprana/)).not.toBeInTheDocument();
  });

  it("Etapa 1 + Fase B': gates the recovery row with an honest note until ~100 obs", () => {
    // Active with baseline + stability, but θ-derived axes still withheld.
    const data: EmotionalMapAffectDynamics = {
      status: "active",
      nObs: 12,
      needed: 8,
      recoveryNeeded: 100,
      confidence: 0.3,
      baseline: 0.72,
      recovery: null,
      stability: 0.55,
      inertiaDays: null,
    };
    render(<MapAffectDynamics data={data} />);
    // Baseline + stability phrases show with their chips.
    expect(
      screen.getByText("Nivel central en categorías agradables"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Variación moderada alrededor de tu tendencia"),
    ).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    // Recovery row shows the gathering note with the remaining count (88 more).
    expect(
      screen.getByText(/reuniendo más información · ~88 registros más/i),
    ).toBeInTheDocument();
  });
});
