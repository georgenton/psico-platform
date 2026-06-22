import type { EvolucionStats } from "@psico/types";
import {
  IconBook,
  IconEco,
  IconReflections,
} from "@/components/dashboard/shell/icons";

/**
 * EvoQuarter — Sprint F2.
 *
 * The `.card.evo-quarter` from the design's `s-evolucion` screen — a
 * right-column highlights card with 3 rows. We map them to the most
 * concrete numbers we already track in `EvolucionStats`:
 *
 *  - {reflexiones} reflexiones — el flujo principal del usuario
 *  - {capitulosCompletados} capítulos — el otro flujo principal
 *  - {rachaActual} / {rachaMasLarga} días seguidos — la métrica de hábito
 *
 * Diseño original muestra "3 patrones nuevos", "17 insights" y "+18%
 * autocompasión". Esas requieren backend que todavía no tenemos. Mejor
 * surface cifras honestas que ya son ciertas.
 */
export function EvoQuarter({ stats }: { stats: EvolucionStats }) {
  const rows = [
    {
      value:
        stats.reflexiones === 1
          ? "1 reflexión"
          : `${stats.reflexiones} reflexiones`,
      label: "escritas este mes",
      Icon: IconReflections,
    },
    {
      value:
        stats.capitulosCompletados === 1
          ? "1 capítulo"
          : `${stats.capitulosCompletados} capítulos`,
      label: "terminados de tus libros",
      Icon: IconBook,
    },
    {
      value:
        stats.rachaActual === 0
          ? "Aún sin racha activa"
          : `${stats.rachaActual} días seguidos`,
      label:
        stats.rachaMasLarga > stats.rachaActual
          ? `tu mejor racha fue ${stats.rachaMasLarga} días`
          : "tu racha más larga hasta hoy",
      Icon: IconEco,
    },
  ];

  return (
    <div className="card evo-quarter">
      <span className="card-tag sage">Este trimestre</span>
      <div className="eq-list">
        {rows.map((row, i) => (
          <div key={i} className="eq-row">
            <span className="eqg">
              <row.Icon size={20} />
            </span>
            <div className="eqm">
              <div className="eqv">{row.value}</div>
              <div className="eql">{row.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
