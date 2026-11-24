import type { EvolucionStats } from "@psico/types";

/**
 * ReflSidePanel — Sprint F1.
 *
 * Right-hand sidepanel for `/dashboard/reflexiones`. Mirrors the `.refl-side`
 * column from `docs/design/redesign-v2/dashboard/index.html` (s-reflexiones):
 * a card showing "Tu mes en reflexiones" + one about the tags, which says
 * where they stay. It used to promise a ranking of recurring themes nobody
 * computes, and that Eco used the tags «para refinar tu mapa» — the map does
 * not read tags under V2.
 *
 * Uses real `EvolucionStats` data (reflexiones count, racha actual, días
 * activos en 30d). When stats are null (fetch failed) we render a neutral
 * empty state instead of guessing.
 */

interface Props {
  stats: EvolucionStats | null;
}

export function ReflSidePanel({ stats }: Props) {
  if (!stats) {
    return (
      <div className="card rs-card">
        <span className="card-tag">Tu mes en reflexiones</span>
        <p
          style={{
            margin: "12px 0 0",
            color: "var(--color-warm-500)",
            fontSize: 13,
          }}
        >
          No pudimos calcular tus estadísticas. Reintenta en un momento.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card rs-card">
        <span className="card-tag">Tu mes en reflexiones</span>
        <div className="rs-count">
          <b>{stats.diasActivos30d}</b>
          <span>días activos · {stats.reflexiones} reflexiones totales</span>
        </div>
        {stats.rachaMasLarga > 0 ? (
          <p
            style={{
              margin: "10px 0 0",
              color: "var(--color-warm-500)",
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            Tu mejor racha: <strong>{stats.rachaMasLarga} días</strong>{" "}
            seguidos. Racha actual: <strong>{stats.rachaActual} días</strong>.
          </p>
        ) : null}
      </div>

      <div className="card rs-card">
        <span className="card-tag" style={{ display: "inline-flex" }}>
          Tus etiquetas
        </span>
        <p
          style={{
            margin: "10px 0 0",
            color: "var(--color-warm-500)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Las etiquetas que pongas a tus reflexiones (trabajo, familia, sueño…)
          quedan en cada una. No cuentan en tu Mapa Emocional.
        </p>
      </div>
    </>
  );
}
