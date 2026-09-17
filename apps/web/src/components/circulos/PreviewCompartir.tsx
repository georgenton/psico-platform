"use client";

import type {
  CircleKind,
  CirclePreparationField,
  CircleShareConfirmation,
} from "@psico/types";
import { circleModalidadEsGrupo } from "@psico/types";

import { estilos as S } from "./estilos";

/**
 * Exactly what will be sent, before it is sent.
 *
 * Not a summary of it, not a count of fields, not "you selected 3 answers" —
 * the literal text, rendered the way the other person will receive it. This is
 * the last moment the draft is still private, and the only honest way to ask
 * "are you sure" is to show the thing itself.
 *
 * Nothing has crossed the network yet when this renders. The confirmation is
 * still the in-memory object built from React state; pressing "Back" discards
 * it with no trace anywhere.
 */

export interface PreviewCompartirProps {
  readonly confirmation: CircleShareConfirmation;
  readonly fields: readonly CirclePreparationField[];
  readonly busy: boolean;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
  /**
   * How many people are in this activity, the actor included. Two unless the
   * room says otherwise — the default keeps every existing caller honest
   * without a migration, and a Dúo is the only shape for which it is right.
   */
  readonly participantes?: number;
  /**
   * The room is still taking people in, so there is nobody to confirm TO yet.
   *
   * The preview still works — seeing exactly what you would send is the whole
   * point of preparing early — but sending is not offered, because a
   * confirmation is permission for a specific list of people and that list
   * does not exist until the organiser fixes it.
   */
  readonly incorporacionAbierta?: boolean;
  /**
   * Which RULES this activity runs under — not how many people are in it.
   *
   * The count below decides whether to say «la otra persona» or «las demás
   * personas». This decides what confirming KEEP_PRIVATE actually does, which
   * is not the same question and used to be answered by the same number.
   */
  readonly modalidad?: CircleKind;
}

export function PreviewCompartir({
  confirmation,
  fields,
  busy,
  onBack,
  onConfirm,
  participantes = 2,
  incorporacionAbierta = false,
  modalidad,
}: PreviewCompartirProps) {
  // Wording versus consequences. A group that continued with two says «la otra
  // persona» and still ends for everybody if this person keeps it private.
  const grupo = participantes > 2;
  const reglasDeGrupo = circleModalidadEsGrupo(modalidad, participantes);
  const label = (key: string) =>
    fields.find((f) => f.fieldKey === key)?.label ?? key;

  return (
    <section style={S.section} aria-labelledby="prev-h">
      <h2 id="prev-h" style={S.h2}>
        {grupo
          ? "Esto es lo que verán las demás personas"
          : "Esto es lo que verá la otra persona"}
      </h2>

      {confirmation.mode === "KEEP_PRIVATE" && (
        <p style={S.cita}>
          {reglasDeGrupo
            ? grupo
              ? "Nadie verá nada. Al confirmar, esta actividad termina para todo el grupo: lo que escribieron las demás personas se descarta sin abrirse, y no se le dice a nadie quién lo eligió."
              : // Two people, the group's rules. Not the Dúo's sentence: there
                // the other person is told you finished without sharing, and
                // here nobody is told who ended it.
                "Nadie verá nada. Al confirmar, esta actividad termina para las dos personas: lo que escribió la otra persona se descarta sin abrirse, y no se le dice a nadie quién lo eligió."
            : "Verá que terminaste tu parte y que elegiste no compartir contenido. No verá nada de lo que escribiste, ni por qué."}
        </p>
      )}

      {confirmation.mode === "EDITED_SUMMARY" && (
        <blockquote style={S.cita}>{confirmation.summary}</blockquote>
      )}

      {confirmation.mode === "SELECTED_FIELDS" && (
        <dl style={{ margin: 0, display: "grid", gap: ".75rem" }}>
          {confirmation.fields.map((f) => (
            <div key={f.fieldKey}>
              <dt style={S.label}>{label(f.fieldKey)}</dt>
              <dd style={{ margin: ".25rem 0 0" }}>
                <blockquote style={S.cita}>{f.value}</blockquote>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p style={S.aviso} role="note">
        {reglasDeGrupo && confirmation.mode === "KEEP_PRIVATE"
          ? "Al confirmar, la actividad se cierra. No se puede deshacer."
          : `Al confirmar, esto se envía y ya no se puede editar. Se abrirá cuando ${
              grupo
                ? "todas las personas hayan confirmado"
                : "las dos personas hayan confirmado"
            }.`}
      </p>

      {/* Preparing and confirming are two different acts, and this is where
          the screen has to say so. While the room is still taking people in
          there is no list of recipients yet, so «Confirmar y enviar» would be
          asking for permission to share with an audience nobody can see. */}
      {incorporacionAbierta && (
        <p style={S.aviso} data-testid="preview-incorporacion-abierta">
          Todavía se están incorporando personas. Puedes dejar tu parte lista;
          cuando quien organiza continúe con el grupo, verás quiénes van a
          leerte y podrás confirmar el envío.
        </p>
      )}

      <div style={S.acciones}>
        <button
          type="button"
          style={S.primary}
          onClick={onConfirm}
          disabled={busy || incorporacionAbierta}
        >
          Confirmar y enviar
        </button>
        <button
          type="button"
          style={S.secondary}
          onClick={onBack}
          disabled={busy}
        >
          Volver a editar
        </button>
      </div>
    </section>
  );
}
