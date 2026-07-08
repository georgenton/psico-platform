import Link from "next/link";
import type { PulsoReportReason, PulsoReportSummary } from "@psico/types";

/**
 * Top-row chips with per-reason counts. The active chip carries a
 * `?reason=...` querystring; the "Todos" chip clears the filter.
 */
const REASONS: Array<{ value: PulsoReportReason; label: string }> = [
  { value: "HALLUCINATION", label: "Inventó info" },
  { value: "OFF_TONE", label: "Tono" },
  { value: "SENSITIVE_CONTENT", label: "Sensible" },
  { value: "CRISIS_MISHANDLED", label: "Crisis no detect." },
  { value: "OTHER", label: "Otra" },
];

export function ReasonChips({
  summary,
  active,
}: {
  summary: PulsoReportSummary;
  active: PulsoReportReason | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/dashboard/admin/reports"
        className="rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold"
        style={
          active === null
            ? {
                background: "var(--color-warm-900)",
                color: "var(--color-warm-50)",
                borderColor: "var(--color-warm-900)",
              }
            : {
                background: "var(--bg-surface)",
                color: "var(--color-warm-700)",
                borderColor: "var(--color-warm-200)",
              }
        }
      >
        Todos · {summary.total}
      </Link>
      {REASONS.map((r) => {
        const isActive = active === r.value;
        const count = summary.byReason[r.value];
        return (
          <Link
            key={r.value}
            href={`/dashboard/admin/reports?reason=${r.value}`}
            className="rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold"
            style={
              isActive
                ? {
                    background: "var(--color-lavender-600)",
                    color: "white",
                    borderColor: "var(--color-lavender-600)",
                  }
                : {
                    background: "var(--bg-surface)",
                    color: "var(--color-warm-700)",
                    borderColor: "var(--color-warm-200)",
                  }
            }
          >
            {r.label} · {count}
          </Link>
        );
      })}
    </div>
  );
}
