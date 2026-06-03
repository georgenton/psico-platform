import type { PatronesHourMoodBucket } from "@psico/types";

/**
 * HourMoodChart — 24-bar horizontal chart showing where the user logs the
 * most across the day. Each bar's color comes from the dominant mood of
 * that hour (max-count moodId across the period).
 *
 * We pass a `swatchByMood` map computed in the page from the catalog to
 * keep this component pure server-renderable (no client state).
 */
export function HourMoodChart({
  hourMood,
  swatchByMood,
}: {
  hourMood: PatronesHourMoodBucket[];
  swatchByMood: Record<string, string>;
}) {
  // Compute the dominant mood per hour and a normalised bar height.
  const totals = hourMood.map((b) => {
    const entries = Object.entries(b.moodCounts);
    if (entries.length === 0) return { hour: b.hour, count: 0, swatch: null };
    let best = entries[0]!;
    let total = 0;
    for (const [mood, count] of entries) {
      total += count;
      if (count > best[1]) best = [mood, count];
    }
    return {
      hour: b.hour,
      count: total,
      swatch: swatchByMood[best[0]] ?? "var(--color-warm-300)",
    };
  });

  const maxCount = Math.max(1, ...totals.map((t) => t.count));

  return (
    <section>
      <h3
        className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Tu día emocional · ¿cuándo escribes?
      </h3>
      <div
        className="rounded-2xl border-[1.5px] bg-white p-4"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <div
          className="grid grid-cols-12 gap-1"
          role="img"
          aria-label="Mood por hora del día"
        >
          {totals.map((t) => {
            const height = Math.round((t.count / maxCount) * 80) + 4;
            return (
              <div
                key={t.hour}
                className="flex flex-col items-center justify-end gap-1"
                title={`${t.hour}h · ${t.count} entradas`}
              >
                <div
                  className="w-full rounded-t-md"
                  style={{
                    height,
                    background: t.swatch ?? "var(--color-warm-200)",
                    opacity: t.count ? 1 : 0.3,
                  }}
                />
                <span
                  className="text-[9.5px] font-mono"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  {t.hour}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
