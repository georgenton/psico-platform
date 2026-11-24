import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HomeResponse, InsightKind } from "@psico/types";
import { InicioV2 } from "./InicioV2";

// Las ideas para Eco navegan al tocarse; aquí sólo importa lo que dicen.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
    // Resúmenes · 12 / semanales (Sprint G2b — real counter from
    // WeeklySummary.count). Decía «Insights · de Eco».
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Resúmenes")).toBeInTheDocument();
    // Etiquetas · 7 / que has usado (Sprint G2b — distinct tag count). Decía
    // «Patrones · detectados», y nadie detecta nada: son las que puso ella.
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Etiquetas")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/de Eco|detectados/);
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
        bookId: "book-emociones",
        bookSlug: "emociones-en-construccion",
        readerRef: { kind: "unit", id: "unit-pausa" },
        title: "Emociones",
        chapterId: "c3",
        chapterN: 3,
        chapterTitle: "La pausa",
        progressPct: 34,
      } as never,
    });
    render(<InicioV2 home={home} />);
    expect(screen.getByText(/Continúa tu recorrido/i)).toBeInTheDocument();
    // Book above, chapter below — and the chapter named by its title. `chapterN`
    // is the platform order, which is not the book's own chapter number.
    expect(screen.getByText("Emociones")).toBeInTheDocument();
    expect(screen.getByText("La pausa")).toBeInTheDocument();
    expect(screen.queryByText(/Capítulo\s*\d/)).toBeNull();
    // CTA → the chapter's STABLE identity. Position 3 appears nowhere in the
    // href, so restructuring the book cannot redirect this card.
    const link = screen.getByRole("link", { name: /Seguir leyendo/i });
    expect(link.getAttribute("href")).toBe(
      "/dashboard/biblioteca/emociones-en-construccion/lector/u/unit-pausa",
    );
  });

  it("los contadores se presentan como ACTIVIDAD, no como comprensión", () => {
    // Los cinco son actividad: reflexiones de la semana, resúmenes semanales,
    // etiquetas, minutos de lectura y días seguidos. Llamarlos «progreso de
    // comprensión» volvía a juntar aprendizaje y mundo interior en la primera
    // pantalla, que es justo lo que el programa V2 separó.
    render(<InicioV2 home={buildHome()} />);
    expect(screen.getByText("Tu actividad")).toBeInTheDocument();
    expect(screen.queryByText(/progreso de comprensión/i)).toBeNull();
  });

  it("la fila de lectura dice su destino real, no «comprensión»", () => {
    // El chip decía «+ comprensión». Leer alimenta Mi Evolución y, bajo V2, no
    // toca ningún eje del mapa — invariante con trinquete en la API
    // («+highlights ⇒ el mapa no cambia»).
    //
    // El fixture por omisión trae la lista de actividad VACÍA, así que hay que
    // sembrar una fila de lectura: sin ella esta prueba aprobaría cualquier
    // texto en el chip, que es exactamente lo que pasó al mutarla la primera
    // vez.
    render(
      <InicioV2
        home={buildHome({
          activity: {
            items: [
              {
                id: "a-read",
                type: "reading",
                title: "Emociones en Construcción",
                subtitle: "Capítulo 1",
                timestamp: new Date().toISOString(),
                href: null,
              },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText("+ evolución")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain("comprensión");
  });

  // ── De dónde sale lo que Inicio sugiere ─────────────────────────────────
  //
  // La tarjeta firmaba «Generado por Eco» y «solo tú puedes verlo» en los DOS
  // estados. Se montan los dos: ocultar la firma sólo cuando falta la frase
  // habría dejado la mitad de la mentira.

  it("cuenta inicial: frase fija, y la pantalla dice que lo es", () => {
    render(<InicioV2 home={buildHome({ insightToday: null })} />);
    expect(
      screen.getByText("Hoy es un buen día para mirarte con calma."),
    ).toBeInTheDocument();
    expect(screen.getByText("Mensaje general")).toBeInTheDocument();
    expect(
      screen.getByText("Es una frase fija: no sale de tu actividad."),
    ).toBeInTheDocument();
    const texto = document.body.textContent ?? "";
    expect(texto).not.toMatch(/Generado por Eco/i);
    expect(texto).not.toMatch(/solo tú puedes verlo/i);
    expect(texto).not.toMatch(/Según tu actividad/);
  });

  it.each([
    ["streak", "Aparece porque llevas varios días seguidos."],
    ["mood-trend", "Aparece porque marcaste el mismo ánimo varias veces"],
    ["book-progress", "Aparece porque tienes un libro empezado."],
    ["neutral", "Aparece porque leíste o escribiste esta semana."],
  ] as ReadonlyArray<[InsightKind, string]>)(
    "cuenta con actividad (%s): dice qué la disparó y que la elige una regla",
    (kind, causa) => {
      render(
        <InicioV2
          home={buildHome({
            insightToday: { kind, headline: "—", body: "La frase de hoy." },
          })}
        />,
      );
      expect(screen.getByText("La frase de hoy.")).toBeInTheDocument();
      expect(screen.getByText("Según tu actividad")).toBeInTheDocument();
      expect(screen.getByText(new RegExp(causa))).toHaveTextContent(
        "La elige una regla, no una IA.",
      );
      const texto = document.body.textContent ?? "";
      expect(texto).not.toMatch(/Generado por Eco/i);
      expect(texto).not.toMatch(/solo tú puedes verlo/i);
    },
  );

  const ecoMoment = (ids: string[]): HomeResponse["ecoMoment"] => ({
    prompt: "¿Cómo te encontró este día?",
    lastActiveAt: null,
    pendingMessages: 0,
    suggestions: ids.map((id) => ({
      id,
      title: `Tema ${id}`,
      prompt: "…",
      reason: `Razón ${id}`,
      scope: null,
    })) as never,
  });

  it("las ideas para Eco no se le atribuyen a Eco, y las de reserva no dicen «tu actividad»", () => {
    const { unmount } = render(
      <InicioV2 home={buildHome({ ecoMoment: ecoMoment(["cold-start"]) })} />,
    );
    expect(
      screen.getByText("Ideas para conversar con Eco"),
    ).toBeInTheDocument();
    expect(screen.getByText("Para empezar cuando quieras")).toBeInTheDocument();
    expect(screen.queryByText("Según tu actividad reciente")).toBeNull();
    unmount();

    render(
      <InicioV2
        home={buildHome({
          ecoMoment: ecoMoment(["continue-chapter", "cold-start"]),
        })}
      />,
    );
    expect(screen.getByText("Según tu actividad reciente")).toBeInTheDocument();
    const texto = document.body.textContent ?? "";
    expect(texto).not.toMatch(/Eco te sugiere/);
    // Si Eco responde o no depende de la cuota y del proveedor: nadie lo mira.
    expect(texto).not.toMatch(/Disponible ahora/);
  });

  it("la tarjeta de continuar no inventa minutos ni una conexión personal", () => {
    render(
      <InicioV2
        home={buildHome({
          continueBook: {
            bookId: "b",
            bookSlug: "emociones-en-construccion",
            readerRef: { kind: "unit", id: "u" },
            title: "Emociones",
            chapterN: 3,
            chapterTitle: "La pausa",
            progressPct: 34,
          } as never,
        })}
      />,
    );
    const texto = document.body.textContent ?? "";
    expect(texto).toContain("34% completado");
    expect(texto).not.toMatch(/min para terminar/);
    expect(texto).not.toMatch(/conecta con tu camino/);
  });

  it.each(["diary", "eco"] as const)(
    "la fila de %s dice «+ evolución»: no alimenta el mapa ni los patrones",
    (type) => {
      render(
        <InicioV2
          home={buildHome({
            activity: {
              items: [
                {
                  id: "a1",
                  type,
                  title: "Fila",
                  subtitle: "—",
                  timestamp: new Date().toISOString(),
                  href: null,
                },
              ],
            },
          })}
        />,
      );
      expect(screen.getByText("+ evolución")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/\+ (mapa|patrón)/);
    },
  );

  it("la fila de dictado no lleva chip: no cuenta en ninguna parte", () => {
    render(
      <InicioV2
        home={buildHome({
          activity: {
            items: [
              {
                id: "a-voz",
                type: "voice",
                title: "Dictado",
                subtitle: "12s grabados",
                timestamp: new Date().toISOString(),
                href: null,
              },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText("Dictado")).toBeInTheDocument();
    expect(document.querySelector(".a-fed")).toBeNull();
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
