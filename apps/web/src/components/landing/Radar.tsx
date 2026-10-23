"use client";

import { useEffect, useState } from "react";

import { EJES, type Eje } from "./datos";
import { useLanding } from "./estado";

/**
 * El hexágono del Mapa Emocional, dibujado como en la referencia.
 *
 * Respeta el contrato del `MapRadar` real del producto, y eso es deliberado:
 * una dimensión sin señal NO recibe un valor medio inventado —se dibuja con
 * trazo discontinuo y nodo hueco—, el área sólo aparece con tres o más ejes con
 * señal, y no hay ningún porcentaje global. Si la landing dibujara una figura
 * completa siempre, prometería una medición que el producto no hace.
 *
 * Los colores salen de variables CSS (`--fh-r-*`) del envoltorio, que cambian
 * con el tema; por eso se vuelve a calcular cuando cambia la apariencia.
 */

interface Props {
  readonly valores: Partial<Record<Eje, number>>;
  /** El grande lleva etiquetas de eje; el del hero, no. */
  readonly grande?: boolean;
  /** Sobre la sección oscura, la paleta tiene su propia variante. */
  readonly oscuro?: boolean;
}

interface Paleta {
  anillo: string;
  hueco: string;
  relleno: string;
  etiqueta: string;
  etiquetaApagada: string;
  superficie: string;
}

const PALETA_RESPALDO: Paleta = {
  anillo: "rgba(0,0,0,.12)",
  hueco: "rgba(0,0,0,.22)",
  relleno: "#8b71f5",
  etiqueta: "#2a2420",
  etiquetaApagada: "#928d84",
  superficie: "#ffffff",
};

function leerPaleta(oscuro: boolean): Paleta {
  const raiz = document.getElementById("fh");
  if (!raiz) return PALETA_RESPALDO;
  const cs = getComputedStyle(raiz);
  const v = (n: string) =>
    cs.getPropertyValue(`--fh-r-${n}${oscuro ? "-d" : ""}`).trim();
  const anillo = v("ring");
  // Si las variables no están, se usa el respaldo: mejor un radar con colores
  // aproximados que un SVG sin trazos.
  if (!anillo) return PALETA_RESPALDO;
  return {
    anillo,
    hueco: v("gap"),
    relleno: v("fill"),
    etiqueta: v("lbl"),
    etiquetaApagada: v("lbloff"),
    superficie: v("surf"),
  };
}

export function Radar({ valores, grande = false, oscuro = false }: Props) {
  const { apariencia } = useLanding();
  const [paleta, setPaleta] = useState<Paleta | null>(null);

  // En el servidor no hay estilos computados, así que la primera pintura usa el
  // respaldo y en cuanto monta se toman los colores reales del tema.
  useEffect(() => {
    setPaleta(leerPaleta(oscuro));
  }, [apariencia, oscuro]);

  const p = paleta ?? PALETA_RESPALDO;

  const W = grande ? 440 : 180;
  const H = grande ? 360 : 170;
  const cx = W / 2;
  const cy = grande ? 178 : 85;
  const R = grande ? 118 : 62;

  const punto = (i: number, r: number): [number, number] => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };

  const conSenal = (e: Eje) => e in valores;
  const listos = EJES.map((e, i) => ({ e, i })).filter((x) => conSenal(x.e));
  const nombres = EJES.filter(conSenal);
  const faltan = EJES.filter((e) => !conSenal(e));

  const etiquetaAccesible =
    `Mapa Emocional de ejemplo. Con señal: ${nombres.join(", ") || "ninguna"}. ` +
    `Reuniendo datos: ${faltan.join(", ")}.`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={etiquetaAccesible}
    >
      {/* Los cuatro anillos de referencia. */}
      {[1, 2, 3, 4].map((k) => (
        <polygon
          key={`anillo-${k}`}
          points={EJES.map((_, i) => punto(i, (R * k) / 4).join(",")).join(" ")}
          fill="none"
          stroke={p.anillo}
          strokeWidth={1}
        />
      ))}

      {/* Un eje sin señal se dibuja discontinuo: es la señal visual de que
          todavía reúne datos, no de que valga cero. */}
      {EJES.map((e, i) => {
        const fin = punto(i, R);
        const hay = conSenal(e);
        return (
          <line
            key={`eje-${e}`}
            x1={cx}
            y1={cy}
            x2={fin[0]}
            y2={fin[1]}
            stroke={hay ? p.anillo : p.hueco}
            strokeWidth={hay ? 1 : 1.4}
            strokeDasharray={hay ? undefined : "4 4"}
          />
        );
      })}

      {/* El área sólo con tres o más: con menos no describe una forma. */}
      {listos.length >= 3 && (
        <polygon
          className="poly"
          points={listos
            .map((x) => punto(x.i, R * (valores[x.e] ?? 0)).join(","))
            .join(" ")}
          fill={p.relleno}
          fillOpacity={0.24}
          stroke={p.relleno}
          strokeWidth={1.8}
        />
      )}

      {EJES.map((e, i) => {
        if (conSenal(e)) {
          const q = punto(i, R * (valores[e] ?? 0));
          return (
            <circle
              key={`nodo-${e}`}
              cx={q[0]}
              cy={q[1]}
              r={grande ? 5 : 4}
              fill={p.relleno}
              stroke={p.superficie}
              strokeWidth={1.5}
            />
          );
        }
        const q = punto(i, R * 0.16);
        return (
          <circle
            key={`nodo-${e}`}
            cx={q[0]}
            cy={q[1]}
            r={4.5}
            fill={p.superficie}
            stroke={p.hueco}
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        );
      })}

      {grande &&
        EJES.map((e, i) => {
          const q = punto(i, R + 26);
          const c = Math.cos(((-90 + i * 60) * Math.PI) / 180);
          const anclaje =
            Math.abs(c) < 0.3 ? "middle" : c > 0 ? "start" : "end";
          const hay = conSenal(e);
          return (
            <g key={`etq-${e}`}>
              <text
                x={q[0]}
                y={q[1]}
                fill={hay ? p.etiqueta : p.etiquetaApagada}
                fontFamily="Geist Mono,monospace"
                fontSize={12.5}
                fontWeight={600}
                letterSpacing={1.5}
                textAnchor={anclaje}
                dominantBaseline="middle"
              >
                {e.toUpperCase()}
              </text>
              {!hay && (
                <text
                  x={q[0]}
                  y={q[1] + 16}
                  fill={p.etiquetaApagada}
                  fontFamily="Geist,sans-serif"
                  fontSize={11}
                  textAnchor={anclaje}
                  dominantBaseline="middle"
                >
                  Reuniendo datos
                </text>
              )}
            </g>
          );
        })}

      <circle cx={cx} cy={cy} r={3} fill={p.relleno} />
    </svg>
  );
}
