"use client";

/**
 * MG03 — four cards a reader puts in order.
 *
 * ── Why the buttons come first ─────────────────────────────────────────────
 *
 * Drag-and-drop is the obvious way to build this and the wrong thing to build
 * first. It is unusable with a keyboard, invisible to a screen reader, and
 * hostile on a small touch target. So the primary interaction is a pair of
 * buttons per card — Subir and Bajar — which work with a mouse, a finger, a
 * keyboard and a switch device without any of them being a special case.
 * Pointer dragging is layered on top for people who want it, and nothing
 * depends on it.
 *
 * ── Nothing here grades ────────────────────────────────────────────────────
 *
 * The reader's arrangement is never compared to `solved`. `solved` is shown on
 * request because the approved design offers "ver el ejemplo resuelto" as a way
 * through, and a person who takes it continues exactly as one who did not. The
 * practice completes on the confirmation button in the scene, not on this
 * component reaching an opinion.
 */

import { useId, useRef, useState } from "react";
import type { SequenceOrderingPractice } from "@psico/types";
import { practiceStyles as S } from "./practice-ui";

export function SequenceOrdering({
  interaction,
}: {
  interaction: SequenceOrderingPractice;
}) {
  // Presented in the catalog's order rotated by one, so the first arrangement
  // a reader sees is not already the answer — and deterministic, so a test and
  // a screenshot describe the same screen.
  const [order, setOrder] = useState<string[]>(() => {
    const keys = interaction.cards.map((c) => c.key);
    return [...keys.slice(1), keys[0]];
  });
  const [revealed, setRevealed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const dragKey = useRef<string | null>(null);
  const listId = useId();

  const labelOf = (key: string) =>
    interaction.cards.find((c) => c.key === key)?.label ?? key;

  const move = (key: string, delta: number) => {
    setOrder((prev) => {
      const from = prev.indexOf(key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      next.splice(to, 0, ...next.splice(from, 1));
      // Said out loud, because a card that moved silently did not move for
      // everyone: position is announced, not just rendered.
      setAnnouncement(`${labelOf(key)}. Posición ${to + 1} de ${next.length}.`);
      return next;
    });
  };

  const dropOn = (targetKey: string) => {
    const key = dragKey.current;
    dragKey.current = null;
    if (!key || key === targetKey) return;
    setOrder((prev) => {
      const next = prev.filter((k) => k !== key);
      next.splice(prev.indexOf(targetKey), 0, key);
      setAnnouncement(
        `${labelOf(key)}. Posición ${next.indexOf(key) + 1} de ${next.length}.`,
      );
      return next;
    });
  };

  const shown = revealed ? interaction.solved : order;

  return (
    <section aria-labelledby={`${listId}-h`} data-testid="practice-sequence">
      <h4 id={`${listId}-h`} style={S.subheading}>
        {interaction.scenario}
      </h4>

      <ol style={S.list} data-testid="sequence-list">
        {shown.map((key, i) => (
          <li
            key={key}
            style={S.card}
            draggable={!revealed}
            onDragStart={() => {
              dragKey.current = key;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropOn(key)}
          >
            <span style={S.position} aria-hidden="true">
              {i + 1}
            </span>
            <span style={S.cardLabel}>{labelOf(key)}</span>
            {revealed ? null : (
              <span style={S.cardButtons}>
                <button
                  type="button"
                  style={S.iconButton}
                  onClick={() => move(key, -1)}
                  disabled={i === 0}
                  aria-label={`Subir: ${labelOf(key)}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  style={S.iconButton}
                  onClick={() => move(key, 1)}
                  disabled={i === shown.length - 1}
                  aria-label={`Bajar: ${labelOf(key)}`}
                >
                  ↓
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* One live region for the whole list: a per-card one would announce
          nothing on the card that moved away from the focus. */}
      <p aria-live="polite" style={S.srOnly} data-testid="sequence-live">
        {announcement}
      </p>

      {revealed ? (
        <p style={S.feedback} data-testid="sequence-feedback">
          {interaction.feedback}
        </p>
      ) : (
        <button
          type="button"
          style={S.ghostButton}
          onClick={() => {
            setRevealed(true);
            setAnnouncement("Se muestra el ejemplo resuelto.");
          }}
        >
          {interaction.solvedLabel}
        </button>
      )}
    </section>
  );
}
