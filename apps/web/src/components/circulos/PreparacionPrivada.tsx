"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CirclePreparationField,
  CircleShareConfirmation,
  CircleSharingMode,
} from "@psico/types";
import { CIRCLE_SHARE_LIMITS } from "@psico/types";

import { estilos as S } from "./estilos";

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
  };
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
      .map((f) => ({
        fieldKey: f.fieldKey,
        value: draft.values[f.fieldKey] ?? "",
      }))
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
  readonly busy: boolean;
}

export function PreparacionPrivada({
  fields,
  allowedModes,
  draft,
  onDraftChange,
  onPreview,
  onWithdraw,
  busy,
}: PreparacionPrivadaProps) {
  const { values, summary, mode } = draft;
  const setValues = (next: Record<string, string>) =>
    onDraftChange({ ...draft, values: next });
  const setSummary = (next: string) =>
    onDraftChange({ ...draft, summary: next });
  const setMode = (next: CircleSharingMode) =>
    onDraftChange({ ...draft, mode: next });

  const dirty = borradorTieneTexto(draft);

  // Ask before the draft is lost. The browser shows its own wording; the page
  // also says it in plain Spanish below, because a native dialog is easy to
  // dismiss without reading.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const confirmation = useMemo(
    () => confirmacionDe(draft, fields),
    [draft, fields],
  );

  return (
    <section style={S.section} aria-labelledby="prep-h">
      <h2 id="prep-h" style={S.h2}>
        Tu preparación
      </h2>

      <p style={S.aviso} role="note">
        Lo que escribes aquí se queda en esta pantalla. No se guarda en ningún
        sitio y no sale de tu dispositivo hasta que tú confirmes qué compartir.
        <strong> Si recargas o cierras esta página, se pierde.</strong>
      </p>

      <fieldset style={S.fieldset}>
        <legend style={S.legend}>¿Qué quieres compartir?</legend>
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

      {mode === "SELECTED_FIELDS" &&
        fields.map((f) => {
          const limit = Math.min(
            f.maxLength ?? CIRCLE_SHARE_LIMITS.maxFieldLength,
            CIRCLE_SHARE_LIMITS.maxFieldLength,
          );
          const value = values[f.fieldKey] ?? "";
          return (
            <p key={f.fieldKey} style={S.field}>
              <label htmlFor={`f-${f.fieldKey}`} style={S.label}>
                {f.label}
              </label>
              <textarea
                id={`f-${f.fieldKey}`}
                value={value}
                maxLength={limit}
                rows={4}
                onChange={(e) =>
                  setValues({ ...values, [f.fieldKey]: e.target.value })
                }
                style={S.textarea}
              />
              <span style={S.counter}>
                {value.length} / {limit}
              </span>
            </p>
          );
        })}

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
        <button type="button" style={S.quiet} onClick={onWithdraw}>
          Salir de esta actividad
        </button>
      </div>
    </section>
  );
}

const MODE_LABEL: Record<CircleSharingMode, string> = {
  SELECTED_FIELDS: "Compartir lo que elija, campo por campo",
  EDITED_SUMMARY: "Compartir un resumen escrito por mí",
  KEEP_PRIVATE: "No compartir nada esta vez",
  WITHDRAW: "Salir",
};
