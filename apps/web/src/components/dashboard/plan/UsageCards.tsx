import type { UsageEco, UsageResponse } from "@psico/types";

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
      windowNote: ecoWindowNote(usage.eco),
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
          {formatPeriod(usage.period.start, usage.period.end)}
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
 * «hoy · vuelve a las 19:00» · «este periodo · hasta el 3 de dic» · «sin límite».
 *
 * La hora sale del reloj de quien mira, porque `resetsAt` es un instante y el
 * navegador lo pinta en su zona. El reinicio de FREE son las 00:00 UTC, que en
 * Quito es a las 19:00 del MISMO día — decir «mañana» sería falso.
 */
function ecoWindowNote(eco: UsageEco): string {
  if (eco.quota === null) return "sin límite";
  const resets = eco.resetsAt === null ? null : new Date(eco.resetsAt);
  if (eco.window.kind === "utc-day") {
    const hora = resets
      ? resets.toLocaleTimeString("es-EC", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    return hora ? `hoy · vuelve a las ${hora}` : "hoy";
  }
  const hasta = resets
    ? resets.toLocaleDateString("es-EC", { day: "numeric", month: "short" })
    : null;
  return hasta ? `este periodo · hasta el ${hasta}` : "este periodo";
}

function formatPeriod(start: Date | string, end: Date | string): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("es-EC", { day: "numeric", month: "short" });
  const startD = new Date(start);
  const endD = new Date(end);
  return `${fmt(startD)} – ${fmt(endD)}`;
}
