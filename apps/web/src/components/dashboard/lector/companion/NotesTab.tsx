"use client";

import { useEffect, useRef, useState } from "react";
import type { AnnotationSummary } from "@psico/types";

/**
 * NotesTab — the "Notas" tab of the reader companion dock.
 *
 * A nota (`Annotation`) is a short, plaintext margin note tied to a specific
 * block of the book. It is NOT encrypted (05-lector.md / ADR 0007 §G treats it
 * as a note ABOUT the text, not private thought). Contrast with a Reflexión,
 * which is an E2E-encrypted diary entry about the reader.
 *
 * This is the body of the old standalone AnnotationsPanel, lifted into the
 * dock so all three reader tools share one docked surface. The dock owns the
 * header + close; this component owns the composer + list + inline edit.
 */
export function NotesTab({
  annotations,
  focusBlockId,
  pendingBlockId,
  onClearPending,
  onCreate,
  onUpdate,
  onDelete,
}: {
  annotations: AnnotationSummary[];
  /** Block to scope to — set when the user taps a block's note badge. */
  focusBlockId: string | null;
  /** Block awaiting a fresh note — set when the user picked "Nota" on a selection. */
  pendingBlockId: string | null;
  onClearPending: () => void;
  onCreate: (blockId: string, text: string) => Promise<void>;
  onUpdate: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [composerText, setComposerText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (pendingBlockId && composerRef.current) {
      composerRef.current.focus();
    }
  }, [pendingBlockId]);

  const visible = focusBlockId
    ? annotations.filter((a) => a.blockId === focusBlockId)
    : annotations;

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {focusBlockId ? (
        <p
          className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Notas de este bloque
        </p>
      ) : null}

      {/* Composer — shown when a block is pending (user picked "Nota") */}
      {pendingBlockId && (
        <form
          className="mb-5 rounded-2xl p-3"
          style={{ background: "var(--color-lavender-50)" }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!composerText.trim()) return;
            await onCreate(pendingBlockId, composerText.trim());
            setComposerText("");
            onClearPending();
          }}
        >
          <textarea
            ref={composerRef}
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            rows={3}
            placeholder="Escribe tu nota sobre este pasaje…"
            className="mb-2 w-full resize-none rounded-xl border-[1.5px] bg-white p-2.5 text-[13px] outline-none focus:border-[var(--color-lavender-400)]"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-900)",
            }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setComposerText("");
                onClearPending();
              }}
              className="rounded-xl px-3 py-1.5 text-[12px] font-semibold"
              style={{ color: "var(--color-warm-500)" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!composerText.trim()}
              className="rounded-xl px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-lavender-500)" }}
            >
              Guardar
            </button>
          </div>
        </form>
      )}

      {visible.length === 0 ? (
        <p
          className="mt-8 text-center text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          {focusBlockId
            ? "Aún no hay notas en este bloque."
            : "Aún no hay notas en este capítulo. Subraya un pasaje y elige “Nota”."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border-[1.5px] bg-white p-3"
              style={{ borderColor: "var(--color-warm-200)" }}
            >
              {editingId === a.id ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!editingText.trim()) return;
                    await onUpdate(a.id, editingText.trim());
                    setEditingId(null);
                  }}
                >
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    rows={3}
                    className="mb-2 w-full resize-none rounded-xl border-[1.5px] p-2.5 text-[13px] outline-none focus:border-[var(--color-lavender-400)]"
                    style={{
                      borderColor: "var(--color-warm-200)",
                      color: "var(--color-warm-900)",
                    }}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-[12px]"
                      style={{ color: "var(--color-warm-500)" }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl px-3 py-1 text-[12px] font-semibold text-white"
                      style={{ background: "var(--color-lavender-500)" }}
                    >
                      Guardar
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p
                    className="whitespace-pre-wrap text-[13px] leading-relaxed"
                    style={{ color: "var(--color-warm-800)" }}
                  >
                    {a.text}
                  </p>
                  <div
                    className="mt-2 flex items-center justify-between text-[11px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    <span>
                      {new Date(a.createdAt).toLocaleDateString("es-EC", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(a.id);
                          setEditingText(a.text);
                        }}
                        className="font-semibold"
                        style={{ color: "var(--color-lavender-700)" }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("¿Eliminar esta nota?")) onDelete(a.id);
                        }}
                        className="font-semibold"
                        style={{ color: "var(--color-error-text, #B91C1C)" }}
                      >
                        Eliminar
                      </button>
                    </span>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
