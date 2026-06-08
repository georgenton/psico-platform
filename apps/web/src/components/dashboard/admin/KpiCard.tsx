import type { ReactNode } from "react";
import { DeltaBadge } from "./DeltaBadge";
import { Sparkline } from "./Sparkline";

/**
 * KpiCard — Sprint S48 + S50.
 *
 * Compact card used by the Pulso overview to surface a single metric.
 *
 *   - `label`     — short, sentence-case ("Usuarios totales").
 *   - `value`     — the headline number, rendered prominent.
 *   - `helper`    — optional context line (period, comparison, etc).
 *   - `accent`    — optional color hint for emphasis.
 *
 * Sprint S50 extensions:
 *   - `series`        — optional array of N daily observations. When
 *                       provided, renders a Sparkline below the helper.
 *   - `delta`         — optional last-7 vs prev-7 percent change. When
 *                       provided, renders a DeltaBadge next to the value.
 *   - `deltaInverted` — flips the semantic so "more = bad" (e.g. crisis
 *                       events). Default false.
 *
 * Both are passive: a card with no series + no delta renders identically
 * to the S48 shape, so older usages keep working.
 */
type Accent = "default" | "warning" | "danger" | "success";

export function KpiCard({
  label,
  value,
  helper,
  accent = "default",
  series,
  delta,
  deltaInverted = false,
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  accent?: Accent;
  series?: readonly number[];
  delta?: number | null;
  deltaInverted?: boolean;
}) {
  const color =
    accent === "danger"
      ? "var(--color-rose-700, #BE123C)"
      : accent === "warning"
        ? "var(--color-amber-700, #B45309)"
        : accent === "success"
          ? "var(--color-sage-700, #2F5A2A)"
          : "var(--color-warm-900)";

  const hasDelta = delta !== undefined;

  return (
    <div
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <p
        className="text-[11.5px] uppercase tracking-wide"
        style={{ color: "var(--color-warm-500)" }}
      >
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-[26px] font-bold leading-none" style={{ color }}>
          {value}
        </p>
        {hasDelta ? (
          <DeltaBadge value={delta ?? null} inverted={deltaInverted} />
        ) : null}
      </div>
      {helper ? (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          {helper}
        </p>
      ) : null}
      {series && series.length > 0 ? (
        <div className="mt-3">
          <Sparkline
            values={series}
            ariaLabel={`${label} — últimos ${series.length} días`}
            stroke={
              accent === "danger"
                ? "var(--color-rose-500, #E11D48)"
                : accent === "warning"
                  ? "var(--color-amber-500, #F59E0B)"
                  : accent === "success"
                    ? "var(--color-sage-500, #6FAE65)"
                    : "var(--color-lavender-500, #8B7CBF)"
            }
          />
        </div>
      ) : null}
    </div>
  );
}
