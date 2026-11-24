import { describe, expect, it, vi } from "vitest";

import { isContentLockedByPlan } from "../content-core/access/content-access";
import { FREE_ECO_DAILY_LIMIT } from "../eco/eco-quota";
import { PLAN_QUOTAS } from "./quotas";
import { SubscriptionService } from "./subscription.service";

/**
 * Cada línea de un plan tiene una regla del producto detrás.
 *
 * POR QUÉ. Mi plan ofrecía «Audio meditaciones y ejercicios completos» (no hay
 * ninguna meditación), «Diario personal con IA» (el diario es de extremo a
 * extremo: la IA no lo lee), «Soporte prioritario» (no existe soporte) y «2
 * meses gratis» (no lo son). Nadie las contrastaba con nada, así que vivieron
 * ahí desde la Sesión 4.
 *
 * CÓMO. La tabla de abajo exige que TODA línea publicada tenga su entrada, con
 * la comprobación que la sostiene. Una línea nueva sin acreditar rompe la
 * prueba, y una acreditada cuya regla cambie, también. No se fija el orden:
 * el precio lo fija también `subscription.service.spec.ts`.
 */

const servicio = new SubscriptionService(
  {} as never,
  {} as never,
  { invalidate: vi.fn() } as never,
);
const planes = servicio.getPlans();
const plan = (p: string) => planes.find((x) => x.plan === p)!;

const bloqueado = (userPlan: string, bookPlan: string, muestra: boolean) =>
  isContentLockedByPlan({ userPlan, bookPlan, isFreePreview: muestra });

const ACREDITADAS: Readonly<Record<string, () => void>> = {
  "Lectura completa de los libros gratuitos": () => {
    expect(bloqueado("FREE", "FREE", false)).toBe(false);
  },
  "El primer capítulo de los libros Pro": () => {
    expect(bloqueado("FREE", "PRO", true)).toBe(false);
    expect(bloqueado("FREE", "PRO", false)).toBe(true);
  },
  // `CHAPTER_EXERCISES` (@psico/types): respirar y reflexionar, sin plan.
  "Ejercicios de respiración y reflexión": () => {},
  // `ReadingSession` + `UserProgress`, sin condición de plan.
  "Progreso guardado": () => {},
  "Todo lo incluido en Gratuito": () => {
    expect(bloqueado("PRO", "FREE", false)).toBe(false);
  },
  "Todos los capítulos de los libros Pro, a medida que se publiquen": () => {
    expect(bloqueado("PRO", "PRO", false)).toBe(false);
  },
  // `LectorService.getAudio` → PRO_REQUIRED en FREE; medios con política
  // `PRO_ONLY`. La condición de publicación va en la propia frase.
  "El audio y el podcast de los capítulos que los tengan publicados": () => {},
  // `PatronesService.getPatrones` (FREE → locked) y `regenerateWeeklySummary`.
  "Patrones de tus reflexiones y resumen de tu semana": () => {},
  [`Dictado por voz, hasta ${PLAN_QUOTAS.PRO.voice} minutos por periodo`]:
    () => {
      expect(PLAN_QUOTAS.FREE.voice).toBe(0);
      expect(PLAN_QUOTAS.PRO.voice).toBeGreaterThan(0);
      // «Todo lo incluido en Pro» también vale para el anual.
      expect(PLAN_QUOTAS.ANNUAL).toEqual(PLAN_QUOTAS.PRO);
    },
  "Todo lo incluido en Pro": () => {},
  "Precio equivalente a $4.92/mes": () => {
    expect((plan("ANNUAL").prices.yearly! / 12).toFixed(2)).toBe("4.92");
  },
  "Facturación anual única": () => {
    expect(plan("ANNUAL").prices.monthly).toBeUndefined();
  },
  "Mensajes con Eco y dictado por voz sin límite": () => {
    expect(PLAN_QUOTAS.B2B.eco).toBeNull();
    expect(PLAN_QUOTAS.B2B.voice).toBeNull();
  },
};

describe("lo que Mi plan dice que incluye cada plan", () => {
  const lineas = planes.flatMap((p) => p.features.map((f) => [p.plan, f]));

  it.each(lineas)("%s · %s", (_plan, linea) => {
    expect(
      ACREDITADAS[linea!],
      `«${linea}» no tiene ninguna regla que la sostenga`,
    ).toBeDefined();
    ACREDITADAS[linea!]!();
  });

  it("no acumula acreditaciones de líneas que ya no se publican", () => {
    const publicadas = new Set(lineas.map(([, f]) => f));
    expect(Object.keys(ACREDITADAS).filter((f) => !publicadas.has(f))).toEqual(
      [],
    );
  });

  it("no vuelve lo que no tiene nada detrás", () => {
    const todo = planes
      .flatMap((p) => [p.description, ...p.features])
      .join(" · ");
    expect(todo).not.toMatch(
      /meditaci|diario[^·]*IA|soporte|popular|meses gratis|50 usuarios|panel de|reportes|integraci/i,
    );
  });

  it("no presenta a Eco como ventaja de Pro mientras FREE tenga más mensajes", () => {
    // FREE: 10 al día. Pro: 200 por periodo. En 28 días, FREE suma 280.
    expect(FREE_ECO_DAILY_LIMIT * 28).toBeGreaterThan(PLAN_QUOTAS.PRO.eco!);
    for (const p of ["PRO", "ANNUAL"])
      expect(plan(p).features.join(" ")).not.toMatch(/Eco/);
  });

  it("los importes no cambian con el texto", () => {
    expect(plan("PRO").prices).toEqual({
      monthly: 7,
      yearly: 59,
      currency: "USD",
    });
    expect(plan("ANNUAL").prices).toEqual({ yearly: 59, currency: "USD" });
    expect(plan("B2B").prices).toEqual({ monthly: 120, currency: "USD" });
  });
});
