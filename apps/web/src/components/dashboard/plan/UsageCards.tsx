import type { UsageEco, UsageResponse } from "@psico/types";
import { ecoResetParts, effectiveTimezone } from "@psico/types";

/**
 * UsageCards — Sprint front-fase1 (Mi Plan web).
 *
 * Renders the four counters returned by `GET /api/subscriptions/usage`:
 *
 *   - Books completed this period
 *   - Eco messages this period
 *   - Voice minutes this period
 *   - Diary entries this period
 *
 * Display rules:
 *   - `quota === null` → "ilimitado" (B2B for everything, Pro on diary).
 *   - `quota === 0`    → "no incluido" (FREE on voice).
 *   - `quota > 0`      → progress bar with current/quota.
 *
 * The component is pure — it receives the already-fetched UsageResponse so
 * the page server-renders without two waterfalls.
 */
export function UsageCards({ usage }: { usage: UsageResponse | null }) {
  if (!usage) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{
          background: "var(--color-warm-50)",
          border: "1.5px solid var(--color-warm-200)",
          color: "var(--color-warm-500)",
        }}
      >
        <p className="text-sm">
          No pudimos cargar tu uso. Reintenta en unos minutos.
        </p>
      </div>
    );
  }

  const items: CardItem[] = [
    {
      icon: "📚",
      label: "Libros completados",
      current: usage.books.completedThisPeriod,
      quota: null, // books not capped
      unit: "",
    },
    {
      icon: "💬",
      label: "Mensajes con Eco",
      // La ventana que de VERDAD limita, no la del periodo de facturación. En
      // FREE son diez por día UTC, y esta tarjeta mostraba el consumo del mes
      // junto a un cupo de 20 que Eco no aplica: «10 de 20» justo cuando se
      // negaba el mensaje 11.
      current: usage.eco.used,
      quota: usage.eco.quota,
      unit: "",
      windowNote: ecoWindowNote(usage.eco, usage.timezone),
    },
    {
      icon: "🎙️",
      label: "Minutos de voz",
      current: usage.voice.minutesThisPeriod,
      quota: usage.voice.quota,
      unit: "min",
    },
    {
      icon: "✎",
      label: "Entradas del diario",
      current: usage.diary.entriesThisPeriod,
      quota: usage.diary.quota,
      unit: "",
    },
  ];

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-warm-800)" }}
        >
          Tu uso este período
        </h2>
        <span className="text-xs" style={{ color: "var(--color-warm-400)" }}>
          {formatPeriod(usage.period.start, usage.period.end, usage.timezone)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <UsageCard key={it.label} {...it} />
        ))}
      </div>

      {/*
        El consumo de Eco en el periodo de facturación: información real y
        útil, pero NO un cupo — Eco no lo aplica. Va aquí abajo, dicho como
        estadística, en vez de emparejado con un límite en la tarjeta.
      */}
      <p
        className="mt-2 text-[11px]"
        style={{ color: "var(--color-warm-400)" }}
      >
        Eco · en todo el período:{" "}
        {usage.eco.messagesThisPeriod.toLocaleString("es-EC")} mensaje
        {usage.eco.messagesThisPeriod === 1 ? "" : "s"}. Es una estadística, no
        un cupo.
      </p>
    </div>
  );
}

// ─── Internals ──────────────────────────────────────────────────────────────

interface CardItem {
  icon: string;
  label: string;
  current: number;
  /** null = unlimited; 0 = not included (e.g. FREE voice). */
  quota: number | null;
  unit: string;
  /**
   * Para Eco: qué ventana es esa cifra y cuándo vuelve el cupo.
   *
   * Las demás tarjetas no la llevan porque su ventana ES la del encabezado —
   * el periodo de facturación—. La de Eco no, y sin decirlo la cifra no se
   * puede interpretar.
   */
  windowNote?: string;
}

function UsageCard({
  icon,
  label,
  current,
  quota,
  unit,
  windowNote,
}: CardItem) {
  const ratio = quota && quota > 0 ? Math.min(1, current / quota) : 0;
  const isAtCap = quota !== null && quota > 0 && current >= quota;
  const isNotIncluded = quota === 0;

  return (
    <div
      className="flex flex-col rounded-2xl p-4"
      style={{
        background: "var(--bg-surface)",
        border: "1.5px solid var(--color-warm-200)",
      }}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg">
          {icon}
        </span>
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "var(--color-warm-500)" }}
        >
          {label}
        </span>
      </div>
      <p
        className="mt-2 text-xl font-bold"
        style={{
          color: isAtCap
            ? "var(--color-error-text, #B91C1C)"
            : "var(--color-warm-800)",
        }}
      >
        {current.toLocaleString("es-EC")}
        {unit ? ` ${unit}` : ""}
      </p>

      <p
        className="mt-1 text-[11px]"
        style={{ color: "var(--color-warm-400)" }}
      >
        {quota === null
          ? "ilimitado"
          : isNotIncluded
            ? "no incluido en tu plan"
            : `de ${quota.toLocaleString("es-EC")}${unit ? ` ${unit}` : ""}`}
      </p>

      {windowNote ? (
        <p
          className="mt-0.5 text-[11px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          {windowNote}
        </p>
      ) : null}

      {/* Progress bar (only when there's a numeric quota > 0). */}
      {quota !== null && quota > 0 ? (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full"
          style={{ background: "var(--color-warm-100)" }}
          aria-label={`${Math.round(ratio * 100)}% usado`}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${ratio * 100}%`,
              background: isAtCap
                ? "var(--color-error-text, #B91C1C)"
                : "var(--color-lavender-500)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * «hoy · vuelve a las 19:00» · «este periodo · hasta el 3 de diciembre» ·
 * «sin límite».
 *
 * ── La zona es de la persona, y hay que pasarla ────────────────────────────
 *
 * Esta tarjeta se pinta en el **servidor**: `/dashboard/plan` es una página de
 * servidor que la importa directamente. Así que un `toLocaleTimeString` sin
 * `timeZone` se resuelve en la zona del CONTENEDOR, no en la de quien mira — y
 * el contenedor está en UTC. Medido el 2026-11-17 sobre el artefacto servido:
 * una cuenta con `America/Guayaquil` declarada veía «00:00» aquí mientras el
 * mensaje de Eco, compuesto por el servidor con esa misma zona, decía «19:00».
 * El comentario anterior atribuía la conversión al navegador; ese recorrido no
 * pasa por el navegador.
 *
 * Por eso la hora, el día y la palabra relativa salen de `ecoResetParts`, que
 * es la MISMA función que usa el mensaje de Eco. No es que coincidan: es que no
 * pueden discrepar.
 *
 * Sin zona declarada válida se cuenta en UTC y **se dice** («a las 00:00 UTC»),
 * en vez de hacer pasar una hora UTC por una hora local.
 */
function ecoWindowNote(
  eco: UsageEco,
  timezone: string | null | undefined,
): string {
  if (eco.quota === null) return "sin límite";
  const resets = eco.resetsAt === null ? null : new Date(eco.resetsAt);
  if (resets === null) {
    return eco.window.kind === "utc-day" ? "hoy" : "este periodo";
  }

  const p = ecoResetParts(resets, timezone, new Date());
  const zona = p.zoneDeclared ? "" : " UTC";

  if (eco.window.kind === "utc-day") {
    // «hoy» describe la CIFRA (el consumo de hoy); la palabra del reinicio se
    // calcula aparte, porque son dos días distintos: en Quito el reinicio de
    // las 00:00 UTC cae hoy a las 19:00, y en Madrid mañana a la 01:00.
    if (p.relative === "today") return `hoy · vuelve a las ${p.time}${zona}`;
    if (p.relative === "tomorrow") {
      return `hoy · vuelve mañana a las ${p.time}${zona}`;
    }
    return `hoy · vuelve el ${p.dayLabel} a las ${p.time}${zona}`;
  }
  return `este periodo · hasta el ${p.dayLabel}`;
}

/**
 * El rango del periodo, también en la zona de la persona.
 *
 * Mismo motivo: estas fechas se pintaban en el servidor. Un periodo que acaba
 * el 1 de diciembre a las 00:00 UTC acaba el 30 de noviembre para quien vive en
 * Quito, y antes se le decía «1 dic». No cambia ninguna ventana ni ningún
 * contador: cambia en qué calendario se leen sus límites.
 */
function formatPeriod(
  start: Date | string,
  end: Date | string,
  timezone: string | null | undefined,
): string {
  const tz = effectiveTimezone(timezone);
  const fmt = (d: Date) =>
    d.toLocaleDateString("es-EC", {
      day: "numeric",
      month: "short",
      timeZone: tz,
    });
  return `${fmt(new Date(start))} – ${fmt(new Date(end))}`;
}
