/**
 * Cuándo vuelve a haber mensajes de Eco, contado en la zona de la persona.
 *
 * ── Por qué vive aquí y no en la API ───────────────────────────────────────
 *
 * El mismo instante se cuenta en dos superficies: el **mensaje** que compone el
 * servidor cuando alguien agota su cuota, y la **tarjeta** de Mi Plan. Hasta el
 * 2026-11-17 cada una lo contaba a su manera, y por eso discrepaban:
 *
 *   - el mensaje usa la zona declarada de la persona (`Profile.timezone`), así
 *     que en Quito dice «hoy a las 19:00»;
 *   - la tarjeta llamaba a `toLocaleTimeString` **sin** `timeZone`. Mi Plan es
 *     una página de servidor que importa la tarjeta directamente, así que ese
 *     formateador corría en el servidor y en la zona del servidor. Con el
 *     contenedor en UTC, la misma persona veía «00:00» en la tarjeta y «19:00»
 *     en el mensaje de Eco. El comentario que atribuía la conversión al
 *     navegador describía un recorrido que esa página no hace.
 *
 * La corrección no es pasar una zona en dos sitios distintos: es que las dos
 * superficies deriven la hora, el día y la palabra relativa de **esta** función.
 * Mismo patrón que `analyzeReflectionText` y `CHAPTER_EXERCISES`: lógica pura
 * compartida por API, web y móvil, sin Prisma ni Nest.
 *
 * ── El criterio, explícito ─────────────────────────────────────────────────
 *
 *   1. **Zona efectiva** = la declarada si es un nombre IANA válido; si no,
 *      UTC. La ausencia tiene un resultado definido, y quien la pinte puede
 *      decirlo (`zoneDeclared: false`) en vez de hacer pasar una hora UTC por
 *      una hora local.
 *   2. **La palabra relativa se calcula**, no se supone: se compara el día
 *      civil del reinicio con el día civil de `now`, los dos en la zona
 *      efectiva. En Quito, las 00:00 UTC son las 19:00 del MISMO día local, así
 *      que decir «mañana» ahí es falso — y «hoy» a las 00:00 UTC en Madrid
 *      también lo sería.
 *   3. **Reloj de 24 h.** `es-EC` por omisión es de 12 horas y la medianoche
 *      salía como «12:00 a. m.», que se lee como mediodía. Y `hour12: false`
 *      devuelve «24:00» en este ICU para ese mismo instante, así que la hora se
 *      arma desde `formatToParts` y el «24» se normaliza a «00».
 */

/**
 * Validador IANA. Se delega en `Intl.DateTimeFormat`, cuyo constructor lanza
 * `RangeError` ante un nombre desconocido: es la lista canónica, en el ICU de
 * la plataforma, sin empaquetar 4 KB de nombres.
 */
export function isValidIanaTimezone(tz: unknown): boolean {
  if (typeof tz !== "string") return false;
  if (tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** La zona en la que se va a contar: la declarada si vale, UTC si no. */
export function effectiveTimezone(timezone: string | null | undefined): string {
  return isValidIanaTimezone(timezone) ? (timezone as string) : "UTC";
}

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

export interface EcoResetParts {
  /** «19:00» — hora del reinicio en la zona efectiva, reloj de 24 h. */
  time: string;
  /**
   * El día civil del reinicio **relativo al de `now`**, en la zona efectiva.
   * `null` cuando no es ni hoy ni mañana, y entonces se nombra con `dayLabel`.
   */
  relative: "today" | "tomorrow" | null;
  /** «18 de noviembre» — el día del reinicio, nombrado. */
  dayLabel: string;
  /** `false` cuando no había zona declarada válida y se contó en UTC. */
  zoneDeclared: boolean;
}

/** Las piezas del reinicio, para que cada superficie las redacte a su medida. */
export function ecoResetParts(
  at: Date,
  timezone: string | null | undefined,
  now: Date,
): EcoResetParts {
  const tz = effectiveTimezone(timezone);
  const a = partes(at, tz);
  const h = partes(now, tz);
  const dayLabel = `${a.d} de ${MESES[a.m - 1]}`;
  const time = `${a.hh}:${a.mm}`;
  const zoneDeclared = isValidIanaTimezone(timezone);

  if (a.y === h.y && a.m === h.m && a.d === h.d) {
    return { time, relative: "today", dayLabel, zoneDeclared };
  }

  const manana = partes(new Date(now.getTime() + 24 * 60 * 60 * 1000), tz);
  if (a.y === manana.y && a.m === manana.m && a.d === manana.d) {
    return { time, relative: "tomorrow", dayLabel, zoneDeclared };
  }

  return { time, relative: null, dayLabel, zoneDeclared };
}

/**
 * «hoy a las 19:00» · «mañana a las 09:00» · «el 3 de diciembre a las 00:00».
 *
 * La frase que usa el mensaje de agotamiento de Eco. La tarjeta de Mi Plan no
 * la usa tal cual —necesita decir además de qué ventana es la cifra—, pero
 * deriva sus piezas de `ecoResetParts`, así que las dos cuentan igual.
 */
export function nextAvailabilityLabel(
  at: Date,
  timezone: string | null | undefined,
  now: Date,
): string {
  const p = ecoResetParts(at, timezone, now);
  if (p.relative === "today") return `hoy a las ${p.time}`;
  if (p.relative === "tomorrow") return `mañana a las ${p.time}`;
  return `el ${p.dayLabel} a las ${p.time}`;
}
