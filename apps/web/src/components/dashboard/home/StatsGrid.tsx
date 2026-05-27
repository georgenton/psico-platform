import type { HomeStats } from "@psico/types";

/**
 * StatsGrid — three KPI cards for "Tu camino esta semana".
 *
 * Mirrors `web-stats` from docs/design/inicio/inicio.css with 3 stat blocks:
 *   - Streak (current/longest)
 *   - This-week minutes vs target + diary entries
 *   - Weekly goal progress bar
 *
 * The backend ships `minutesThisWeek` / `entriesThisWeek` / `weeklyGoalPct` /
 * `streakDays`. We do NOT receive a per-day breakdown — the prototype showed
 * `lastSevenDays` but the backend does not compute that yet. We render a
 * single progress bar plus a copy hint instead, keeping honesty about what
 * the system actually knows.
 */
export function StatsGrid({ stats }: { stats: HomeStats }) {
  const goalPct = Math.max(0, Math.min(100, Math.round(stats.weeklyGoalPct)));

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Tu camino esta semana
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Racha actual"
          value={stats.streakDays}
          unit="días"
          sub="Tu seguimiento diario"
        />
        <StatCard
          label="Esta semana"
          value={stats.minutesThisWeek}
          unit="min"
          sub={`${goalPct}% de tu meta`}
          progressPct={goalPct}
        />
        <StatCard
          label="Diario · entradas"
          value={stats.entriesThisWeek}
          unit={stats.entriesThisWeek === 1 ? "entrada" : "entradas"}
          sub="Esta semana"
        />
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  unit,
  sub,
  progressPct,
}: {
  label: string;
  value: number;
  unit: string;
  sub: string;
  progressPct?: number;
}) {
  return (
    <div
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--color-warm-500)" }}
      >
        {label}
      </div>
      <div
        className="mt-2.5 flex items-baseline gap-1.5 text-[28px] font-bold leading-none tracking-tight"
        style={{ color: "var(--color-warm-900)" }}
      >
        {value}
        <small
          className="text-[12px] font-medium"
          style={{ color: "var(--color-warm-500)" }}
        >
          {unit}
        </small>
      </div>
      {progressPct !== undefined ? (
        <div
          className="mt-2.5 h-1 overflow-hidden rounded-full"
          style={{ background: "var(--color-warm-100)" }}
          aria-hidden
        >
          <div
            className="h-full"
            style={{
              width: `${progressPct}%`,
              background: "var(--color-sage-400)",
            }}
          />
        </div>
      ) : null}
      <div
        className="mt-2 text-[11.5px] leading-snug"
        style={{ color: "var(--color-warm-500)" }}
      >
        {sub}
      </div>
    </div>
  );
}
