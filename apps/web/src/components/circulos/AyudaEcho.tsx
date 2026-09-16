"use client";

import { useId, useState } from "react";
import type { CircleFieldHelp } from "@psico/types";

import { estilos as S } from "./estilos";

/**
 * Echo, for one question. Two pieces of text, and no model.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 *
 * There is no request here. Not a lazy one, not a prefetched one, not a
 * cached one: the two paragraphs arrive with the template definition, which
 * the server already resolved to render the question itself. Opening this card
 * costs a re-render.
 *
 * That is not an optimisation. During the private preparation the promise is
 * that nothing has crossed the network yet — and a help panel that fetched its
 * own contents would be a request whose TIMING says somebody is stuck on a
 * question, even if its body said nothing. The cheapest way to send no signal
 * is to have nothing to send.
 *
 * So: no provider, no tokens, no embeddings, no retrieval, and no access to
 * the draft. Echo cannot read what the person is writing because Echo, here,
 * is a string that was written months earlier by somebody else.
 *
 * ── Two, and re-reading is not a third ─────────────────────────────────────
 *
 * An explanation and an example. Closing and reopening either one is
 * re-reading; there is no counter that runs out and no "you have used your
 * help". A limit would only make sense if each opening cost something, and
 * nothing here does.
 *
 * ── What it says about itself ──────────────────────────────────────────────
 *
 * The card names itself as prepared orientation. No "estoy pensando", no
 * streamed characters, no avatar implying somebody is present, no free text
 * box inviting a question nothing can answer. Somebody who believes they are
 * talking to a person has been misled by the interface, not by the copy.
 */

export interface AyudaEchoProps {
  readonly help: CircleFieldHelp;
  /** Told once per opening, so the room can count without this card knowing how. */
  readonly onOpen?: (piece: "explanation" | "example") => void;
}

export function AyudaEcho({ help, onOpen }: AyudaEchoProps) {
  const [abierto, setAbierto] = useState(false);
  const [pieza, setPieza] = useState<"explanation" | "example">("explanation");
  const panelId = useId();

  const abrir = (next: "explanation" | "example") => {
    setPieza(next);
    setAbierto(true);
    onOpen?.(next);
  };

  if (!abierto) {
    return (
      <div style={S.acciones}>
        <button
          type="button"
          style={S.ayuda}
          aria-expanded={false}
          aria-controls={panelId}
          onClick={() => abrir("explanation")}
        >
          Una ayuda de Echo
        </button>
      </div>
    );
  }

  return (
    <div
      id={panelId}
      style={S.ayudaPanel}
      role="group"
      aria-label="Una ayuda de Echo"
    >
      <p style={S.ayudaEtiqueta}>
        Una ayuda de Echo · orientación preparada para esta actividad
      </p>
      <p style={S.p}>
        {pieza === "explanation" ? help.explanation : help.example}
      </p>
      <div style={S.acciones}>
        {pieza === "explanation" ? (
          <button
            type="button"
            style={S.secondary}
            onClick={() => abrir("example")}
          >
            Muéstrame un ejemplo
          </button>
        ) : (
          <button
            type="button"
            style={S.secondary}
            onClick={() => abrir("explanation")}
          >
            Volver a la explicación
          </button>
        )}
        <button
          type="button"
          style={S.quiet}
          aria-expanded
          aria-controls={panelId}
          onClick={() => setAbierto(false)}
        >
          Volver a mi respuesta
        </button>
      </div>
    </div>
  );
}
