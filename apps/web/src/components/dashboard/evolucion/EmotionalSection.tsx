import type {
  EmotionalMapResult,
  EvolucionEmotionalSeriesPoint,
} from "@psico/types";

import { EvoChart } from "./EvoChart";

interface Props {
  /** PR-0.2 — false when EMOTIONAL_MAP_PUBLIC is off (kill switch). */
  emotionalMapAvailable: boolean;
  /** Cached live map from /home; null when off or not loaded. */
  map: EmotionalMapResult | null;
  /** Monthly snapshots; null when the map is withheld. */
  series: EvolucionEmotionalSeriesPoint[] | null;
}

/**
 * The emotional-history column of `/dashboard/evolucion`. Extracted from the
 * page so the PR-0.2 branching is unit-testable (the page itself is a Server
 * Component). Output is byte-identical to the previous inline JSX except the
 * fallback card-tag, which no longer says "Comprensión emocional".
 *
 *  - `emotionalMapAvailable === false` → the kill switch is off: a maintenance
 *    note (NOT "no history yet"). **EvoChart is not rendered.**
 *  - `map` present → the coverage chart.
 *  - `map` null but available → transient "snapshot not loaded".
 */
export function EvolucionEmotionalSection({
  emotionalMapAvailable,
  map,
  series,
}: Props) {
  if (!emotionalMapAvailable) {
    return (
      <div className="card evo-chart">
        <span className="card-tag">Cobertura de tu mapa</span>
        <p
          style={{
            margin: "12px 0 0",
            color: "var(--color-warm-500)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Tu historia emocional está en pausa por mantenimiento. Estamos
          afinando cómo la calculamos y vuelve en un rato. Tus registros siguen
          guardados.
        </p>
      </div>
    );
  }

  if (map) {
    return <EvoChart map={map} series={series ?? []} />;
  }

  return (
    <div className="card evo-chart">
      <span className="card-tag">Cobertura de tu mapa</span>
      <p
        style={{
          margin: "12px 0 0",
          color: "var(--color-warm-500)",
          fontSize: 13,
        }}
      >
        No pudimos cargar tu snapshot actual. Reintenta en un momento.
      </p>
    </div>
  );
}
