"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createChapterAction } from "../actions";

/**
 * Creating a chapter.
 *
 * The editor supplies one thing: a title. Where the chapter goes is the
 * manifest's answer, and its identity is minted by the server — offering either
 * as a field would be inviting a decision the browser is not entitled to make.
 *
 * `editingRevisionId` is the revision this page was rendered from. Sending it
 * back is what turns two tabs creating at once into a refusal instead of two
 * chapters nobody asked for.
 */
export function CreateChapterPanel({
  bookSlug,
  editingRevisionId,
  available,
  disabled = false,
  disabledReason,
}: {
  bookSlug: string;
  editingRevisionId: string;
  /**
   * The server's answer, not a conclusion drawn here. Creating while the book
   * still has chapters outside Content Core can put a new chapter where an old
   * one already answers, and that judgement belongs on the server.
   */
  available: boolean;
  /**
   * A local workflow interlock, separate from `available`. The server still
   * decides whether the book CAN take a new chapter; this only stops one being
   * created against a revision the page is no longer showing.
   */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = title.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (trimmed.length === 0 || busy) return;

    setBusy(true);
    setError(null);
    const result = await createChapterAction(bookSlug, {
      expectedRevisionId: editingRevisionId,
      title: trimmed,
    });
    setBusy(false);

    if (result.conflict) {
      // Never retry a conflict: somebody else's edit is already in the draft
      // this page never saw.
      setError(
        "El borrador cambió mientras escribías. Recarga la página antes de crear el capítulo.",
      );
      return;
    }
    if (!result.ok || !result.data) {
      setError(result.error ?? "No pudimos crear el capítulo.");
      return;
    }

    // Straight into the editor: a chapter with one empty paragraph is not
    // somewhere to leave somebody.
    router.push(
      `/dashboard/admin/contenido/${bookSlug}/${result.data.chapterOrder}`,
    );
  }

  if (!available) {
    return (
      <p
        className="mt-5 text-[12.5px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Hay capítulos pendientes de sincronizar antes de crear uno nuevo.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="mt-5">
        {disabled && disabledReason && (
          <p
            className="mb-2 text-[12.5px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {disabledReason}
          </p>
        )}
        <button
          type="button"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          onClick={() => setOpen(true)}
          className="rounded-full px-4 py-2 text-[13px] font-semibold"
          style={{
            background: "var(--color-lavender-100)",
            color: "var(--color-lavender-700)",
          }}
        >
          + Crear capítulo
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-5 rounded-xl border p-4"
      style={{
        borderColor: "var(--color-lavender-300)",
        background: "var(--color-lavender-50)",
      }}
    >
      <label
        htmlFor="new-chapter-title"
        className="block text-[12.5px] font-bold"
        style={{ color: "var(--color-warm-800)" }}
      >
        Título del capítulo nuevo
      </label>
      <p
        className="mt-1 text-[12.5px]"
        style={{ color: "var(--color-warm-600)" }}
      >
        Se añade al final del libro y queda en el borrador. Nadie lo ve hasta
        que publiques los cambios del libro.
      </p>
      <input
        id="new-chapter-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        autoFocus
        className="mt-3 w-full rounded-lg border px-3 py-2 text-[14px]"
        style={{
          borderColor: "var(--color-warm-300)",
          background: "var(--color-warm-50)",
          color: "var(--color-warm-900)",
        }}
      />

      {error !== null && (
        <p
          className="mt-3 text-[12.5px] font-semibold"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={trimmed.length === 0 || busy}
          className="rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
          style={{
            background: "var(--color-lavender-600)",
            color: "var(--color-warm-50)",
          }}
        >
          {busy ? "Creando…" : "Crear y editar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle("");
            setError(null);
          }}
          className="text-[13px] font-semibold"
          style={{ color: "var(--color-warm-600)" }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
