import type { PatronesMoodMapDay } from "@psico/types";

/**
 * MoodHeatmap — calendar-style strip of mood swatches.
 *
 * Each cell is a single day. Empty days render a soft warm-100 background
 * so the visual rhythm matches the design's "spaces of silence" rather
 * than a dense grid. We render rolling weeks (Monday-anchored) to keep
 * the chart compact for the 30-day default period.
 */
export function MoodHeatmap({ days }: { days: PatronesMoodMapDay[] }) {
  // Index by ISO date for O(1) lookup.
  const byDate = new Map(days.map((d) => [d.date, d]));

  // Build the dense calendar from the earliest to the latest ISO date.
  if (days.length === 0) {
    return (
      <p
        className="rounded-2xl border-[1.5px] bg-white p-6 text-center text-[13px]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-500)",
        }}
      >
        Necesitas escribir un poco más para ver tu mapa emocional.
      </p>
    );
  }

  const first = days[0]!.date;
  const last = days[days.length - 1]!.date;
  const start = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);

  const cells: Array<{ date: string; iso: string; swatch?: string }> = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const hit = byDate.get(iso);
    cells.push({
      date: d.toLocaleDateString("es-EC", {
        day: "numeric",
        month: "short",
      }),
      iso,
      swatch: hit?.swatch,
    });
  }

  return (
    <section>
      <h3
        className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Mapa emocional · día a día
      </h3>
      <div
        className="grid gap-1.5 rounded-2xl border-[1.5px] bg-white p-4"
        style={{
          borderColor: "var(--color-warm-200)",
          gridTemplateColumns: "repeat(auto-fill, minmax(28px, 1fr))",
        }}
        role="img"
        aria-label="Heatmap de mood por día"
      >
        {cells.map((c) => (
          <div
            key={c.iso}
            title={`${c.date}: ${c.swatch ? "registrado" : "sin entrada"}`}
            className="aspect-square rounded-md"
            style={{
              background: c.swatch ?? "var(--color-warm-100)",
              opacity: c.swatch ? 1 : 0.6,
            }}
          />
        ))}
      </div>
    </section>
  );
}
