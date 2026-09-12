"use client";

import type {
  CirclePreparationField,
  CircleShareConfirmation,
} from "@psico/types";

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
}

export function PreviewCompartir({
  confirmation,
  fields,
  busy,
  onBack,
  onConfirm,
}: PreviewCompartirProps) {
  const label = (key: string) =>
    fields.find((f) => f.fieldKey === key)?.label ?? key;

  return (
    <section style={S.section} aria-labelledby="prev-h">
      <h2 id="prev-h" style={S.h2}>
        Esto es lo que verá la otra persona
      </h2>

      {confirmation.mode === "KEEP_PRIVATE" && (
        <p style={S.cita}>
          Verá que terminaste tu parte y que elegiste no compartir contenido. No
          verá nada de lo que escribiste, ni por qué.
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
        Al confirmar, esto se envía y ya no se puede editar. Se abrirá cuando
        las dos personas hayan confirmado.
      </p>

      <div style={S.acciones}>
        <button
          type="button"
          style={S.primary}
          onClick={onConfirm}
          disabled={busy}
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
