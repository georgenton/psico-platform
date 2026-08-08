"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { ChapterBlockKind, ChapterBlockSummary } from "@psico/types";

import { ReaderContentSurface } from "@/components/dashboard/lector/ReaderContentSurface";
import { previewChapterAction, saveChapterDraftAction } from "../../actions";
import {
  KIND_LABEL,
  isEditableKind,
  type ChapterContent,
  type ChapterPreview,
  type StudioBlock,
} from "../../contracts";

/**
 * The chapter editor.
 *
 * Two rules run through all of it.
 *
 * The text is never normalised while it is being typed. A textarea holds raw
 * text and it is sent raw; the moment an editor's keystroke goes through a
 * transform, blank lines vanish and spaces get eaten mid-word. Whatever
 * structure the text has is the writer's, not ours.
 *
 * Blocks this vertical cannot administer are PRESERVED, not hidden and not
 * dropped. An IMAGE keeps its `meta` and its position and is shown read-only,
 * because "we do not edit this yet" and "we lost this" must never look the same
 * to the person who wrote it.
 *
 * `revisionId` is the concurrency token. It comes from the load, goes back with
 * the save, and is replaced by whatever the save returns. On a 409 nothing local
 * is touched: the editor decides what to do with their own work.
 */

interface EditorBlock {
  /** Local identity for React and for reordering. Never sent. */
  localId: string;
  kind: string;
  content: string;
  meta: Record<string, unknown> | null;
}

interface Props {
  bookSlug: string;
  chapterOrder: number;
  bookTitle: string;
  initial: ChapterContent;
}

let seq = 0;
const nextLocalId = () => `b${(seq += 1)}`;

function toEditorBlocks(blocks: StudioBlock[]): EditorBlock[] {
  return blocks.map((b) => ({
    localId: nextLocalId(),
    kind: b.kind,
    content: b.content,
    meta: (b.meta ?? null) as Record<string, unknown> | null,
  }));
}

/** Preview blocks in the shape the ONE reader renderer expects. */
function toReaderBlocks(preview: ChapterPreview): ChapterBlockSummary[] {
  return preview.blocks.map((b) => ({
    id: b.blockKey,
    blockKey: b.blockKey,
    order: b.order,
    kind: b.kind as ChapterBlockKind,
    content: b.content,
    meta: (b.meta ?? null) as Record<string, unknown> | null,
  }));
}

export function ChapterEditor({
  bookSlug,
  chapterOrder,
  bookTitle,
  initial,
}: Props) {
  const [title, setTitle] = useState(initial.title);
  const [blocks, setBlocks] = useState<EditorBlock[]>(() =>
    toEditorBlocks(initial.blocks),
  );
  const [revisionId, setRevisionId] = useState(initial.revisionId);
  const [revisionNumber, setRevisionNumber] = useState(initial.revisionNumber);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<ChapterPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  /**
   * Editing one field must not re-key the list — that is what makes a textarea
   * lose focus and drop a keystroke mid-word.
   */
  const patchBlock = useCallback((localId: string, content: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.localId === localId ? { ...b, content } : b)),
    );
  }, []);

  const move = useCallback((index: number, delta: number) => {
    setBlocks((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  }, []);

  const remove = useCallback((localId: string) => {
    setBlocks((prev) => prev.filter((b) => b.localId !== localId));
  }, []);

  const add = useCallback((kind: string) => {
    setBlocks((prev) => [
      ...prev,
      { localId: nextLocalId(), kind, content: "", meta: null },
    ]);
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveChapterDraftAction(bookSlug, chapterOrder, {
      expectedRevisionId: revisionId,
      title,
      summary: initial.summary,
      durationMinutes: initial.durationMinutes,
      // Content only. Order is the array's order; identity is the server's.
      blocks: blocks.map((b) => ({
        kind: b.kind,
        content: b.content,
        ...(b.meta ? { meta: b.meta } : {}),
      })),
    });
    setSaving(false);

    if (result.ok && result.data) {
      setRevisionId(result.data.revisionId);
      setRevisionNumber(result.data.revisionNumber);
      setSavedAt(Date.now());
      // The preview belongs to the revision that just got superseded.
      setPreview(null);
      return;
    }
    if (result.conflict) setConflict(true);
    else setError(result.error ?? "No pudimos guardar el borrador.");
  }

  async function openPreview() {
    setPreviewing(true);
    setPreviewError(null);
    const result = await previewChapterAction(
      bookSlug,
      chapterOrder,
      revisionId,
    );
    setPreviewing(false);
    if (result.ok && result.data) {
      setPreview(result.data);
      return;
    }
    setPreviewError(
      result.conflict
        ? "El borrador cambió. Recarga para verlo."
        : (result.error ??
            "Guarda el borrador antes de previsualizar: sólo se puede ver el borrador activo."),
    );
  }

  if (conflict) {
    return (
      <div
        role="alert"
        className="mx-auto max-w-[760px] rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4"
      >
        <p className="text-[14px] font-semibold text-amber-900">
          El borrador cambió desde que abriste esta pantalla.
        </p>
        <p className="mt-1 text-[13.5px] text-amber-900">
          Recarga para continuar sin sobrescribir otros cambios.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 rounded-full bg-amber-200 px-4 py-2 text-[13px] font-semibold text-amber-900"
        >
          Recargar
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[860px] pb-24">
      <header className="mb-6">
        <Link
          href={`/dashboard/admin/contenido/${bookSlug}`}
          className="text-[12px] font-semibold"
          style={{ color: "var(--color-lavender-600)" }}
        >
          ← {bookTitle}
        </Link>
        <p
          className="mt-2 text-[11px] font-bold uppercase tracking-[0.6px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Cap. {chapterOrder} · revisión r{revisionNumber}{" "}
          {initial.revisionStatus === "DRAFT" ? "(borrador)" : "(publicada)"}
        </p>
        <label className="mt-2 block">
          <span className="sr-only">Título del capítulo</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Título del capítulo"
            className="w-full rounded-lg border px-3 py-2 text-[20px] font-bold"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-900)",
            }}
          />
        </label>
      </header>

      <ol className="space-y-3">
        {blocks.map((b, i) => (
          <li
            key={b.localId}
            className="rounded-xl border px-4 py-3"
            style={{
              borderColor: "var(--color-warm-200)",
              background: isEditableKind(b.kind)
                ? "var(--color-warm-50)"
                : "var(--color-lavender-50)",
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                className="text-[11px] font-bold uppercase tracking-[0.6px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                {KIND_LABEL[b.kind] ?? b.kind}
                {!isEditableKind(b.kind) && " · se conserva"}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Mover arriba el bloque ${i + 1}`}
                  className="rounded px-2 py-1 text-[12px] disabled:opacity-30"
                  style={{ color: "var(--color-warm-600)" }}
                >
                  ↑ Mover arriba
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === blocks.length - 1}
                  aria-label={`Mover abajo el bloque ${i + 1}`}
                  className="rounded px-2 py-1 text-[12px] disabled:opacity-30"
                  style={{ color: "var(--color-warm-600)" }}
                >
                  ↓ Mover abajo
                </button>
                <button
                  type="button"
                  onClick={() => remove(b.localId)}
                  aria-label={`Quitar el bloque ${i + 1}`}
                  className="rounded px-2 py-1 text-[12px]"
                  style={{ color: "var(--color-rose-600, #be123c)" }}
                >
                  Quitar bloque
                </button>
              </div>
            </div>

            {isEditableKind(b.kind) ? (
              <textarea
                value={b.content}
                onChange={(e) => patchBlock(b.localId, e.target.value)}
                aria-label={`${KIND_LABEL[b.kind] ?? b.kind} ${i + 1}`}
                rows={b.kind === "PARAGRAPH" ? 6 : 3}
                className="w-full resize-y rounded-lg border px-3 py-2 text-[14.5px] leading-[1.7]"
                style={{
                  borderColor: "var(--color-warm-200)",
                  color: "var(--color-warm-800)",
                }}
              />
            ) : (
              <div>
                <p
                  className="text-[13.5px]"
                  style={{ color: "var(--color-warm-700)" }}
                >
                  {b.content || "(sin texto)"}
                </p>
                <p
                  className="mt-1 text-[12px]"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  Este bloque se conserva tal cual. Su administración llega con
                  la gestión de medios.
                </p>
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className="text-[12px] font-semibold"
          style={{ color: "var(--color-warm-500)" }}
        >
          Añadir:
        </span>
        {(["PARAGRAPH", "HEADING", "QUOTE", "PAUSE"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => add(k)}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-700)",
            }}
          >
            + {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div
        className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4"
        style={{
          borderColor: "var(--color-warm-200)",
          background: "var(--color-warm-50)",
        }}
      >
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--color-lavender-600)" }}
        >
          {saving ? "Guardando…" : "Guardar borrador"}
        </button>
        <button
          type="button"
          onClick={openPreview}
          disabled={previewing}
          className="rounded-full px-4 py-2.5 text-[13.5px] font-semibold"
          style={{
            background: "var(--color-lavender-100)",
            color: "var(--color-lavender-700)",
          }}
        >
          {previewing ? "Cargando…" : "Previsualizar"}
        </button>
        {savedAt !== null && (
          <span
            role="status"
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-sage-700)" }}
          >
            Borrador guardado · r{revisionNumber}
          </span>
        )}
        {error && (
          <span role="alert" className="text-[13px] text-red-700">
            {error}
          </span>
        )}
        <span
          className="w-full text-[12.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Guardar no publica. El lector sigue viendo lo publicado hasta que
          publiques el libro.
        </span>
      </div>

      {previewError && (
        <p role="alert" className="mt-3 text-[13px] text-amber-800">
          {previewError}
        </p>
      )}

      {preview && (
        <section
          className="mt-8 rounded-2xl border px-6 py-6"
          style={{
            borderColor: "var(--color-lavender-200)",
            background: "var(--color-warm-50)",
          }}
        >
          <p
            className="mb-1 text-[11px] font-bold uppercase tracking-[0.6px]"
            style={{ color: "var(--color-lavender-600)" }}
          >
            Vista previa · borrador r{preview.revisionNumber}
          </p>
          <h2
            className="mb-4 text-[20px] font-bold"
            style={{ color: "var(--color-warm-900)" }}
          >
            {preview.title}
          </h2>
          {/* The reader's own renderer. Nothing here starts a session, a guide
              or any other lifecycle: the preview surface has no writes in it. */}
          <ReaderContentSurface blocks={toReaderBlocks(preview)} />
        </section>
      )}
    </div>
  );
}
