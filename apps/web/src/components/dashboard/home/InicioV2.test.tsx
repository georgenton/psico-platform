import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HomeResponse } from "@psico/types";
import { InicioV2 } from "./InicioV2";

function buildHome(overrides: Partial<HomeResponse> = {}): HomeResponse {
  return {
    user: {
      firstName: "Jorge",
      lastName: null,
      avatarUrl: null,
      plan: "FREE",
      role: "USER",
      mood: null,
      city: "Quito",
      streakDays: 5,
      onboardedAt: "2026-06-01T00:00:00Z",
    } as never,
    greeting: { text: "Buenas tardes", subtitle: "Una pausa." },
    continueBook: null,
    ecoMoment: null,
    recos: [],
    stats: {
      minutesThisWeek: 45,
      entriesThisWeek: 3,
      streakDays: 5,
      weeklyGoalPct: 80,
      insightsCount: 12,
      patternsCount: 7,
    },
    reflectionPrompt: null,
    shortcuts: [],
    ambient: "calma",
    insightToday: null,
    emotionalMap: {
      values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] as never,
      confidence: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6] as never,
      dimensions: [],
      pct: 50,
      coverage: 0.6,
      computedAt: "2026-06-21T12:00:00Z",
      provider: "anthropic",
    },
    activity: { items: [] },
    ...overrides,
  };
}

describe("InicioV2", () => {
  it("renders the 5 metrics with their honest counters", () => {
    render(<InicioV2 home={buildHome()} />);
    // Reflexiones · 3 / esta semana
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Reflexiones")).toBeInTheDocument();
    // Insights · 12 / de Eco (Sprint G2b — real counter from WeeklySummary.count)
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Insights")).toBeInTheDocument();
    // Patrones · 7 / detectados (Sprint G2b — distinct tag count)
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Patrones")).toBeInTheDocument();
    // Minutos · 45
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText(/Minutos de lectura/i)).toBeInTheDocument();
    // Días seguidos · 5
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/Días seguidos/i)).toBeInTheDocument();
  });

  it("renders the greeting block with firstName + city eyebrow", () => {
    render(<InicioV2 home={buildHome()} />);
    expect(screen.getByText(/Buenas tardes, Jorge\./i)).toBeInTheDocument();
    expect(screen.getByText(/Quito/i)).toBeInTheDocument();
  });

  it("renders the mini-map as the honest hexagon radar (no global %)", () => {
    render(<InicioV2 home={buildHome()} />);
    expect(screen.getByText(/Tu Mapa Emocional/i)).toBeInTheDocument();
    // The compact radar renders as an SVG; with no ready axes it's the empty
    // hexagon, never a fabricated global %.
    expect(
      screen.getByRole("img", { name: /radar de tu mapa emocional/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
  });

  it("falls back to the neutral 'empieza con una respiración' when activity is empty", () => {
    render(<InicioV2 home={buildHome()} />);
    expect(
      screen.getByText(/Empieza con una respiración/i),
    ).toBeInTheDocument();
  });

  it("renders the continue book card when one exists", () => {
    const home = buildHome({
      continueBook: {
        bookId: "emociones-en-construccion",
        title: "Emociones",
        chapterId: "c3",
        chapterN: 3,
        chapterTitle: "La pausa",
        progressPct: 34,
      } as never,
    });
    render(<InicioV2 home={home} />);
    expect(screen.getByText(/Continúa tu recorrido/i)).toBeInTheDocument();
    expect(screen.getByText(/Emociones — La pausa/i)).toBeInTheDocument();
    // CTA link → lector route
    const link = screen.getByRole("link", { name: /Seguir leyendo/i });
    expect(link.getAttribute("href")).toBe(
      "/dashboard/biblioteca/emociones-en-construccion/lector/3",
    );
  });

  it("PR-0.2: shows a maintenance note (not an empty radar) when emotionalMap is null", () => {
    render(<InicioV2 home={buildHome({ emotionalMap: null })} />);
    // The kill switch is off — a plain "in pause for maintenance" line, and NO
    // radar SVG (never zeros, never an empty hexagon).
    expect(screen.getByText(/en pausa por mantenimiento/i)).toBeInTheDocument();
    // The radar (aria-labelled) is NOT rendered — no empty hexagon, no zeros.
    expect(
      screen.queryByLabelText(/Radar de tu mapa emocional/i),
    ).not.toBeInTheDocument();
  });
});
