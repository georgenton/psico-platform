"use client";

import { useState, useTransition } from "react";
import type {
  AuthorBookChapter,
  AuthorChapterBlockDto,
} from "@psico/types";
import { updateChapterAction } from "../../actions";
import { AiHelperModal } from "./AiHelperModal";

const BLOCK_KINDS = [
  { value: "paragraph", label: "Párrafo" },
  { value: "heading", label: "Título" },
  { value: "quote", label: "Cita" },
  { value: "pause", label: "Pausa" },
  { value: "exercise", label: "Ejercicio" },
] as const;

/**
 * ChapterEditor — Sprint S71-front.
 *
 * Editor por bloques simple (sin slash menu Notion-like; v2). Cada bloque es
 * un {kind, content} editable. Concurrencia optimista via expectedVersion:
 * si el server tiene una versión más nueva, mostramos un banner para
 * recargar — preferimos perder la edición local que sobreescribir trabajo
 * de otra sesión sin avisar.
 */
export function ChapterEditor({
  bookId,
  chapter,
  disabled,
  apiBase,
  accessToken,
  bookContext,
}: {
  bookId: string;
  chapter: AuthorBookChapter;
  disabled: boolean;
  apiBase: string;
  accessToken: string;
  bookContext: string;
}) {
  const [title, setTitle] = useState(chapter.title);
  const [subtitle, setSubtitle] = useState(chapter.subtitle ?? "");
  const [blocks, setBlocks] = useState<AuthorChapterBlockDto[]>(
    chapter.blocks.length > 0
      ? chapter.blocks
      : [{ kind: "paragraph", content: "" }],
  );
  const [version, setVersion] = useState(chapter.version);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [aiTarget, setAiTarget] = useState<number | null>(null);

  function setBlock(idx: number, next: Partial<AuthorChapterBlockDto>) {
    setBlocks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, ...next } : b)),
    );
  }

  function addBlock(kind: string = "paragraph") {
    setBlocks((prev) => [...prev, { kind, content: "" }]);
  }

  function removeBlock(idx: number) {
    setBlocks((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function onSave() {
    if (disabled) return;
    setError(null);
    setFlash(null);
    setConflict(false);
    startTransition(() => {
      updateChapterAction(bookId, chapter.n, {
        title: title.trim() || `Capítulo ${chapter.n}`,
        subtitle: subtitle.trim() || undefined,
        blocks: blocks.map((b) => ({
          kind: b.kind,
          content: b.content,
        })),
        expectedVersion: version,
      })
        .then((res) => {
          setVersion(res.version);
          setFlash("Guardado");
          setTimeout(() => setFlash(null), 2500);
        })
        .catch((e: Error) => {
          if (/CHAPTER_VERSION_CONFLICT/i.test(e.message)) {
            setConflict(true);
            setError(
              "Otra sesión editó este capítulo. Recarga para ver los cambios.",
            );
          } else {
            setError(e.message || "No pudimos guardar.");
          }
        });
    });
  }

  return (
    <div
      className="space-y-5 rounded-2xl border-[1.5px] bg-white p-5"
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
          El libro está en revisión o archivado. Los capítulos no pueden editarse.
        </p>
      ) : null}

      <label className="block">
        <span
          className="mb-1 block text-[12px] font-medium"
          style={{ color: "var(--color-warm-700)" }}
        >
          Título del capítulo
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          disabled={disabled || pending}
          maxLength={200}
          className="w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[14px] outline-none focus:border-[var(--color-lavender-500)]"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </label>

      <label className="block">
        <span
          className="mb-1 block text-[12px] font-medium"
          style={{ color: "var(--color-warm-700)" }}
        >
          Subtítulo (opcional)
        </span>
        <input
          type="text"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value.slice(0, 300))}
          disabled={disabled || pending}
          maxLength={300}
          className="w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13.5px] outline-none focus:border-[var(--color-lavender-500)]"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </label>

      <hr style={{ borderColor: "var(--color-warm-200)" }} />

      <div className="space-y-3">
        {blocks.map((b, idx) => (
          <div
            key={idx}
            className="rounded-xl border-[1.5px] p-3"
            style={{
              borderColor: "var(--color-warm-200)",
              background: "var(--color-warm-50)",
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <select
                value={b.kind}
                onChange={(e) => setBlock(idx, { kind: e.target.value })}
                disabled={disabled || pending}
                className="rounded-lg border-[1.5px] bg-white px-2 py-1 text-[11.5px] font-medium"
                style={{ borderColor: "var(--color-warm-200)" }}
              >
                {BLOCK_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <div
                className="flex items-center gap-1 text-[11px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                <button
                  type="button"
                  disabled={disabled || pending || !b.content.trim()}
                  onClick={() => setAiTarget(idx)}
                  className="rounded px-1.5 py-0.5 font-semibold disabled:opacity-30"
                  style={{ color: "var(--color-lavender-600)" }}
                  title="Asistente de edición (IA)"
                >
                  ✨
                </button>
                <button
                  type="button"
                  disabled={disabled || pending || idx === 0}
                  onClick={() => moveBlock(idx, -1)}
                  className="rounded px-1.5 py-0.5 disabled:opacity-30"
                  title="Mover arriba"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={
                    disabled || pending || idx === blocks.length - 1
                  }
                  onClick={() => moveBlock(idx, 1)}
                  className="rounded px-1.5 py-0.5 disabled:opacity-30"
                  title="Mover abajo"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={disabled || pending || blocks.length === 1}
                  onClick={() => removeBlock(idx)}
                  className="rounded px-1.5 py-0.5 disabled:opacity-30"
                  style={{ color: "var(--color-rose-700)" }}
                  title="Eliminar bloque"
                >
                  ✕
                </button>
              </div>
            </div>
            <textarea
              value={b.content}
              onChange={(e) =>
                setBlock(idx, { content: e.target.value.slice(0, 8000) })
              }
              disabled={disabled || pending}
              rows={b.kind === "paragraph" ? 4 : 2}
              maxLength={8000}
              placeholder={
                b.kind === "heading"
                  ? "Título de sección"
                  : b.kind === "quote"
                    ? "Cita textual"
                    : b.kind === "pause"
                      ? "Indicación de pausa"
                      : b.kind === "exercise"
                        ? "Consigna del ejercicio"
                        : "Escribe aquí…"
              }
              className="w-full resize-y rounded-lg border-[1.5px] bg-white px-2 py-1.5 text-[13.5px] outline-none focus:border-[var(--color-lavender-500)]"
              style={{ borderColor: "var(--color-warm-200)" }}
            />
          </div>
        ))}

        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => addBlock()}
          className="w-full rounded-xl border-[1.5px] border-dashed py-2 text-[12.5px] font-medium transition disabled:opacity-50"
          style={{
            borderColor: "var(--color-warm-300)",
            color: "var(--color-warm-600)",
          }}
        >
          + Añadir bloque
        </button>
      </div>

      {error ? (
        <p
          className="text-[11.5px]"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
          {conflict ? (
            <a href="" className="ml-1 underline">
              Recargar
            </a>
          ) : null}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <span
          className="text-[11.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Versión local: {version} · {blocks.length} bloque(s)
        </span>
        <div className="flex items-center gap-3">
          {flash ? (
            <span
              className="text-[12px] font-medium"
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
            {pending ? "Guardando…" : "Guardar capítulo"}
          </button>
        </div>
      </div>

      {aiTarget !== null && blocks[aiTarget] ? (
        <AiHelperModal
          bookId={bookId}
          blockId={`local-${aiTarget}`}
          initialText={blocks[aiTarget].content}
          contextText={bookContext}
          apiBase={apiBase}
          accessToken={accessToken}
          onClose={() => setAiTarget(null)}
          onAccept={(text) => setBlock(aiTarget, { content: text })}
        />
      ) : null}
    </div>
  );
}
