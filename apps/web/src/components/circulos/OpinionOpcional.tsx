"use client";

import { useState } from "react";
import {
  CIRCLE_FEEDBACK_NOTICE,
  CIRCLE_FEEDBACK_NOTICE_VERSION,
  CIRCLE_FEEDBACK_MAX_TOPICS,
  CIRCLE_FEEDBACK_TOPICS,
} from "@psico/types";
import type { CircleFeedbackUsefulness } from "@psico/types";

import { estilos as S } from "./estilos";

/**
 * The one question we ask, after the activity is over and only if they want.
 *
 * ── Opt-in means nothing is pre-selected ───────────────────────────────────
 *
 * No topic starts chosen, no answer starts chosen, and the button that sends
 * is not the one that has focus. Somebody who presses "No, gracias" — or who
 * simply closes the tab — has answered, and the answer was no.
 *
 * Nothing about the activity depends on this. Skipping does not block the
 * close, the follow-up, or navigating away; the screen says thank you either
 * way, and so does a failure to send.
 *
 * ── What it cannot carry ───────────────────────────────────────────────────
 *
 * Eight closed labels and three words. There is no text box: not for "otro,
 * ¿cuál?", not for a comment. The answers to the ACTIVITY are not here and
 * cannot be put here — this component never sees the draft.
 *
 * "Prefiero no responder" is the absence of a topic, not a ninth topic. It
 * sends an empty list, so it can never appear in a distribution as though
 * declining were a kind of situation.
 *
 * ── The help counters ──────────────────────────────────────────────────────
 *
 * They were counted in the room's memory while somebody read Echo's help, and
 * they travel HERE or nowhere. That is the whole consent story for them: a
 * person who leaves before this screen takes their counters with them, and the
 * coverage is partial on purpose rather than by accident.
 */

export interface OpinionOpcionalProps {
  readonly activityId: string;
  /** From the room's memory. Sent only with this consent. */
  readonly helpOpens: readonly {
    fieldKey: string;
    piece: "explanation" | "example";
    opens: number;
  }[];
}

type Fase = "ofrecido" | "abierto" | "enviando" | "listo" | "declinado";

const UTILIDAD: readonly { value: CircleFeedbackUsefulness; label: string }[] =
  [
    { value: "YES", label: "Sí" },
    { value: "SOME", label: "Un poco" },
    { value: "NO", label: "No" },
  ];

export function OpinionOpcional({
  activityId,
  helpOpens,
}: OpinionOpcionalProps) {
  const [fase, setFase] = useState<Fase>("ofrecido");
  const [temas, setTemas] = useState<string[]>([]);
  const [utilidad, setUtilidad] = useState<CircleFeedbackUsefulness | null>(
    null,
  );

  const alternarTema = (key: string) => {
    setTemas((prev) =>
      prev.includes(key)
        ? prev.filter((t) => t !== key)
        : prev.length >= CIRCLE_FEEDBACK_MAX_TOPICS
          ? prev
          : [...prev, key],
    );
  };

  const enviar = async () => {
    setFase("enviando");
    try {
      await fetch(
        `/api/circulos/actividad/${encodeURIComponent(activityId)}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topics: temas,
            ...(utilidad ? { usefulness: utilidad } : {}),
            noticeVersion: CIRCLE_FEEDBACK_NOTICE_VERSION,
            helpOpens,
          }),
        },
      );
    } catch {
      // Swallowed on purpose. The activity is over; a contribution that did
      // not arrive is a contribution that did not arrive, and turning that
      // into an error message would ask somebody to care about our telemetry.
    }
    setFase("listo");
  };

  if (fase === "listo" || fase === "declinado") {
    return (
      <p style={S.nota}>
        {fase === "listo" ? "Gracias por ayudarnos." : "Sin problema."}
      </p>
    );
  }

  if (fase === "ofrecido") {
    return (
      <section style={S.section} aria-labelledby="op-h">
        <h2 id="op-h" style={S.h2}>
          ¿Nos ayudas a mejorar esta experiencia?
        </h2>
        <p style={S.p}>{CIRCLE_FEEDBACK_NOTICE}</p>
        <div style={S.acciones}>
          <button
            type="button"
            style={S.secondary}
            onClick={() => setFase("abierto")}
          >
            Sí, respondo dos preguntas
          </button>
          <button
            type="button"
            style={S.quiet}
            onClick={() => setFase("declinado")}
          >
            No, gracias
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={S.section} aria-labelledby="op-h">
      <h2 id="op-h" style={S.h2}>
        Dos preguntas, ninguna obligatoria
      </h2>

      <fieldset style={S.fieldset}>
        <legend style={S.legend}>
          ¿De qué trataba, en general? (hasta {CIRCLE_FEEDBACK_MAX_TOPICS})
        </legend>
        {CIRCLE_FEEDBACK_TOPICS.map((t) => (
          <label key={t.key} style={S.radioRow}>
            <input
              type="checkbox"
              name="tema"
              value={t.key}
              checked={temas.includes(t.key)}
              // Not disabled once two are chosen — unticking one must stay
              // possible, and a disabled control somebody cannot untick is a
              // trap rather than a limit.
              onChange={() => alternarTema(t.key)}
              style={S.radio}
            />
            <span>{t.label}</span>
          </label>
        ))}
        <p style={S.nota}>
          Si prefieres no responder, deja todo sin marcar. No es una categoría:
          simplemente no se envía ningún tema.
        </p>
      </fieldset>

      <fieldset style={S.fieldset}>
        <legend style={S.legend}>¿Te ayudó a expresar lo que querías?</legend>
        {UTILIDAD.map((u) => (
          <label key={u.value} style={S.radioRow}>
            <input
              type="radio"
              name="utilidad"
              value={u.value}
              checked={utilidad === u.value}
              onChange={() => setUtilidad(u.value)}
              style={S.radio}
            />
            <span>{u.label}</span>
          </label>
        ))}
        <label style={S.radioRow}>
          <input
            type="radio"
            name="utilidad"
            value=""
            checked={utilidad === null}
            onChange={() => setUtilidad(null)}
            style={S.radio}
          />
          <span>Prefiero no responder</span>
        </label>
      </fieldset>

      <p style={S.nota}>
        No se muestra a la otra persona y no envía nada de lo que escribiste en
        la actividad.
      </p>

      <div style={S.acciones}>
        <button
          type="button"
          style={S.primary}
          disabled={fase === "enviando"}
          onClick={enviar}
        >
          {fase === "enviando" ? "Enviando…" : "Enviar"}
        </button>
        <button
          type="button"
          style={S.quiet}
          onClick={() => setFase("declinado")}
        >
          Omitir
        </button>
      </div>
    </section>
  );
}
