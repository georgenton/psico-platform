/**
 * AxisBreakdown — Sprint E1.
 *
 * Renderiza los 6 ejes del Mapa Emocional como barras horizontales con
 * descripción de cada uno. Es complemento al Radar, que muestra la forma
 * global; estas barras explican qué significa cada dimensión.
 */

type RadarValues = readonly [number, number, number, number, number, number];

const AXES: ReadonlyArray<{
  label: string;
  description: string;
}> = [
  {
    label: "Calma",
    description:
      "Estabilidad emocional sin dominancia de ansiedad. Sube cuando aparecen moods variados sin un solo extremo.",
  },
  {
    label: "Claridad",
    description:
      "Capacidad de nombrar lo que sientes. Sube con tags categoriales (trabajo, familia, sueño) y entries consistentes.",
  },
  {
    label: "Conexión",
    description:
      "Profundidad de tu vínculo con el contenido. Lecturas variadas y tiempo dedicado mueven este eje.",
  },
  {
    label: "Propósito",
    description:
      "Progreso medible en libros. Cada capítulo terminado lo hace crecer.",
  },
  {
    label: "Compasión",
    description:
      "Tono validante hacia ti mismo. Sube cuando sigues escribiendo aún en moods difíciles — no te abandonas.",
  },
  {
    label: "Consciencia",
    description:
      "Regularidad de la observación. Sube con días activos altos y distribución pareja en la semana.",
  },
];

export function AxisBreakdown({ values }: { values: RadarValues }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 16,
      }}
    >
      {AXES.map((axis, i) => {
        const v = values[i] ?? 0.5;
        const pct = Math.round(v * 100);
        return (
          <div
            key={axis.label}
            className="card"
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  font: "600 14px/1 var(--font-sans)",
                  color: "var(--color-warm-900)",
                }}
              >
                {axis.label}
              </span>
              <span
                style={{
                  font: "700 22px/1 var(--font-sans)",
                  letterSpacing: "-0.02em",
                  color: "var(--color-lavender-700)",
                }}
              >
                {pct}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={axis.label}
              style={{
                width: "100%",
                height: 8,
                background: "var(--color-warm-100)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "var(--color-lavender-500)",
                  transition: "width .3s var(--easing-default)",
                }}
              />
            </div>
            <p
              style={{
                margin: 0,
                color: "var(--color-warm-500)",
                fontSize: 12.5,
                lineHeight: 1.5,
              }}
            >
              {axis.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
