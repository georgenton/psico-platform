import type { EvolucionStats } from "@psico/types";
import {
  IconBook,
  IconEco,
  IconFlame,
  IconPencil,
  IconReflections,
} from "@/components/dashboard/shell/icons";

/**
 * EvoQuarter — Sprint F2 · extendido en Fase C.
 *
 * The `.card.evo-quarter` from the design's `s-evolucion` screen — a
 * right-column highlights card. Fase C (V2 contract): Evolución IS the
 * learning dashboard, so the engagement counters that used to sit on the
 * map page (Eco chats, reading marks) land here:
 *
 *  - {reflexiones} reflexiones — el flujo principal del usuario
 *  - {capitulosCompletados} capítulos — el otro flujo principal
 *  - {conversacionesEco} mensajes con Eco — conversación acumulada
 *  - {marcasLectura} subrayados y notas — lectura activa
 *  - {rachaActual} / {rachaMasLarga} días seguidos — la métrica de hábito
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
        stats.conversacionesEco === 1
          ? "1 mensaje con Eco"
          : `${stats.conversacionesEco} mensajes con Eco`,
      label: "conversaciones que iniciaste tú",
      Icon: IconEco,
    },
    {
      value:
        stats.marcasLectura === 1
          ? "1 subrayado o nota"
          : `${stats.marcasLectura} subrayados y notas`,
      label: "marcas que dejaste al leer",
      Icon: IconPencil,
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
      Icon: IconFlame,
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
