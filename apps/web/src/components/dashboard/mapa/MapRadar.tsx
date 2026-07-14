import type {
  EmotionalMapDimension,
  EmotionalMapDimensionKey,
} from "@psico/types";

/**
 * MapRadar — the honest hexagonal radar (supersedes the 3-axis MapSelfReport
 * triangle).
 *
 * The radar returns as the map's summary visual, but under the V2 contract:
 * each of the 6 axes reaches its real value ONLY when it has a real signal
 * (`confidence >= CONFIDENCE_FLOOR`). Axes still gathering render with a
 * dashed spoke + hollow node instead of a fabricated midpoint — the very
 * "todo al 50%" problem that retired the legacy radar. The filled polygon
 * connects only the axes that are ready, so the shape grows as the user feeds
 * it: check-ins (Claridad/Compasión/Consciencia), mood dynamics (Calma) and
 * confirmed resonances (Conexión/Propósito).
 *
 * No global percentage, no LLM scores, no engagement proxies — every punta has
 * provenance. Pure render (server component); the ℹ️ transparency modal is
 * passed in via `info`.
 *
 * `compact` renders just the small hexagon (no labels, no rows) for the Inicio
 * mini-map card.
 */

const AXES: ReadonlyArray<{ key: EmotionalMapDimensionKey; label: string }> = [
  { key: "calma", label: "Calma" },
  { key: "claridad", label: "Claridad" },
  { key: "conexion", label: "Conexión" },
  { key: "proposito", label: "Propósito" },
  { key: "compasion", label: "Compasión" },
  { key: "consciencia", label: "Consciencia" },
];

/** Must match `CONFIDENCE_FLOOR` in the backend scoring. */
const CONFIDENCE_FLOOR = 0.15;

function isReady(
  dim: EmotionalMapDimension | undefined,
): dim is EmotionalMapDimension {
  return dim !== undefined && dim.confidence >= CONFIDENCE_FLOOR;
}

/**
 * Short, honest provenance label from the Model Registry id. Deliberately
 * avoids the copy-contract's forbidden "measured" term — it names the source
 * (your check-in, your mood, your resonances) instead of a confidence claim.
 */
function sourceLabel(dim: EmotionalMapDimension): string {
  const id = dim.evidence?.modelId ?? "";
  if (id === "CHK-S1") return "Tu check-in";
  if (id.startsWith("OU")) return "Tu ánimo";
  if (id === "ARC-C1" || id === "ARC-P1") return "Tus resonancias";
  if (id === "TXT-L1") return "Tu lenguaje";
  return "Tus registros";
}

type Row = {
  key: EmotionalMapDimensionKey;
  label: string;
  ready: boolean;
  value: number;
  pct: number;
  dim: EmotionalMapDimension | undefined;
};

function angleRad(i: number, n: number) {
  return ((-90 + (i * 360) / n) * Math.PI) / 180;
}
function point(
  cx: number,
  cy: number,
  i: number,
  r: number,
  n: number,
): [number, number] {
  const a = angleRad(i, n);
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

function RadarSvg({ rows, showLabels }: { rows: Row[]; showLabels: boolean }) {
  const n = rows.length;
  const W = showLabels ? 420 : 150;
  const H = showLabels ? 330 : 150;
  const cx = W / 2;
  const cy = showLabels ? 158 : H / 2;
  const R = showLabels ? 108 : 58;
  const rings = 4;

  const ringPoints = (r: number) =>
    rows
      .map((_, i) => {
        const [x, y] = point(cx, cy, i, r, n);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const readyIdx = rows
    .map((row, i) => ({ row, i }))
    .filter((x) => x.row.ready);

  const dataPoly =
    readyIdx.length >= 3
      ? readyIdx
          .map(({ row, i }) => {
            const [x, y] = point(cx, cy, i, R * row.value, n);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{
        maxWidth: showLabels ? 420 : 150,
        display: "block",
        margin: "0 auto",
      }}
      role="img"
      aria-label="Radar de tu mapa emocional"
    >
      {/* rings */}
      {Array.from({ length: rings }, (_, k) => (
        <polygon
          key={`ring-${k}`}
          points={ringPoints((R * (k + 1)) / rings)}
          fill="none"
          stroke="var(--color-warm-300)"
          strokeWidth={1}
          opacity={0.55}
        />
      ))}

      {/* spokes — solid hairline for every axis */}
      {rows.map((_, i) => {
        const [ex, ey] = point(cx, cy, i, R, n);
        return (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={ex.toFixed(1)}
            y2={ey.toFixed(1)}
            stroke="var(--color-warm-300)"
            strokeWidth={1}
            opacity={0.55}
          />
        );
      })}

      {/* gathering axes — dashed muted overlay */}
      {rows.map((row, i) => {
        if (row.ready) return null;
        const [ex, ey] = point(cx, cy, i, R, n);
        return (
          <line
            key={`gap-${i}`}
            x1={cx}
            y1={cy}
            x2={ex.toFixed(1)}
            y2={ey.toFixed(1)}
            stroke="var(--color-warm-400)"
            strokeWidth={1.4}
            strokeDasharray="4 4"
            opacity={0.85}
          />
        );
      })}

      {/* filled polygon through the ready axes */}
      {dataPoly ? (
        <polygon
          points={dataPoly}
          fill="var(--color-lavender-500)"
          fillOpacity={0.22}
          stroke="var(--color-lavender-500)"
          strokeWidth={1.8}
        />
      ) : null}

      {/* nodes */}
      {rows.map((row, i) => {
        if (row.ready) {
          const [x, y] = point(cx, cy, i, R * row.value, n);
          return (
            <circle
              key={`node-${i}`}
              cx={x.toFixed(1)}
              cy={y.toFixed(1)}
              r={4}
              fill="var(--color-lavender-500)"
              stroke="var(--bg-surface)"
              strokeWidth={1.4}
            />
          );
        }
        // gathering: hollow marker near the centre
        const [x, y] = point(cx, cy, i, R * 0.16, n);
        return (
          <circle
            key={`node-${i}`}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r={4.5}
            fill="var(--bg-surface)"
            stroke="var(--color-warm-400)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        );
      })}

      {/* labels */}
      {showLabels
        ? rows.map((row, i) => {
            const [lx, ly] = point(cx, cy, i, R + 20, n);
            const a = angleRad(i, n);
            const anchor =
              Math.abs(Math.cos(a)) < 0.3
                ? "middle"
                : Math.cos(a) > 0
                  ? "start"
                  : "end";
            return (
              <text
                key={`label-${i}`}
                x={lx.toFixed(1)}
                y={ly.toFixed(1)}
                fill={
                  row.ready ? "var(--color-warm-700)" : "var(--color-warm-500)"
                }
                fontSize={12}
                fontWeight={600}
                textAnchor={anchor}
                dominantBaseline="middle"
              >
                {row.label}
              </text>
            );
          })
        : null}

      {/* core */}
      <circle
        cx={cx}
        cy={cy}
        r={4.5}
        fill="none"
        stroke="var(--color-lavender-400)"
        strokeWidth={1.4}
        opacity={0.7}
      />
      <circle cx={cx} cy={cy} r={3} fill="var(--color-lavender-600)" />
    </svg>
  );
}

export function MapRadar({
  dimensions,
  compact = false,
  info,
}: {
  dimensions: EmotionalMapDimension[];
  compact?: boolean;
  /** Optional slot for the transparency ⓘ button (full layout only). */
  info?: React.ReactNode;
}) {
  const rows: Row[] = AXES.map(({ key, label }) => {
    const dim = dimensions.find((d) => d.key === key);
    const ready = isReady(dim);
    return {
      key,
      label,
      ready,
      value: ready ? Math.max(0, Math.min(1, dim.value)) : 0,
      pct: ready ? Math.round(dim.value * 100) : 0,
      dim,
    };
  });
  const readyCount = rows.filter((r) => r.ready).length;

  if (compact) {
    return <RadarSvg rows={rows} showLabels={false} />;
  }

  return (
    <section
      className="card"
      style={{ marginTop: 24, padding: "22px 26px 20px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <span className="card-tag">Tu mapa de hoy</span>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 12.5,
              color: "var(--color-warm-500)",
              maxWidth: 420,
            }}
          >
            Cada punta se enciende solo con lo que tú registras — tu ánimo, tus
            respuestas y tus resonancias. Sin porcentaje global, sin nada
            inventado.
          </p>
        </div>
        {info ?? null}
      </div>

      {readyCount === 0 ? (
        <p
          style={{
            margin: "16px 0 0",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--color-warm-500)",
          }}
        >
          Aún no hay señal para dibujar tu mapa. Marca tu ánimo, responde el
          check-in de 5 segundos o confirma una resonancia y las puntas se irán
          encendiendo.
        </p>
      ) : (
        <>
          <div style={{ margin: "14px 0 4px" }}>
            <RadarSvg rows={rows} showLabels />
          </div>

          {/* legend */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 18px",
              margin: "6px 0 14px",
              fontSize: 11.5,
              color: "var(--color-warm-500)",
            }}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: "var(--color-lavender-500)",
                  opacity: 0.55,
                }}
              />
              Con lo que ya registraste
            </span>
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  border: "1.5px dashed var(--color-warm-400)",
                }}
              />
              Reuniendo datos — aún sin señal (no se inventa un valor)
            </span>
          </div>

          {/* per-axis rows */}
          <div style={{ display: "grid", gap: 12 }}>
            {rows.map(({ key, label, ready, pct, dim }) => (
              <div key={key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <b style={{ fontSize: 13.5 }}>{label}</b>
                  {ready && dim ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "var(--color-lavender-50)",
                          color: "var(--color-lavender-700)",
                        }}
                      >
                        {sourceLabel(dim)}
                      </span>
                      <b style={{ fontSize: 13 }}>{pct}%</b>
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "var(--color-warm-100)",
                        color: "var(--color-warm-500)",
                      }}
                    >
                      Reuniendo datos
                    </span>
                  )}
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={label}
                  style={{
                    marginTop: 5,
                    height: 6,
                    borderRadius: 999,
                    background: "var(--color-warm-100)",
                    overflow: "hidden",
                  }}
                >
                  <i
                    style={{
                      display: "block",
                      height: "100%",
                      borderRadius: 999,
                      background: "var(--color-lavender-500)",
                      width: `${pct}%`,
                      opacity: ready ? 1 : 0.35,
                    }}
                  />
                </div>
                {ready && dim?.evidence ? (
                  <p
                    style={{
                      margin: "5px 0 0",
                      fontSize: 11.5,
                      lineHeight: 1.4,
                      color: "var(--color-warm-500)",
                    }}
                  >
                    {`Basado en ${dim.evidence.n} ${
                      dim.evidence.n === 1 ? "registro" : "registros"
                    } tuyos`}
                  </p>
                ) : !ready ? (
                  <p
                    style={{
                      margin: "5px 0 0",
                      fontSize: 11.5,
                      lineHeight: 1.4,
                      color: "var(--color-warm-500)",
                    }}
                  >
                    {dim?.sources ??
                      "Se llenará conforme registres tu experiencia"}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
