import type { EvolucionStats } from "@psico/types";
import {
  IconBook,
  IconCheck,
  IconEco,
  IconPencil,
  IconTrendUp,
} from "@/components/dashboard/shell/icons";

/**
 * LearningActivityCard — GR-2.
 *
 * Six plain counts of what the person did with the chapter: the formats they
 * finished, the guided readings they closed, the practices they completed and
 * the recall questions they attempted.
 *
 * Deliberately factual. No chart, no goal, no streak, no score, and no
 * interpretation — «2 audiolibros» is a fact; «vas muy bien» would be a claim
 * we cannot support. Recall shows ATTEMPTS, never how many were right: this
 * card records activity, and Mi Evolución is not an exam.
 *
 * Nothing here reaches the Emotional Map. Finishing a video says nothing about
 * how someone feels (`EXPERIENCE_CAUSAL_INFERENCE=false`); the map only ever
 * receives what a person explicitly chooses to express.
 */
export function LearningActivityCard({ stats }: { stats: EvolucionStats }) {
  const rows = [
    {
      value: plural(stats.audiolibrosCompletados, "audiolibro", "audiolibros"),
      label: "escuchados hasta el final",
      Icon: IconEco,
    },
    {
      value: plural(stats.podcastsCompletados, "podcast", "podcasts"),
      label: "escuchados hasta el final",
      Icon: IconEco,
    },
    {
      value: plural(
        stats.videoexplicacionesCompletadas,
        "videoexplicación",
        "videoexplicaciones",
      ),
      label: "vistas hasta el final",
      Icon: IconTrendUp,
    },
    {
      value: plural(
        stats.lecturasGuiadasCompletadas,
        "lectura guiada",
        "lecturas guiadas",
      ),
      label: "completadas",
      Icon: IconBook,
    },
    {
      value: plural(stats.practicasCompletadas, "práctica", "prácticas"),
      label: "completadas dentro del capítulo",
      Icon: IconPencil,
    },
    {
      value: plural(
        stats.recallsRealizados,
        "intento de recuerdo",
        "intentos de recuerdo",
      ),
      label: "registrados al responder una pregunta",
      Icon: IconCheck,
    },
  ];

  return (
    <div className="card evo-quarter">
      <span className="card-tag sage">Actividad de aprendizaje</span>
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

/** «0 audiolibros» is honest; hiding a zero would pretend nothing happened. */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}
