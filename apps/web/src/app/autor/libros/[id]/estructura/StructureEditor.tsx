"use client";

import { useState, useTransition } from "react";
import type { AuthorBookChapterSummary } from "@psico/types";
import { updateStructureAction } from "../actions";

type Row = {
  // Local row id — fixed key for React even when n changes via move.
  uid: string;
  title: string;
  subtitle: string;
  isLocked: boolean;
  isHidden: boolean;
};

function rowsFrom(chapters: AuthorBookChapterSummary[]): Row[] {
  return chapters.map((c, idx) => ({
    uid: c.id || `new-${idx}`,
    title: c.title || `Capítulo ${idx + 1}`,
    subtitle: c.subtitle ?? "",
    isLocked: c.isLocked,
    isHidden: c.isHidden,
  }));
}

let newUid = 0;

export function StructureEditor({
  bookId,
  chapters,
  disabled,
}: {
  bookId: string;
  chapters: AuthorBookChapterSummary[];
  disabled: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(rowsFrom(chapters));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  function move(idx: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function add() {
    setRows((prev) => [
      ...prev,
      {
        uid: `new-${++newUid}`,
        title: `Capítulo ${prev.length + 1}`,
        subtitle: "",
        isLocked: false,
        isHidden: false,
      },
    ]);
  }

  function remove(idx: number) {
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  }

  function patch(idx: number, next: Partial<Row>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...next } : r)),
    );
  }

  function onSave() {
    if (disabled) return;
    setError(null);
    setFlash(null);
    startTransition(() => {
      updateStructureAction(bookId, {
        chapters: rows.map((r, i) => ({
          n: i + 1,
          title: r.title.trim() || `Capítulo ${i + 1}`,
          subtitle: r.subtitle.trim() || undefined,
          isLocked: r.isLocked,
          isHidden: r.isHidden,
        })),
      })
        .then(() => {
          setFlash("Estructura guardada");
          setTimeout(() => setFlash(null), 2500);
        })
        .catch((e: Error) =>
          setError(e.message || "No pudimos guardar la estructura."),
        );
    });
  }

  return (
    <div
      className="space-y-4 rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      {disabled ? (
        <p
          className="rounded-xl px-3 py-2 text-[12px]"
          style={{
            background: "var(--color-warm-100)",
            color: "var(--color-warm-700)",
          }}
        >
          El libro está en revisión o archivado. La estructura no puede editarse.
        </p>
      ) : null}

      <ol className="space-y-2">
        {rows.map((r, idx) => (
          <li
            key={r.uid}
            className="flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] p-3"
            style={{
              borderColor: "var(--color-warm-200)",
              background: "var(--color-warm-50)",
            }}
          >
            <span
              className="w-7 text-right text-[12.5px] font-bold"
              style={{ color: "var(--color-warm-500)" }}
            >
              {idx + 1}
            </span>
            <input
              type="text"
              value={r.title}
              onChange={(e) =>
                patch(idx, { title: e.target.value.slice(0, 200) })
              }
              disabled={disabled || pending}
              maxLength={200}
              placeholder="Título del capítulo"
              className="min-w-[200px] flex-1 rounded-lg border-[1.5px] bg-white px-2 py-1 text-[13px] outline-none"
              style={{ borderColor: "var(--color-warm-200)" }}
            />
            <label className="flex items-center gap-1 text-[11.5px]">
              <input
                type="checkbox"
                checked={r.isHidden}
                onChange={(e) => patch(idx, { isHidden: e.target.checked })}
                disabled={disabled || pending}
              />
              <span style={{ color: "var(--color-warm-700)" }}>Oculto</span>
            </label>
            <label className="flex items-center gap-1 text-[11.5px]">
              <input
                type="checkbox"
                checked={r.isLocked}
                onChange={(e) => patch(idx, { isLocked: e.target.checked })}
                disabled={disabled || pending}
              />
              <span style={{ color: "var(--color-warm-700)" }}>Pro</span>
            </label>
            <div
              className="flex items-center gap-1 text-[11px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              <button
                type="button"
                disabled={disabled || pending || idx === 0}
                onClick={() => move(idx, -1)}
                className="rounded px-1.5 py-0.5 disabled:opacity-30"
                title="Mover arriba"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={
                  disabled || pending || idx === rows.length - 1
                }
                onClick={() => move(idx, 1)}
                className="rounded px-1.5 py-0.5 disabled:opacity-30"
                title="Mover abajo"
              >
                ↓
              </button>
              <button
                type="button"
                disabled={disabled || pending || rows.length === 1}
                onClick={() => remove(idx)}
                className="rounded px-1.5 py-0.5 disabled:opacity-30"
                style={{ color: "var(--color-rose-700)" }}
                title="Eliminar capítulo"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        disabled={disabled || pending}
        onClick={add}
        className="w-full rounded-xl border-[1.5px] border-dashed py-2 text-[12.5px] font-medium transition disabled:opacity-50"
        style={{
          borderColor: "var(--color-warm-300)",
          color: "var(--color-warm-600)",
        }}
      >
        + Añadir capítulo
      </button>

      {error ? (
        <p
          className="text-[11.5px]"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        {flash ? (
          <span
            className="self-center text-[12px] font-medium"
            style={{ color: "var(--color-sage-700)" }}
          >
            ✓ {flash}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || pending}
          className="rounded-full px-4 py-2 text-[12.5px] font-semibold transition disabled:opacity-50"
          style={{
            background: "var(--color-lavender-500)",
            color: "white",
          }}
        >
          {pending ? "Guardando…" : "Guardar estructura"}
        </button>
      </div>
    </div>
  );
}
