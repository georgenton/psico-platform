/**
 * DeltaBadge — Sprint S50.
 *
 * Renders the last-7 vs prev-7 percent change as a colored chip. The
 * service clamps "previous = 0" to 999 so the UI can show "+>999%" rather
 * than divide by zero, and returns `null` when there's not enough history.
 *
 * Color rules:
 *  - `inverted = false` (default) — positive delta is "good" (more
 *    activity), rendered sage. Negative is rose. Use for engagement,
 *    content, etc.
 *  - `inverted = true` — positive delta is "bad" (more reports). Use for
 *    `reportsOpened`, `ecoCrisis`.
 */
export function DeltaBadge({
  value,
  inverted = false,
}: {
  value: number | null;
  inverted?: boolean;
}) {
  if (value === null) {
    return (
      <span
        className="text-[10.5px] uppercase tracking-wide"
        style={{ color: "var(--color-warm-400)" }}
      >
        sin datos
      </span>
    );
  }

  // Format. Clamp at 999 → "+>999%".
  const clamped = value >= 999;
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  const text = clamped
    ? "+>999%"
    : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

  // Positive/negative coloring respects the `inverted` semantic.
  const isPositiveSentiment = inverted ? value < 0 : value > 0;
  const isNegativeSentiment = inverted ? value > 0 : value < 0;
  const color = isPositiveSentiment
    ? "var(--color-sage-700, #2F5A2A)"
    : isNegativeSentiment
      ? "var(--color-rose-700, #BE123C)"
      : "var(--color-warm-500)";
  const bg = isPositiveSentiment
    ? "var(--color-sage-100, #DDEBD8)"
    : isNegativeSentiment
      ? "#FEE2E2"
      : "var(--color-warm-100)";

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
      style={{ background: bg, color }}
      title="Comparación últimos 7d vs 7d anteriores"
    >
      {arrow}
      {text}
    </span>
  );
}
