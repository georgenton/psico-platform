import type { EvolucionStats } from "@psico/types";
import {
  IconBook,
  IconFlame,
  IconPencil,
  IconTrendUp,
  IconWind,
  IconMap,
} from "@/components/dashboard/shell/icons";

/**
 * StatsGrid — Sprint E1.
 *
 * 6 mini-cards con las cifras crudas de la evolución del usuario. Usa el
 * mismo shape visual que las metric cards del Inicio para consistencia.
 */
export function StatsGrid({ stats }: { stats: EvolucionStats }) {
  return (
    <div className="metrics">
      <div className="metric">
        <span className="mg">
          <IconPencil size={19} />
        </span>
        <b>{stats.reflexiones}</b>
        <span className="lbl">Reflexiones totales</span>
        <span className="trend">
          <IconTrendUp size={13} /> tu historia
        </span>
      </div>
      <div className="metric">
        <span className="mg">
          <IconBook size={19} />
        </span>
        <b>{stats.capitulosCompletados}</b>
        <span className="lbl">Capítulos completados</span>
        <span className="trend">
          <IconTrendUp size={13} /> +camino
        </span>
      </div>
      <div className="metric">
        <span className="mg">
          <IconWind size={19} />
        </span>
        <b>{stats.minutosLectura}</b>
        <span className="lbl">Minutos de lectura</span>
        <span className="trend">
          <IconTrendUp size={13} /> tiempo dedicado
        </span>
      </div>
      <div className="metric">
        <span className="mg">
          <IconFlame size={19} />
        </span>
        <b>{stats.rachaActual}</b>
        <span className="lbl">Días seguidos</span>
        <span className="trend">
          <IconTrendUp size={13} /> racha actual
        </span>
      </div>
      <div className="metric">
        <span className="mg">
          <IconFlame size={19} />
        </span>
        <b>{stats.rachaMasLarga}</b>
        <span className="lbl">Tu mejor racha</span>
        <span className="trend">
          <IconTrendUp size={13} /> hasta hoy
        </span>
      </div>
      <div className="metric">
        <span className="mg">
          <IconMap size={19} />
        </span>
        <b>{stats.diasActivos30d}</b>
        <span className="lbl">Días activos · 30d</span>
        <span className="trend">
          <IconTrendUp size={13} /> presencia
        </span>
      </div>
    </div>
  );
}
