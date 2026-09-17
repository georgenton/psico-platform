"use client";

import type { CircleRosterEntry } from "@psico/types";

import { useHidratado } from "./useHidratado";

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
 *
 * ── Why «asking» is not this component\'s state ────────────────────────────
 *
 * Because the room polls. This subtree is rebuilt whenever the activity is
 * refetched, and a confirmation kept HERE was wiped a few seconds after the
 * organiser opened it — the panel they were reading vanished under them and
 * the button came back as if they had never pressed it. The hosted walk found
 * it by clicking and then finding «Continuar» still on screen.
 *
 * So the room owns it, above the polled view, and this component is told.
 */
export interface ContinuarProps {
  readonly roster: readonly CircleRosterEntry[];
  /** How many accepted — the size the group will have. */
  readonly group: number;
  /** How many invitations are still waiting. */
  readonly pending: number;
  /** Runs the command; resolves false when it was refused. */
  readonly onConfirm: () => Promise<boolean>;
  /** Whether the confirmation is open. Owned by the room, not by this. */
  readonly asking: boolean;
  readonly onAsk: () => void;
  readonly onCancel: () => void;
  readonly busy: boolean;
}

export function ContinuarConQuienesAceptaron({
  roster,
  group,
  pending,
  onConfirm,
  asking,
  onAsk,
  onCancel,
  busy,
}: ContinuarProps) {
  // The same gate every other door into an activity uses, and for the reason
  // `useHidratado` documents: this button's whole behaviour is an `onClick`,
  // its markup arrives from the server looking ready, and a press before React
  // attaches is swallowed — no navigation, no error, nothing. Over a real
  // network that window is long enough to eat the organiser's first press on
  // the one action that moves the room forward.
  //
  // Found on the hosted candidate exactly that way: the walk clicked, nothing
  // happened, and «Continuar» was still on screen.
  const hidratado = useHidratado();
  const inside = roster.filter((r) => r.state !== "INVITED");

  if (!asking) {
    return (
      <button
        type="button"
        onClick={onAsk}
        disabled={!hidratado}
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
          disabled={busy || !hidratado}
          data-testid="continuar-confirmar"
          onClick={async () => {
            const ok = await onConfirm();
            if (ok) onCancel();
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
          onClick={onCancel}
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
