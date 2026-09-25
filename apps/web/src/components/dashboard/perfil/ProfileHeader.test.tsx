import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UserMeResponse } from "@psico/types";

import { PLAN_LABEL, ProfileHeader } from "./ProfileHeader";

/**
 * La cabecera del perfil tiene que caber a 320 px. #733.
 *
 * ── Qué prueba esto y qué NO ───────────────────────────────────────────────
 *
 * jsdom no maqueta: todo mide cero, así que aquí NO se puede demostrar que la
 * insignia quede dentro de la tarjeta ni que el documento no se desplace. Fingir
 * esa demostración sería peor que no tenerla.
 *
 * Lo que sí se puede fijar es el CONTRATO ESTRUCTURAL del que depende la
 * geometría, que es donde estuvo el fallo: quién puede encogerse, quién puede
 * envolver y quién no. Si alguien le devuelve a la insignia la capacidad de
 * encogerse, o le quita a la fila el permiso de envolver, esto falla aquí y no
 * tres meses después en el navegador de alguien.
 *
 * La geometría real se comprueba con la regresión en navegador descrita en el
 * PR: 6 anchos × 2 zooms × 4 combinaciones de estilo y ambiente × 4 etiquetas.
 */

function buildMe(
  overrides: Partial<UserMeResponse["user"]> = {},
): UserMeResponse {
  return {
    user: {
      id: "u1",
      firstName: "Ana",
      email: "ana@example.com",
      city: "Quito",
      country: "EC",
      timezone: null,
      tier: "free",
      joinedAt: new Date("2026-01-01"),
      initials: "A",
      avatarUrl: null,
      mood: null,
      ...overrides,
    },
    stats: {
      daysActive: 0,
      booksCompleted: 0,
      chaptersRead: 0,
      diaryEntries: 0,
      minutesTotal: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
    },
    achievements: [],
    preferences: {
      voicePreference: "none",
      moodPrompts: true,
      bestTime: "any",
      weeklyGoalMinutes: 60,
      theme: "system",
      language: "es-419",
      ambient: "calma",
    },
    readerPreferences: {
      theme: "sepia",
      font: "serif",
      fontSize: 16,
      lineHeight: 1.5,
    },
    notifications: {
      dailyReminder: true,
      reminderTime: "20:00",
      streakReminders: true,
      ecoReplies: true,
      terapiaReminders: true,
      weeklyReport: true,
    },
    privacy: {
      shareDiaryWithTherapist: false,
      anonymizedAnalytics: true,
      marketingEmail: false,
      localTextAnalysis: false,
      dataExportRequested: null,
      accountDeleteRequested: null,
    },
    cryptoSalt: null,
    cryptoSeedShownAt: null,
    onboardingState: null,
  } as UserMeResponse;
}

const clases = (el: Element | null) =>
  (el?.getAttribute("class") ?? "").split(/\s+/);

describe("la insignia del plan es una pieza y no se estruja", () => {
  it("no puede encogerse ni partir su texto", () => {
    render(<ProfileHeader me={buildMe()} />);
    const insignia = screen.getByTestId("plan-badge");
    // Las dos juntas son lo que impide la cápsula torcida: sin `shrink-0` la
    // píldora se estrecha, y al estrecharse `normal` le parte el texto.
    expect(clases(insignia)).toContain("shrink-0");
    expect(clases(insignia)).toContain("whitespace-nowrap");
  });

  it("la fila SÍ puede envolver, que es lo que la deja bajar entera", () => {
    render(<ProfileHeader me={buildMe()} />);
    const fila = screen.getByTestId("plan-badge").closest("section");
    // Sin esto, la insignia que no cabe no baja: empuja. Y lo que empuja acaba
    // desplazando el documento, que es el fallo de #733.
    expect(clases(fila)).toContain("flex-wrap");
  });

  it("el monograma conserva su medida en vez de cederla", () => {
    render(<ProfileHeader me={buildMe()} />);
    const fila = screen.getByTestId("plan-badge").closest("section")!;
    const monograma = fila.children[0];
    // Medido a 320 px antes del arreglo: 27.4 px de ancho por 64 de alto. Un
    // círculo con medida propia no negocia.
    expect(clases(monograma)).toContain("shrink-0");
    expect(clases(monograma)).toContain("h-16");
    expect(clases(monograma)).toContain("w-16");
  });
});

describe("las cuatro etiquetas del plan", () => {
  it("las que hoy llegan se pintan enteras y sin partir", () => {
    for (const [tier, esperado] of [
      ["free", "Gratuito"],
      ["pro", "Pro"],
    ] as const) {
      const { unmount } = render(<ProfileHeader me={buildMe({ tier })} />);
      const insignia = screen.getByTestId("plan-badge");
      // Un solo nodo de texto: el componente no trocea la etiqueta.
      expect(insignia.childNodes).toHaveLength(1);
      expect(insignia.textContent).toBe(esperado);
      unmount();
    }
  });

  it("las que todavía no llegan están contempladas y son las que más ocupan", () => {
    // `ANNUAL` y `B2B` no son alcanzables —`tier` sólo vale "free" o "pro"—,
    // pero son de dos palabras y son EXACTAMENTE la forma que rompía la
    // píldora. Se fijan aquí para que el día que se conecten no lleguen con el
    // fallo puesto, y para que quien añada una quinta vea que hay un contrato.
    expect(Object.keys(PLAN_LABEL).sort()).toEqual([
      "ANNUAL",
      "B2B",
      "FREE",
      "PRO",
    ]);
    for (const etiqueta of Object.values(PLAN_LABEL)) {
      expect(etiqueta.trim()).toBe(etiqueta);
      expect(etiqueta.length).toBeGreaterThan(0);
    }
    // Si alguien añade una etiqueta más larga que «Empresarial», conviene que
    // vuelva a medir a 320 px antes de darla por buena.
    const masLarga = Object.values(PLAN_LABEL).reduce((a, b) =>
      b.length > a.length ? b : a,
    );
    expect(masLarga).toBe("Empresarial");
  });
});
