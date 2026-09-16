"use client";

import { useMemo, useState } from "react";
import type {
  CirclePreparationField,
  CircleShareConfirmation,
  CircleSharingMode,
} from "@psico/types";
import { CIRCLE_SHARE_LIMITS } from "@psico/types";

import { estilos as S } from "./estilos";
import { AyudaEcho } from "./AyudaEcho";

/**
 * The private half of the activity.
 *
 * Everything typed here lives in React state and nowhere else. No autosave, no
 * Server Action, no `localStorage`, no draft endpoint, no analytics event, no
 * error report that carries the text. That is not an optimisation deferred for
 * later — it is the feature. A draft is thinking out loud, and the promise this
 * screen makes is that thinking out loud costs nothing: until the person reads
 * the preview and presses confirm, not one character has crossed the network,
 * so there is nothing to leak, nothing to subpoena and nothing to "recover"
 * against their wishes.
 *
 * The price is real and is stated plainly on screen rather than buried: closing
 * the tab loses the draft. `beforeunload` makes the browser ask first, which is
 * the most a page can do without storing something.
 *
 * ── One question at a time ─────────────────────────────────────────────────
 *
 * The form used to show every question at once with the sharing choice on top,
 * which asked somebody to decide what they would share before they had written
 * anything. It now walks: one question per screen, then the sharing decision,
 * then the exact preview. Moving between steps is local — `paso` is a number in
 * this component and nothing else — and the draft lives a level up, so going
 * back never costs a word.
 *
 * The step counter is deliberately quiet. "2 de 3" tells somebody the shape of
 * what they agreed to; making it the loudest thing on screen would turn a
 * conversation into a form.
 */

/**
 * The draft, owned by `SalaDuo`.
 *
 * It lives one level up rather than inside this component because "Volver a
 * editar" unmounts the form: state held here would be discarded by React the
 * moment somebody looked at the preview and changed their mind, which is the
 * one point in the flow where losing it is least forgivable — they have just
 * re-read what they wrote. Lifting it keeps the same guarantee (memory only,
 * nothing persisted) while letting the person move back and forth.
 */
export interface BorradorPrivado {
  readonly mode: CircleSharingMode;
  readonly values: Record<string, string>;
  readonly summary: string;
  /**
   * Which answers this person has chosen to put on the table.
   *
   * An explicit decision per question, not "whatever has text in it". The
   * difference matters for a question somebody may answer only for themselves:
   * writing down the situation you are thinking of should not be the same act
   * as showing it to the other person.
   *
   * A key that is absent means "not decided yet", and the default is read from
   * the field: required questions start selected — that is what every template
   * written before this existed meant — and `optional: true` ones start
   * unselected, so the context is never shared by having been typed.
   *
   * Optional, and read through `seComparte`: a draft literal written before
   * this existed must still answer the question rather than throw.
   */
  readonly shared?: Record<string, boolean>;
}

export function borradorInicial(
  allowedModes: readonly CircleSharingMode[],
): BorradorPrivado {
  return {
    mode: allowedModes.includes("SELECTED_FIELDS")
      ? "SELECTED_FIELDS"
      : (allowedModes[0] ?? "KEEP_PRIVATE"),
    values: {},
    summary: "",
    shared: {},
  };
}

/** Would this answer travel, as things stand? */
export function seComparte(
  draft: BorradorPrivado,
  field: CirclePreparationField,
): boolean {
  // `shared` is optional at runtime on purpose: a draft literal built before
  // this field existed — in a test, or in state restored across a deploy —
  // must still answer the question rather than throw.
  return draft.shared?.[field.fieldKey] ?? field.optional !== true;
}

/** Is there anything here worth warning somebody about before they lose it? */
export function borradorTieneTexto(draft: BorradorPrivado): boolean {
  return (
    Object.values(draft.values).some((v) => v.trim().length > 0) ||
    draft.summary.trim().length > 0
  );
}

/** The confirmation this draft would produce, or null when it is not ready. */
export function confirmacionDe(
  draft: BorradorPrivado,
  fields: readonly CirclePreparationField[],
): CircleShareConfirmation | null {
  if (draft.mode === "KEEP_PRIVATE") return { mode: "KEEP_PRIVATE" };
  if (draft.mode === "EDITED_SUMMARY") {
    if (draft.summary.trim().length === 0) return null;
    return { mode: "EDITED_SUMMARY", summary: draft.summary };
  }
  if (draft.mode === "SELECTED_FIELDS") {
    const chosen = fields
      .filter((f) => seComparte(draft, f))
      .map((f) => ({
        fieldKey: f.fieldKey,
        value: draft.values[f.fieldKey] ?? "",
      }))
      // An empty answer is not a share. Sending one would be padding the
      // payload with a decision nobody made.
      .filter((f) => f.value.trim().length > 0);
    if (chosen.length === 0) return null;
    return { mode: "SELECTED_FIELDS", fields: chosen };
  }
  return null;
}

export interface PreparacionPrivadaProps {
  readonly fields: readonly CirclePreparationField[];
  readonly allowedModes: readonly CircleSharingMode[];
  readonly draft: BorradorPrivado;
  readonly onDraftChange: (draft: BorradorPrivado) => void;
  readonly onPreview: (confirmation: CircleShareConfirmation) => void;
  readonly onWithdraw: () => void;
  /** Counted in memory by the room. Never sent from here. */
  readonly onHelpOpen?: (fieldKey: string, piece: string) => void;
  readonly busy: boolean;
}

export function PreparacionPrivada({
  fields,
  allowedModes,
  draft,
  onDraftChange,
  onPreview,
  onWithdraw,
  onHelpOpen,
  busy,
}: PreparacionPrivadaProps) {
  const { values, summary, mode } = draft;
  const setValues = (next: Record<string, string>) =>
    onDraftChange({ ...draft, values: next });
  const setSummary = (next: string) =>
    onDraftChange({ ...draft, summary: next });
  const setMode = (next: CircleSharingMode) =>
    onDraftChange({ ...draft, mode: next });
  const setShared = (fieldKey: string, next: boolean) =>
    onDraftChange({ ...draft, shared: { ...draft.shared, [fieldKey]: next } });

  // Local, and only local. Which step somebody is on is not a fact about the
  // activity, and the server has no reason to learn it.
  //
  // It starts at the sharing step when the draft already has something in it,
  // because that is where somebody was when they left. "Volver a editar"
  // unmounts this component, so a plain `useState(0)` would answer a request to
  // review the preview by putting them back at question one — which loses their
  // place for the same reason losing the draft loses their words.
  const [paso, setPaso] = useState(() =>
    borradorTieneTexto(draft) ? fields.length : 0,
  );

  // The `beforeunload` listener is NOT here. It lived in this component and was
  // torn down the moment somebody pressed "Ver qué se compartirá", because that
  // unmounts the form — so the warning vanished at precisely the stage where a
  // draft still exists and the person is most likely to close the tab thinking
  // they are done. It belongs to whoever owns the draft, and that is `SalaDuo`.

  const confirmation = useMemo(
    () => confirmacionDe(draft, fields),
    [draft, fields],
  );

  const total = fields.length + 1;
  const enCompartir = paso >= fields.length;
  const field = enCompartir ? null : fields[paso];

  const salida = (
    <button type="button" style={S.quiet} onClick={onWithdraw}>
      Salir de esta actividad
    </button>
  );

  const privacidad = (
    <p style={S.aviso} role="note">
      Lo que escribes aquí se queda en esta pantalla. No se guarda en ningún
      sitio y no sale de tu dispositivo hasta que tú confirmes qué compartir.
      <strong> Si recargas o cierras esta página, se pierde.</strong>
    </p>
  );

  if (field) {
    const limit = Math.min(
      field.maxLength ?? CIRCLE_SHARE_LIMITS.maxFieldLength,
      CIRCLE_SHARE_LIMITS.maxFieldLength,
    );
    const value = values[field.fieldKey] ?? "";
    return (
      <section style={S.section} aria-label="Tu preparación">
        <p style={S.paso}>
          Paso {paso + 1} de {total}
        </p>
        <h2 id="prep-h" style={S.h2}>
          {field.label}
        </h2>
        {field.optional === true && (
          <p style={S.nota}>
            Puedes dejarlo en blanco y seguir. No hace falta nombrar una emoción
            ni contar algo difícil.
          </p>
        )}

        {privacidad}

        {/*
          The heading IS the question, so there is no second visible label
          above the box. The field carries the same text as its accessible
          name: `aria-labelledby` pointing at the heading would make the
          heading itself matchable as a label, which is ambiguous for anything
          reading the page programmatically.
        */}
        <p style={S.field}>
          <textarea
            id={`f-${field.fieldKey}`}
            aria-label={field.label}
            value={value}
            maxLength={limit}
            rows={field.kind === "LONG_TEXT" ? 7 : 4}
            onChange={(e) =>
              setValues({ ...values, [field.fieldKey]: e.target.value })
            }
            style={S.textarea}
          />
          <span style={S.counter}>
            {value.length} / {limit}
          </span>
        </p>

        {field.help && (
          <AyudaEcho
            help={field.help}
            onOpen={(piece) => onHelpOpen?.(field.fieldKey, piece)}
          />
        )}

        <div style={S.acciones}>
          <button
            type="button"
            style={S.primary}
            onClick={() => setPaso(paso + 1)}
          >
            Continuar
          </button>
          {paso > 0 && (
            <button
              type="button"
              style={S.secondary}
              onClick={() => setPaso(paso - 1)}
            >
              Atrás
            </button>
          )}
          {salida}
        </div>
      </section>
    );
  }

  return (
    <section style={S.section} aria-label="Tu preparación">
      <p style={S.paso}>
        Paso {total} de {total}
      </p>
      <h2 id="prep-h" style={S.h2}>
        ¿Qué quieres compartir?
      </h2>

      {privacidad}

      <fieldset style={S.fieldset}>
        <legend style={S.legend}>Elige una forma</legend>
        {allowedModes
          .filter((m) => m !== "WITHDRAW")
          .map((m) => (
            <label key={m} style={S.radioRow}>
              <input
                type="radio"
                name="modo"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                style={S.radio}
              />
              <span>{MODE_LABEL[m]}</span>
            </label>
          ))}
      </fieldset>

      {mode === "SELECTED_FIELDS" && (
        <fieldset style={S.fieldset}>
          <legend style={S.legend}>Marca lo que quieres mostrar</legend>
          {fields.map((f) => {
            const value = values[f.fieldKey] ?? "";
            const vacio = value.trim().length === 0;
            return (
              <label key={f.fieldKey} style={S.radioRow}>
                <input
                  type="checkbox"
                  name={`compartir-${f.fieldKey}`}
                  checked={seComparte(draft, f) && !vacio}
                  disabled={vacio}
                  onChange={(e) => setShared(f.fieldKey, e.target.checked)}
                  style={S.radio}
                />
                <span>
                  {f.label}
                  {vacio ? " — sin responder" : ""}
                </span>
              </label>
            );
          })}
          <p style={S.nota}>
            Lo que no marques se queda contigo: no viaja, ni entero ni resumido.
            Puedes volver atrás y cambiarlo.
          </p>
        </fieldset>
      )}

      {mode === "EDITED_SUMMARY" && (
        <p style={S.field}>
          <label htmlFor="resumen" style={S.label}>
            En tus palabras
          </label>
          <textarea
            id="resumen"
            value={summary}
            maxLength={CIRCLE_SHARE_LIMITS.maxSummaryLength}
            rows={7}
            onChange={(e) => setSummary(e.target.value)}
            style={S.textarea}
          />
          <span style={S.counter}>
            {summary.length} / {CIRCLE_SHARE_LIMITS.maxSummaryLength}
          </span>
        </p>
      )}

      {mode === "KEEP_PRIVATE" && (
        <p style={S.p}>
          No compartirás nada de lo que escribiste. La otra persona verá que
          terminaste, y nada más. No hace falta explicar por qué.
        </p>
      )}

      <div style={S.acciones}>
        <button
          type="button"
          style={S.primary}
          disabled={busy || confirmation === null}
          onClick={() => confirmation && onPreview(confirmation)}
        >
          Ver qué se compartirá
        </button>
        <button
          type="button"
          style={S.secondary}
          onClick={() => setPaso(fields.length - 1)}
        >
          Atrás
        </button>
        {salida}
      </div>
    </section>
  );
}

const MODE_LABEL: Record<CircleSharingMode, string> = {
  SELECTED_FIELDS: "Compartir lo que elija, respuesta por respuesta",
  EDITED_SUMMARY: "Compartir un resumen escrito por mí",
  KEEP_PRIVATE: "No compartir nada esta vez",
  WITHDRAW: "Salir",
};
