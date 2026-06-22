import type { EvolucionStats } from "@psico/types";
import {
  IconBook,
  IconEco,
  IconFlame,
  IconReflections,
  IconWind,
} from "@/components/dashboard/shell/icons";

/**
 * MapFeed — Sprint F2.
 *
 * The `.map-feed` block from the design's `s-mapa` screen. Each chip
 * shows the cumulative count of something that's feeding the map.
 *
 * We surface counts we can derive from existing data:
 *  - Lecturas        ← `EvolucionStats.capitulosCompletados`
 *  - Reflexiones     ← `EvolucionStats.reflexiones`
 *  - Días activos    ← `EvolucionStats.diasActivos30d`
 *
 * The design also lists "Conversaciones con Eco" + "Ejercicios" + "Estados
 * de ánimo" — those don't have aggregate counts in the current backend
 * (only a top-5 activity feed). When we wire counters in EvolucionStats
 * we add them here without changing the layout.
 */
export function MapFeed({ stats }: { stats: EvolucionStats | null }) {
  if (!stats) return null;

  const chips: Array<{
    label: string;
    count: number;
    Icon: (p: { size?: number }) => React.JSX.Element;
  }> = [
    { label: "Lecturas", count: stats.capitulosCompletados, Icon: IconBook },
    {
      label: "Reflexiones",
      count: stats.reflexiones,
      Icon: IconReflections,
    },
    {
      label: "Días activos · 30d",
      count: stats.diasActivos30d,
      Icon: IconFlame,
    },
    {
      label: "Minutos de lectura",
      count: stats.minutosLectura,
      Icon: IconBook,
    },
    {
      label: "Racha actual",
      count: stats.rachaActual,
      Icon: IconWind,
    },
  ];

  // Only show chips with non-zero counts — when a user is brand new, the
  // chips collapse to whatever they have, avoiding a row of zeros.
  const visible = chips.filter((c) => c.count > 0);
  if (visible.length === 0) return null;

  return (
    <div className="map-feed">
      <div className="sec-label">Qué está alimentando tu mapa</div>
      <div className="feed-chips">
        {visible.map((chip) => (
          <span key={chip.label} className="feed-chip">
            <chip.Icon size={16} />
            {chip.label}
            <span className="n">{chip.count}</span>
          </span>
        ))}
        {/* The "Conversaciones con Eco" chip needs an aggregate counter we
            don't have yet. It used to appear in the design with hardcoded
            data — we just hide it until the counter exists. */}
        <span
          className="feed-chip"
          style={{ opacity: 0.55 }}
          title="Próximamente cuando exista el contador agregado"
        >
          <IconEco size={16} />
          Conversaciones con Eco
          <span className="n">—</span>
        </span>
      </div>
    </div>
  );
}
