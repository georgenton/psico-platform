"use client";

import { useState } from "react";

import type { CircleRosterEntry } from "@psico/types";

/**
 * «Continuar con quienes aceptaron», and the sentence before it.
 *
 * ── Why this asks twice ────────────────────────────────────────────────────
 *
 * Fixing the group is not undoable in this cut, and it does two things the
 * organiser has to see before pressing: it decides WHO will read everybody's
 * answers, and it stops the pending links from admitting anybody else. A
 * button that did that on one click would be a button that quietly ended
 * somebody's chance to join.
 *
 * So the confirmation names the exact list — not a count — and says plainly
 * what happens to the invitations nobody redeemed.
 *
 * ── What it does not offer ─────────────────────────────────────────────────
 *
 * Any way to leave somebody out. Everybody who accepted is in the group; there
 * is no checkbox, and the command carries no arguments. An organiser who wants
 * a smaller room does not invite more people.
 */
export interface ContinuarProps {
  readonly roster: readonly CircleRosterEntry[];
  /** How many accepted — the size the group will have. */
  readonly group: number;
  /** How many invitations are still waiting. */
  readonly pending: number;
  /** Runs the command; resolves false when it was refused. */
  readonly onConfirm: () => Promise<boolean>;
}

export function ContinuarConQuienesAceptaron({
  roster,
  group,
  pending,
  onConfirm,
}: ContinuarProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const inside = roster.filter((r) => r.state !== "INVITED");

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        data-testid="continuar-con-aceptaron"
        style={{
          marginTop: ".4rem",
          padding: ".7rem 1.1rem",
          borderRadius: "999px",
          border: "1px solid #6f8f7a",
          background: "#6f8f7a",
          color: "white",
          fontSize: "1rem",
          cursor: "pointer",
        }}
      >
        Continuar con quienes aceptaron
      </button>
    );
  }

  return (
    <div
      data-testid="continuar-confirmacion"
      style={{
        marginTop: ".6rem",
        padding: ".9rem",
        borderRadius: ".75rem",
        border: "1px solid #dfe6e0",
        background: "#fbfcfb",
      }}
    >
      <p style={{ margin: "0 0 .4rem", fontWeight: 600 }}>
        La actividad seguirá con {group} {group === 2 ? "persona" : "personas"}:
      </p>
      <ul style={{ margin: "0 0 .6rem", padding: 0, listStyle: "none" }}>
        {inside.map((entry, index) => (
          <li key={`${entry.name}-${index}`} style={{ margin: ".15rem 0" }}>
            {entry.name}
            {entry.you ? " (tú)" : ""}
          </li>
        ))}
      </ul>
      <p style={{ margin: "0 0 .8rem", color: "#5b6660" }}>
        {pending > 0
          ? `Las ${pending === 1 ? "invitación que queda" : `${pending} invitaciones que quedan`} sin aceptar dejarán de admitir participantes. No se puede volver a abrir.`
          : "Después de esto no se podrá agregar a nadie más."}
      </p>
      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy}
          data-testid="continuar-confirmar"
          onClick={async () => {
            setBusy(true);
            const ok = await onConfirm();
            setBusy(false);
            if (ok) setAsking(false);
          }}
          style={{
            padding: ".7rem 1.1rem",
            borderRadius: "999px",
            border: "1px solid #6f8f7a",
            background: "#6f8f7a",
            color: "white",
            cursor: busy ? "progress" : "pointer",
          }}
        >
          {busy ? "Un momento…" : "Sí, continuar"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setAsking(false)}
          style={{
            padding: ".7rem 1.1rem",
            borderRadius: "999px",
            border: "1px solid #dfe6e0",
            background: "white",
            cursor: "pointer",
          }}
        >
          Todavía no
        </button>
      </div>
    </div>
  );
}
