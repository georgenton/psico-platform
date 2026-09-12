"use client";

import type { CircleActivityView } from "@psico/types";

import { estilos as S } from "./estilos";

/**
 * What the other person confirmed, plus the turns that structure the talk.
 *
 * `view.revealed` is present only once the server moved the activity to
 * `REVEALED`, and the barrier that does it requires BOTH seats — so this
 * component has nothing to gate. It renders what it was given; if the payload
 * had arrived early the bug would be upstream, and the projection ratchet in
 * PR3 is what guards that.
 *
 * `KEEP_PRIVATE` is shown as a plain fact with no room for a reason, because
 * the contract has no field for one. Saying "chose not to share" and stopping
 * is the whole message.
 */

export function Reveal({ view }: { readonly view: CircleActivityView }) {
  const revealed = view.revealed;
  if (!revealed) return null;
  const share = revealed.counterpart;

  return (
    <>
      <section style={S.section} aria-labelledby="rev-h">
        <h2 id="rev-h" style={S.h2}>
          Lo que compartió la otra persona
        </h2>

        {share.mode === "KEEP_PRIVATE" && (
          <p style={S.cita}>
            Terminó su parte y eligió no compartir contenido esta vez.
          </p>
        )}

        {share.mode === "EDITED_SUMMARY" && (
          <blockquote style={S.cita}>{share.summary}</blockquote>
        )}

        {share.mode === "SELECTED_FIELDS" && (
          <dl style={{ margin: 0, display: "grid", gap: ".75rem" }}>
            {share.fields.map((f) => (
              <div key={f.fieldKey}>
                <dt style={S.label}>{f.fieldKey}</dt>
                <dd style={{ margin: ".25rem 0 0" }}>
                  <blockquote style={S.cita}>{f.value}</blockquote>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {view.you.confirmed && (
        <section style={S.section} aria-labelledby="mio-h">
          <h2 id="mio-h" style={S.h2}>
            Lo que compartiste tú
          </h2>
          {view.you.confirmed.mode === "KEEP_PRIVATE" && (
            <p style={S.cita}>Elegiste no compartir contenido.</p>
          )}
          {view.you.confirmed.mode === "EDITED_SUMMARY" && (
            <blockquote style={S.cita}>{view.you.confirmed.summary}</blockquote>
          )}
          {view.you.confirmed.mode === "SELECTED_FIELDS" && (
            <dl style={{ margin: 0, display: "grid", gap: ".75rem" }}>
              {view.you.confirmed.fields.map((f) => (
                <div key={f.fieldKey}>
                  <dt style={S.label}>{f.fieldKey}</dt>
                  <dd style={{ margin: ".25rem 0 0" }}>
                    <blockquote style={S.cita}>{f.value}</blockquote>
                  </dd>
                </div>
              ))}
            </dl>
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
            Hablen a su ritmo. No hay respuestas correctas y no hace falta
            terminar todo hoy.
          </p>
        </section>
      )}
    </>
  );
}
