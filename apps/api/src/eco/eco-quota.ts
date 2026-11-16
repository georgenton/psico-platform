import type { Plan } from "@prisma/client";
import type { EcoQuotaWindowKind } from "@psico/types";
import { PLAN_QUOTAS } from "../subscription/quotas";
import { isValidTimezone } from "../jobs/utils/timezone";

/**
 * La ventana de cuota de Eco — UNA sola, para la puerta y para el informe.
 *
 * ── El defecto que cierra ──────────────────────────────────────────────────
 *
 * La puerta y la pantalla de Mi Plan calculaban la cuota de Eco por separado,
 * y por tanto podían discrepar — y discrepaban. Medido contra el servicio
 * desplegado el 2026-11-16 con una cuenta FREE: `/api/billing/usage` informaba
 * `{"messagesThisPeriod":10,"quota":20}` **en el mismo instante** en que Eco
 * rechazaba el mensaje número 11.
 *
 * Las dos cifras eran ciertas por separado y la suma era falsa:
 *
 *   - la puerta aplica **10 mensajes por día UTC** en FREE;
 *   - el informe publicaba **20 por periodo de facturación**, que sale de
 *     `PLAN_QUOTAS.FREE.eco` y que Eco **no aplica nunca** — en FREE,
 *     `computeQuotaRemaining` devuelve antes de llegar a esa tabla;
 *   - y el consumo que publicaba era el del **mes calendario**, así que
 *     comparaba un consumo mensual con una cantidad que ni era mensual ni se
 *     aplicaba.
 *
 * Cambiar 20 por 10 no lo arreglaba: seguiría comparando un consumo mensual
 * con un límite diario. Lo que hacía falta era que **las dos superficies
 * preguntaran a la misma función**, y es ésta.
 *
 * ── Qué se conserva y qué no ───────────────────────────────────────────────
 *
 * Los límites **no cambian**: son los que el servicio ya aplicaba. Esto no
 * introduce una restricción mensual para FREE ni toca precios. Y no toca las
 * ventanas de voz, Diario ni libros: ésas siguen siendo las del periodo de
 * facturación, que es lo correcto para ellas.
 *
 * ── Dirección de la dependencia, a propósito ───────────────────────────────
 *
 * Vive en `eco/` y la importa `subscription/usage.service.ts`, no al revés: la
 * autoridad sobre la cuota de Eco es de Eco, y el informe se somete a ella.
 * Al contrario, el informe volvería a poder contar otra cosa.
 */

/** FREE: diez mensajes de usuario por día UTC. */
export const FREE_ECO_DAILY_LIMIT = 10;

export interface EcoQuotaWindow {
  /** Cuántos mensajes caben en la ventana. `null` = sin límite (B2B). */
  limit: number | null;
  /** Inicio de la ventana que de verdad limita. */
  start: Date;
  /** Fin **exclusivo**: también es el instante en que vuelve a haber cupo. */
  end: Date;
  kind: EcoQuotaWindowKind;
}

/** Lo mínimo que hace falta de la suscripción, para no arrastrar Prisma aquí. */
export interface EcoSubscriptionPeriod {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  status: string;
}

/** Los tres estados en los que el periodo de la suscripción es el vigente. */
const PERIODO_VIGENTE = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

function inicioDelDiaUtc(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * La ventana que limita el uso de Eco para este plan, ahora.
 *
 * FREE se resuelve por **día UTC** y no consulta la suscripción: es la regla
 * que la puerta aplica, y mezclarla con el periodo de facturación es justo lo
 * que produjo la discrepancia.
 */
export function ecoQuotaWindow(
  plan: Plan,
  sub: EcoSubscriptionPeriod | null,
  now: Date,
): EcoQuotaWindow {
  if (plan === "FREE") {
    const start = inicioDelDiaUtc(now);
    return {
      limit: FREE_ECO_DAILY_LIMIT,
      start,
      end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      kind: "utc-day",
    };
  }

  const limit = PLAN_QUOTAS[plan].eco;

  if (sub !== null && PERIODO_VIGENTE.has(sub.status)) {
    return {
      limit,
      start: sub.currentPeriodStart,
      end: sub.currentPeriodEnd,
      kind: "subscription",
    };
  }

  // Sin periodo vigente: mes calendario UTC, igual que antes. No es un cupo
  // nuevo — es el respaldo que `resolveBillingPeriod` ya usaba.
  return {
    limit,
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    kind: "calendar-month",
  };
}

/** Cuándo vuelve a haber mensajes. `null` cuando no hay límite que agotar. */
export function ecoResetsAt(window: EcoQuotaWindow): Date | null {
  return window.limit === null ? null : window.end;
}

/** Lo que queda. `null` cuando no hay límite. */
export function ecoRemaining(
  window: EcoQuotaWindow,
  used: number,
): number | null {
  return window.limit === null ? null : Math.max(0, window.limit - used);
}

// ─── El mensaje de agotamiento ───────────────────────────────────────────────

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** La zona efectiva: la de la persona si es válida, UTC si no. */
function zona(timezone: string | null): string {
  return timezone !== null && isValidTimezone(timezone) ? timezone : "UTC";
}

/** `{ y, m, d, hh, mm }` del instante, en la zona pedida. */
function partes(
  at: Date,
  tz: string,
): { y: number; m: number; d: number; hh: string; mm: string } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  // `hour12: false` puede dar «24» a medianoche en algunos ICU; se normaliza,
  // que es precisamente el instante del reinicio de FREE.
  const h = g("hour") === "24" ? "00" : g("hour");
  return {
    y: Number(g("year")),
    m: Number(g("month")),
    d: Number(g("day")),
    hh: h,
    mm: g("minute"),
  };
}

/**
 * «hoy a las 19:00» · «mañana a las 09:00» · «el 3 de diciembre a las 00:00».
 *
 * El día sólo se nombra cuando difiere del día local de la persona en el
 * momento de la negativa. En Quito, las 00:00 UTC son las 19:00 del MISMO día
 * local, así que decir «vuelve mañana» sería falso — y era lo que decía el
 * mensaje anterior.
 */
export function nextAvailabilityLabel(
  at: Date,
  timezone: string | null,
  now: Date,
): string {
  const tz = zona(timezone);
  const a = partes(at, tz);
  const h = partes(now, tz);
  const hora = `${a.hh}:${a.mm}`;

  if (a.y === h.y && a.m === h.m && a.d === h.d) return `hoy a las ${hora}`;

  const manana = partes(new Date(now.getTime() + 24 * 60 * 60 * 1000), tz);
  if (a.y === manana.y && a.m === manana.m && a.d === manana.d) {
    return `mañana a las ${hora}`;
  }

  return `el ${a.d} de ${MESES[a.m - 1]} a las ${hora}`;
}

/**
 * Qué se le dice a quien agotó su cuota.
 *
 * ── Por qué no sirve un solo mensaje ───────────────────────────────────────
 *
 * El anterior decía, a todo el mundo: «Has usado tus mensajes de Eco para hoy.
 * Vuelve mañana o hazte Pro.» Tres problemas, y los tres se leen en voz alta:
 *
 *   1. a una cuenta **PRO o ANNUAL** le recomienda contratar el plan que ya
 *      tiene;
 *   2. a esa misma cuenta le promete un reinicio «mañana» cuando su cuota
 *      depende del periodo de su suscripción, que puede acabar en tres
 *      semanas;
 *   3. **«hazte Pro» promete una contratación que el piloto no ofrece.** Los
 *      cobros están cerrados, así que esa frase manda a una persona a una
 *      puerta que no existe.
 *
 * Así que el mensaje se compone de la ventana real y, cuando la hay, de la
 * zona de la persona. Nada de planes: sólo cuánto cabía y cuándo vuelve.
 */
export function ecoExhaustedMessage(input: {
  window: EcoQuotaWindow;
  timezone: string | null;
  now: Date;
}): string {
  const { window, timezone, now } = input;
  // Sin límite no se agota nada; si alguien llega aquí, no se inventa una cifra.
  if (window.limit === null) {
    return "No pudimos enviar tu mensaje. Reintenta en unos minutos.";
  }

  const cuantos = `${window.limit} mensaje${window.limit === 1 ? "" : "s"}`;
  const cuando = nextAvailabilityLabel(window.end, timezone, now);

  if (window.kind === "utc-day") {
    return `Has usado tus ${cuantos} de Eco de hoy. Vuelves a tener mensajes ${cuando}.`;
  }
  return `Has usado tus ${cuantos} de Eco de este periodo. Vuelves a tener mensajes ${cuando}.`;
}
