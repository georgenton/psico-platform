import type { UserStats } from "@psico/types";

type Stat = {
  label: string;
  value: number;
  unit?: string;
  emoji: string;
};

export function StatsGrid({ stats }: { stats: UserStats }) {
  const items: Stat[] = [
    {
      label: "Racha actual",
      value: stats.currentStreakDays,
      unit: stats.currentStreakDays === 1 ? "día" : "días",
      emoji: "🔥",
    },
    {
      label: "Libros completados",
      value: stats.booksCompleted,
      emoji: "📚",
    },
    {
      label: "Entradas del diario",
      value: stats.diaryEntries,
      emoji: "✎",
    },
    {
      label: "Minutos en la app",
      value: stats.minutesTotal,
      unit: "min",
      emoji: "⏱️",
    },
  ];

  return (
    <section data-testid="stats-grid">
      <h2
        className="mb-2 text-[14px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Tu actividad
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((s) => (
          <article
            key={s.label}
            className="rounded-2xl border-[1.5px] bg-white p-4"
            style={{ borderColor: "var(--color-warm-200)" }}
            data-testid={`stat-${s.label}`}
          >
            <div className="text-[20px]" aria-hidden>
              {s.emoji}
            </div>
            <p
              className="mt-1 text-[18px] font-bold leading-none"
              style={{ color: "var(--color-warm-900)" }}
            >
              {s.value.toLocaleString("es-419")}
              {s.unit ? (
                <span
                  className="ml-1 text-[12px] font-medium"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  {s.unit}
                </span>
              ) : null}
            </p>
            <p
              className="mt-1 text-[12px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              {s.label}
            </p>
          </article>
        ))}
      </div>
      {stats.longestStreakDays > 0 ? (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Mejor racha histórica: {stats.longestStreakDays}{" "}
          {stats.longestStreakDays === 1 ? "día" : "días"}
        </p>
      ) : null}
    </section>
  );
}
