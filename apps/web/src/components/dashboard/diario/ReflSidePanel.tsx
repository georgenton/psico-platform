import type { EvolucionStats } from "@psico/types";

/**
 * ReflSidePanel — Sprint F1.
 *
 * Right-hand sidepanel for `/dashboard/reflexiones`. Mirrors the `.refl-side`
 * column from `docs/design/redesign-v2/dashboard/index.html` (s-reflexiones):
 * a card showing "Tu mes en reflexiones" + an empty-state card hint for
 * future recurring-themes when the backend exposes them.
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
          Temas recurrentes
        </span>
        <p
          style={{
            margin: "10px 0 0",
            color: "var(--color-warm-500)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Cuando tagees tus reflexiones (trabajo, familia, sueño…), aquí van a
          aparecer los temas que se repiten más, ordenados por frecuencia. Eco
          usa esa señal para refinar tu mapa.
        </p>
      </div>
    </>
  );
}
