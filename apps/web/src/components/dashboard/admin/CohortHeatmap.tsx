import type { PulsoCohortRetentionResponse } from "@psico/types";

/**
 * CohortHeatmap — Sprint S51.
 *
 * Classic SaaS retention triangle rendered as an HTML `<table>`. Rows are
 * signup cohorts (newest first); columns are week-offsets from signup.
 *
 * Each cell is colored by `pct` on a lavender-to-warm gradient so the
 * shape of the curve is visible at a glance:
 *   - 100% → strong lavender
 *   - 50%  → muted lavender
 *   - 0%   → warm-100
 *
 * The first column ("W0") is always 100% (every signup is "active" the
 * week they signed up — we use this as the calibration baseline). The
 * interesting story is column 1+: how steeply does it drop?
 *
 * Empty cells (offset > rowMaxOffset) get no background — the table
 * naturally renders the triangle shape.
 *
 * Cohort label is the Monday of the signup week, shown as "May 25" etc.
 */
export function CohortHeatmap({
  data,
}: {
  data: PulsoCohortRetentionResponse;
}) {
  if (data.rows.length === 0) {
    return (
      <p
        className="rounded-2xl border-[1.5px] bg-white p-6 text-center text-[13px]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-500)",
        }}
      >
        El cron de cohortes aún no ha generado data. Vuelve el próximo lunes a
        las 03:00 UTC.
      </p>
    );
  }

  // Header columns: W0, W1, ..., W{maxWeekOffset}.
  const headerCols = Array.from(
    { length: data.maxWeekOffset + 1 },
    (_, i) => i,
  );

  return (
    <div
      className="overflow-x-auto rounded-2xl border-[1.5px] bg-white p-2"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr>
            <th
              className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-warm-600)" }}
            >
              Cohorte
            </th>
            <th
              className="px-2 py-2 text-right font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-warm-600)" }}
            >
              N
            </th>
            {headerCols.map((offset) => (
              <th
                key={offset}
                className="px-2 py-2 text-center font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-warm-600)" }}
              >
                W{offset}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const cellsByOffset = new Map(
              row.cells.map((c) => [c.weekOffset, c]),
            );
            return (
              <tr
                key={row.cohortWeek}
                className="border-t"
                style={{ borderColor: "var(--color-warm-100)" }}
              >
                <td
                  className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-1.5 font-medium"
                  style={{ color: "var(--color-warm-900)" }}
                >
                  {formatCohortLabel(row.cohortWeek)}
                </td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums"
                  style={{ color: "var(--color-warm-600)" }}
                >
                  {row.cohortSize}
                </td>
                {headerCols.map((offset) => {
                  const cell = cellsByOffset.get(offset);
                  if (!cell) {
                    return <td key={offset} aria-hidden="true" />;
                  }
                  return (
                    <td
                      key={offset}
                      className="px-2 py-1.5 text-center font-medium tabular-nums"
                      style={{
                        background: cellBackground(cell.pct),
                        color: cellTextColor(cell.pct),
                      }}
                      title={`${cell.activeUsers} / ${row.cohortSize} activos`}
                    >
                      {cell.pct.toFixed(0)}%
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * "2026-05-25" → "May 25". Avoids `new Date(string)` which trips up on
 * Safari for ISO dates; we parse manually.
 */
function formatCohortLabel(iso: string): string {
  const [, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  return `${months[(m ?? 1) - 1]} ${d ?? ""}`.trim();
}

/**
 * Lavender gradient: 0% → warm-100, 100% → lavender-500.
 * Uses HSL interpolation so the midrange is visibly purple-tinted, not gray.
 */
function cellBackground(pct: number): string {
  if (pct <= 0) return "var(--color-warm-100, #F5F0EA)";
  // Lavender 500 is roughly hsl(263, 30%, 62%); we fade saturation + lighten
  // for lower retention.
  const sat = 30;
  const lightness = 92 - (pct / 100) * 30; // 92% → 62%
  return `hsl(263, ${sat}%, ${lightness}%)`;
}

function cellTextColor(pct: number): string {
  // Dark text on light backgrounds, light text on saturated lavender.
  return pct >= 55
    ? "var(--color-warm-50, #FAF7F2)"
    : "var(--color-warm-800, #4A3F33)";
}
