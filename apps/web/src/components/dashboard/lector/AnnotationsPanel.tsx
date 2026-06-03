"use client";

import { useEffect, useRef, useState } from "react";
import type { AnnotationSummary } from "@psico/types";

interface Props {
  annotations: AnnotationSummary[];
  /** Block to focus on open — set by the parent when the user clicks the
   * little annotation badge next to a block. Null = show the full list. */
  focusBlockId: string | null;
  /** Optional pending block id when the user just selected text and clicked
   * "Nota" in the highlight popover — the composer opens scoped to that block. */
  pendingBlockId: string | null;
  onClearPending: () => void;
  isOpen: boolean;
  onClose: () => void;
  onCreate: (blockId: string, text: string) => Promise<void>;
  onUpdate: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * AnnotationsPanel — right-side sheet with all chapter annotations.
 *
 * Opens when:
 *   1. The user clicks the badge on a block (focusBlockId set)
 *   2. The user clicks "Nota" in the highlight popover (pendingBlockId set,
 *      composer starts empty and focused)
 *   3. The user clicks the side toggle in the lector header (focus null,
 *      shows all)
 *
 * Each row supports inline edit + delete. Delete confirms in-place.
 */
export function AnnotationsPanel({
  annotations,
  focusBlockId,
  pendingBlockId,
  onClearPending,
  isOpen,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [composerText, setComposerText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus the composer when a pending block is set.
  useEffect(() => {
    if (pendingBlockId && composerRef.current) {
      composerRef.current.focus();
    }
  }, [pendingBlockId]);

  // Filter when a specific block is focused.
  const visible = focusBlockId
    ? annotations.filter((a) => a.blockId === focusBlockId)
    : annotations;

  if (!isOpen) return null;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col overflow-hidden border-l-[1.5px] bg-white shadow-xl"
      style={{ borderColor: "var(--color-warm-200)" }}
      aria-label="Notas del capítulo"
    >
      <header
        className="flex items-center justify-between border-b-[1.5px] px-5 py-4"
        style={{ borderColor: "var(--color-warm-100)" }}
      >
        <h3
          className="text-[14px] font-bold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Notas {focusBlockId ? "del bloque" : "del capítulo"}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="text-[18px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Composer — shown when a block is pending (user clicked "Nota") */}
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
              placeholder="Escribe tu nota…"
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
            Aún no hay notas{" "}
            {focusBlockId ? "en este bloque" : "en este capítulo"}.
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
    </aside>
  );
}
