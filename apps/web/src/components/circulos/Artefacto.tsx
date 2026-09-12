"use client";

import { useState } from "react";
import type { CircleActivityView } from "@psico/types";

import { estilos as S } from "./estilos";

/**
 * The shared result, proposed by one and confirmed by both.
 *
 * The confirmation is bound to an exact artifact AND version upstream: editing
 * the text supersedes the old version, which drops any confirmation already
 * given against it. So the button says what it confirms — this wording, this
 * version — and a proposal that has moved on shows as such rather than
 * silently counting an agreement to text nobody agreed to.
 *
 * `outcomeKind: "NONE"` means the activity is not meant to produce anything;
 * the section is absent rather than empty.
 */

export interface ArtefactoProps {
  readonly view: CircleActivityView;
  readonly busy: boolean;
  /** Resolves true only when the server accepted the proposal. */
  readonly onPropose: (body: string) => Promise<boolean>;
  readonly onConfirm: (
    artifactId: string,
    version: number,
  ) => void | Promise<unknown>;
}

export function Artefacto({
  view,
  busy,
  onPropose,
  onConfirm,
}: ArtefactoProps) {
  const artifact = view.artifact;
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  if (view.outcomeKind === "NONE") return null;

  const heading = TITULO[view.outcomeKind];

  if (!artifact || editing) {
    return (
      <section style={S.section} aria-labelledby="art-h">
        <h2 id="art-h" style={S.h2}>
          {heading}
        </h2>
        <p style={S.p}>
          Escríbanlo juntos, en las palabras de ustedes. La otra persona tendrá
          que confirmarlo antes de que quede.
        </p>
        <p style={S.field}>
          <label htmlFor="artefacto" style={S.label}>
            Propuesta
          </label>
          <textarea
            id="artefacto"
            rows={5}
            maxLength={4000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={S.textarea}
          />
        </p>
        <div style={S.acciones}>
          <button
            type="button"
            style={S.primary}
            disabled={busy || draft.trim().length === 0}
            onClick={async () => {
              // Clear ONLY on success. Wiping the box after a failed proposal
              // destroys the one copy of something the person just wrote, at
              // the exact moment they most need it back — and the failure they
              // are most likely to hit is a dropped connection, where the text
              // was never delivered anywhere.
              //
              // Retrying the identical text reuses the same idempotency key, so
              // a proposal that did land and whose response was lost replays
              // instead of creating a second version.
              if (await onPropose(draft)) {
                setDraft("");
                setEditing(false);
              }
            }}
          >
            Proponer
          </button>
          {artifact && (
            <button
              type="button"
              style={S.secondary}
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Cancelar
            </button>
          )}
        </div>
      </section>
    );
  }

  const agreed = artifact.status === "AGREED";

  return (
    <section style={S.section} aria-labelledby="art-h">
      <h2 id="art-h" style={S.h2}>
        {heading}
      </h2>

      <blockquote style={S.cita}>{artifact.body}</blockquote>

      <p style={S.p}>
        {agreed
          ? "Las dos personas lo confirmaron."
          : `${artifact.confirmationCount} de ${view.requiredParticipants} lo confirmaron.`}
      </p>

      {!agreed && (
        <div style={S.acciones}>
          {!artifact.confirmedByYou && (
            <button
              type="button"
              style={S.primary}
              disabled={busy}
              onClick={() => onConfirm(artifact.artifactId, artifact.version)}
            >
              Confirmar esta versión
            </button>
          )}
          {artifact.confirmedByYou && (
            <p style={S.p}>Ya lo confirmaste. Falta la otra persona.</p>
          )}
          <button
            type="button"
            style={S.secondary}
            disabled={busy}
            onClick={() => {
              setDraft(artifact.body);
              setEditing(true);
            }}
          >
            Proponer otra redacción
          </button>
        </div>
      )}
    </section>
  );
}

const TITULO: Record<string, string> = {
  AGREEMENT: "Un acuerdo entre ustedes",
  REQUEST: "Una petición concreta",
  RECOGNITION: "Algo que quieren reconocer",
  NONE: "",
};
