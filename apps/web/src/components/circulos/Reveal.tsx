"use client";

import type {
  CircleActivityView,
  CirclePreparationField,
  CircleRevealedShare,
} from "@psico/types";

import { estilos as S } from "./estilos";
import { RespuestasPorCampo } from "./RespuestasPorCampo";

/**
 * What everybody else confirmed, plus the turns that structure the talk.
 *
 * `view.revealed` is present only once the server moved the activity to
 * `REVEALED`, and the barrier that does it requires EVERY seat — so this
 * component has nothing to gate. It renders what it was given; if the payload
 * had arrived early the bug would be upstream, and the projection ratchet in
 * PR3 is what guards that.
 *
 * `KEEP_PRIVATE` is shown as a plain fact with no room for a reason, because
 * the contract has no field for one. Saying "chose not to share" and stopping
 * is the whole message.
 *
 * ── Two people and a room read differently ─────────────────────────────────
 *
 * With one other person there is no ambiguity about whose answer this is, so
 * the heading says «la otra persona» and there is nothing to label. With three
 * or five there is, and the seat's positional label is what keeps the answers
 * apart — «Participante 3», the same for everybody in the room, on every read.
 * It is not a name: nobody is told which person sits in which seat, and the
 * server never knew which link went to whom.
 *
 * The list is driven by `revealed.participants`, which exists in both cases.
 * Reading `revealed.counterpart` here would have worked for a Dúo and rendered
 * one of five answers in a group, silently.
 *
 * ── Las preguntas vienen de fuera ──────────────────────────────────────────
 *
 * Una respuesta suelta no se entiende; hace falta bajo qué pregunta se
 * escribió. Esa pregunta no está en la proyección —el servidor manda claves y
 * valores— sino en la plantilla a la que la actividad está anclada, que la sala
 * ya resolvió una vez y reparte a todo el que la necesite. Por eso `fields`
 * entra por prop y no se resuelve aquí: una segunda resolución sería una
 * segunda oportunidad de divergir. Ver `RespuestasPorCampo`.
 */

function Compartido({
  share,
  fields,
}: {
  readonly share: CircleRevealedShare;
  readonly fields: readonly CirclePreparationField[];
}) {
  if (share.mode === "KEEP_PRIVATE") {
    return (
      <p style={S.cita}>
        Terminó su parte y eligió no compartir contenido esta vez.
      </p>
    );
  }
  if (share.mode === "EDITED_SUMMARY") {
    return <blockquote style={S.cita}>{share.summary}</blockquote>;
  }
  return <RespuestasPorCampo respuestas={share.fields} fields={fields} />;
}

export function Reveal({
  view,
  fields,
}: {
  readonly view: CircleActivityView;
  readonly fields: readonly CirclePreparationField[];
}) {
  const revealed = view.revealed;
  if (!revealed) return null;
  const others = revealed.participants;
  const alone = others.length === 1;

  return (
    <>
      <section style={S.section} aria-labelledby="rev-h">
        <h2 id="rev-h" style={S.h2}>
          {alone
            ? "Lo que compartió la otra persona"
            : "Lo que compartió cada quien"}
        </h2>

        {alone ? (
          <Compartido share={others[0]!.share} fields={fields} />
        ) : (
          <div style={{ display: "grid", gap: "1.1rem" }}>
            {others.map((participant) => (
              <div key={participant.label}>
                <h3 style={{ ...S.label, marginBottom: ".3rem" }}>
                  {participant.label}
                </h3>
                <Compartido share={participant.share} fields={fields} />
              </div>
            ))}
          </div>
        )}
      </section>

      {view.you.confirmed && (
        <section style={S.section} aria-labelledby="mio-h">
          <h2 id="mio-h" style={S.h2}>
            Lo que compartiste tú
          </h2>
          {view.you.confirmed.mode === "KEEP_PRIVATE" ? (
            <p style={S.cita}>Elegiste no compartir contenido.</p>
          ) : (
            <Compartido share={view.you.confirmed} fields={fields} />
          )}
        </section>
      )}

      {view.conversationTurns.length > 0 && (
        <section style={S.section} aria-labelledby="turnos-h">
          <h2 id="turnos-h" style={S.h2}>
            Para conversar
          </h2>
          <ol
            style={{
              margin: 0,
              paddingLeft: "1.2rem",
              display: "grid",
              gap: ".6rem",
            }}
          >
            {view.conversationTurns.map((turn, i) => (
              <li key={i} style={S.turno}>
                {turn}
              </li>
            ))}
          </ol>
          <p style={S.p}>
            {alone
              ? "Hablen a su ritmo. No hay respuestas correctas y no hace falta terminar todo hoy."
              : "Hablen a su ritmo, sin turnos obligatorios. No hay respuestas correctas y no hace falta terminar todo hoy."}
          </p>
        </section>
      )}
    </>
  );
}
