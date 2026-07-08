import type { UsageResponse } from "@psico/types";

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
      current: usage.eco.messagesThisPeriod,
      quota: usage.eco.quota,
      unit: "",
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
}

function UsageCard({ icon, label, current, quota, unit }: CardItem) {
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

function formatPeriod(start: Date | string, end: Date | string): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("es-EC", { day: "numeric", month: "short" });
  const startD = new Date(start);
  const endD = new Date(end);
  return `${fmt(startD)} – ${fmt(endD)}`;
}
