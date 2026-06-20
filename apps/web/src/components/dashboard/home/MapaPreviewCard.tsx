import Link from "next/link";

/**
 * MapaPreviewCard — Sprint B3.
 *
 * Decorative mini-radar that previews the upcoming Mapa Emocional flagship
 * (Sprint D). v1 ships with frozen sample values mirroring the landing radar
 * so the user gets a feel for the upcoming experience without us shipping
 * the real `/api/emotional-map` yet.
 *
 * Renders pure SVG — no client JS, no fonts loaded, no animations beyond the
 * CSS transitions already in `globals.css`. CTA links to the placeholder
 * `/dashboard/mapa` page (also shipped in B2).
 */

const AXES = [
  "Calma",
  "Claridad",
  "Conexión",
  "Propósito",
  "Compasión",
  "Consciencia",
] as const;
const VALUES = [0.58, 0.72, 0.8, 0.62, 0.5, 0.74] as const;

const SIZE = 220;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE * 0.36;
const N = AXES.length;

function ang(i: number) {
  return ((-90 + (i * 360) / N) * Math.PI) / 180;
}
function pt(i: number, r: number) {
  return [CX + Math.cos(ang(i)) * r, CY + Math.sin(ang(i)) * r] as const;
}
function ring(r: number) {
  return Array.from({ length: N }, (_, i) => {
    const [x, y] = pt(i, r);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
function dataPoly() {
  return Array.from({ length: N }, (_, i) => {
    const [x, y] = pt(i, R * VALUES[i]!);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function MapaPreviewCard() {
  return (
    <article
      className="rounded-3xl border p-5 sm:p-6"
      style={{
        background: "white",
        borderColor: "var(--color-warm-200)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.16em]"
            style={{ color: "var(--color-lavender-700)" }}
          >
            Mapa Emocional
          </p>
          <h3
            className="mt-1 text-base font-semibold"
            style={{ color: "var(--color-warm-800)" }}
          >
            Tu firma de hoy
          </h3>
        </div>
        <Link
          href="/dashboard/mapa"
          className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          style={{
            background: "var(--color-lavender-100)",
            color: "var(--color-lavender-700)",
          }}
        >
          Ver completo →
        </Link>
      </div>

      <div className="mt-3 flex justify-center">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-label="Vista previa del Mapa Emocional"
        >
          {/* Rings */}
          {[1, 2, 3, 4].map((k) => (
            <polygon
              key={k}
              points={ring((R * k) / 4)}
              fill="none"
              stroke="var(--color-warm-200)"
              strokeWidth="1"
            />
          ))}
          {/* Axes */}
          {Array.from({ length: N }, (_, i) => {
            const [x, y] = pt(i, R);
            return (
              <line
                key={i}
                x1={CX}
                y1={CY}
                x2={x.toFixed(1)}
                y2={y.toFixed(1)}
                stroke="var(--color-warm-200)"
                strokeWidth="1"
              />
            );
          })}
          {/* Data polygon */}
          <polygon
            points={dataPoly()}
            fill="rgba(139,113,245,0.18)"
            stroke="var(--color-lavender-500)"
            strokeWidth="1.5"
          />
          {/* Nodes */}
          {Array.from({ length: N }, (_, i) => {
            const [x, y] = pt(i, R * VALUES[i]!);
            return (
              <circle
                key={i}
                cx={x.toFixed(1)}
                cy={y.toFixed(1)}
                r="3"
                fill="var(--color-lavender-600)"
              />
            );
          })}
          {/* Core */}
          <circle cx={CX} cy={CY} r="3.5" fill="var(--color-lavender-700)" />
        </svg>
      </div>

      <p
        className="mt-2 text-center text-xs"
        style={{ color: "var(--color-warm-500)" }}
      >
        Vista previa con datos de muestra. La pantalla completa llega en Sprint
        D.
      </p>
    </article>
  );
}
