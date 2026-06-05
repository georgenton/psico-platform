import type { ReactNode } from "react";

/**
 * KpiCard — Sprint S48.
 *
 * Compact card used by the Pulso overview to surface a single metric. The
 * shape is intentionally minimal:
 *   - `label`     — short, sentence-case ("Usuarios totales").
 *   - `value`     — the headline number, rendered prominent.
 *   - `helper`    — optional context line (period, comparison, etc).
 *   - `accent`    — optional color hint for emphasis (e.g. crisis count).
 *
 * No sparkline / no delta arrow v1 — we punt those to S49 when we add a
 * time-series endpoint that returns the comparison values from the server.
 */
type Accent = "default" | "warning" | "danger" | "success";

export function KpiCard({
  label,
  value,
  helper,
  accent = "default",
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  accent?: Accent;
}) {
  const color =
    accent === "danger"
      ? "var(--color-rose-700, #BE123C)"
      : accent === "warning"
        ? "var(--color-amber-700, #B45309)"
        : accent === "success"
          ? "var(--color-sage-700, #2F5A2A)"
          : "var(--color-warm-900)";

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
      <p className="mt-2 text-[26px] font-bold leading-none" style={{ color }}>
        {value}
      </p>
      {helper ? (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          {helper}
        </p>
      ) : null}
    </div>
  );
}
