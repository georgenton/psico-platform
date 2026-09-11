"use client";

import type { CircleActivityView } from "@psico/types";

import { estilos as S } from "./estilos";

/**
 * How this continues, in three words.
 *
 * `KEEP`, `ADJUST`, `CLOSE` — the whole vocabulary. No free text, no rating, no
 * "how did it go?" score. A number would turn a conversation between two people
 * into a measurement of it, and closing is offered as an equal option rather
 * than as giving up: an activity that ends is not an activity that failed.
 */

export interface SeguimientoProps {
  readonly view: CircleActivityView;
  readonly busy: boolean;
  readonly onDecide: (decision: "KEEP" | "ADJUST" | "CLOSE") => unknown;
}

export function Seguimiento({ view, busy, onDecide }: SeguimientoProps) {
  const already = view.you.followUpDecision;

  if (already) {
    return (
      <section style={S.section} aria-labelledby="seg-h">
        <h2 id="seg-h" style={S.h2}>
          Ya respondiste
        </h2>
        <p style={S.p}>{YA[already]}</p>
      </section>
    );
  }

  return (
    <section style={S.section} aria-labelledby="seg-h">
      <h2 id="seg-h" style={S.h2}>
        ¿Cómo siguen?
      </h2>
      <p style={S.p}>
        No hay respuesta correcta. Elijan lo que de verdad les sirve ahora.
      </p>
      <div style={{ display: "grid", gap: ".6rem" }}>
        {(["KEEP", "ADJUST", "CLOSE"] as const).map((d) => (
          <button
            key={d}
            type="button"
            style={d === "KEEP" ? S.primary : S.secondary}
            disabled={busy}
            onClick={() => onDecide(d)}
          >
            {OPCION[d]}
          </button>
        ))}
      </div>
    </section>
  );
}

const OPCION = {
  KEEP: "Seguimos con esto",
  ADJUST: "Lo ajustamos",
  CLOSE: "Lo cerramos aquí",
} as const;

const YA = {
  KEEP: "Dijiste que siguen con esto.",
  ADJUST: "Dijiste que lo ajustan.",
  CLOSE: "Dijiste que lo cierran aquí.",
} as const;
