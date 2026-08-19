"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminExperienceRow } from "@psico/types";

import { archiveDraftAction, createNextDraftAction } from "../../actions";

/**
 * CMS V1 (#637) — what an editor may do with one row.
 *
 * A published version has exactly one write action, and it is not "edit":
 * published definitions are immutable, so changing one means creating the next
 * version. Saying that with the button label is cheaper than explaining a 409
 * afterwards.
 */
export function ExperienceRowActions({
  row,
  bookSlug,
  chapterOrder,
  contentUnitId,
}: {
  row: AdminExperienceRow;
  bookSlug: string;
  chapterOrder: number;
  /** The chapter this list was rendered against. See `createDraftAction`. */
  contentUnitId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editHref =
    row.id === null
      ? null
      : `/dashboard/admin/experiencias/${bookSlug}/${chapterOrder}/borrador/${row.id}`;

  /**
   * C.4 — archive, behind an explicit confirmation.
   *
   * Terminal and not restorable, so a single click is the wrong shape for it.
   * The confirmation is inline rather than a browser dialog: the reader of a
   * screen reader gets it in the flow, and it can say what actually happens —
   * the row stays, the version number is spent, the guide comes back.
   */
  async function archive() {
    // Guarded in the HANDLER, not only by `disabled`. A double click, a
    // replayed event or a stale render must not send the request twice.
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await archiveDraftAction(bookSlug, chapterOrder, row.id!);
      setConfirmingArchive(false);
      router.refresh();
    } catch {
      setError("No pudimos archivar este borrador.");
    } finally {
      setBusy(false);
    }
  }

  async function createNextVersion() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createNextDraftAction(
        bookSlug,
        chapterOrder,
        row.experienceKey,
        row.experienceVersion,
        contentUnitId,
      );
      router.push(
        `/dashboard/admin/experiencias/${bookSlug}/${chapterOrder}/borrador/${created.id}`,
      );
    } catch {
      setError("No pudimos crear la versión nueva.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-3">
      {row.status === "DRAFT" && editHref ? (
        <a
          href={editHref}
          className="text-[13px] font-semibold"
          style={{ color: "var(--color-lavender-600)" }}
          data-testid={`edit-${row.experienceKey}`}
        >
          Editar
        </a>
      ) : null}

      {row.status === "DRAFT" && row.id ? (
        confirmingArchive ? (
          <span className="flex flex-wrap items-center gap-2">
            <span
              className="text-[12.5px]"
              style={{ color: "var(--color-warm-700)" }}
            >
              Se archiva para siempre: la fila queda como historial, su número
              de versión no se reutiliza y la guía queda libre.
            </span>
            <button
              type="button"
              onClick={() => void archive()}
              disabled={busy}
              className="text-[13px] font-semibold disabled:opacity-60"
              style={{ color: "#B91C1C", minHeight: 44 }}
              data-testid={`archive-confirm-${row.experienceKey}`}
            >
              {busy ? "Archivando…" : "Sí, archivar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingArchive(false)}
              disabled={busy}
              className="text-[13px] disabled:opacity-60"
              style={{ color: "var(--color-warm-600)", minHeight: 44 }}
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingArchive(true)}
            disabled={busy}
            className="text-[13px] font-semibold disabled:opacity-60"
            style={{ color: "var(--color-warm-600)", minHeight: 44 }}
            data-testid={`archive-${row.experienceKey}`}
          >
            Archivar
          </button>
        )
      ) : null}

      {/* ARCHIVED is history: readable, and offering nothing. No edit, no
          publish, no restore, and emphatically no delete. */}
      {row.status === "ARCHIVED" ? (
        <span
          className="text-[12.5px]"
          style={{ color: "var(--color-warm-500)" }}
          data-testid={`archived-${row.experienceKey}`}
        >
          Archivada · se conserva como historial
        </span>
      ) : null}

      {row.status === "PUBLISHED" ? (
        <button
          type="button"
          onClick={() => void createNextVersion()}
          disabled={busy}
          className="text-[13px] font-semibold disabled:opacity-60"
          style={{ color: "var(--color-lavender-600)", minHeight: 44 }}
          data-testid={`next-version-${row.experienceKey}`}
        >
          {busy ? "Creando…" : "Crear versión nueva"}
        </button>
      ) : null}

      {error ? (
        <span className="text-[12.5px]" style={{ color: "#B91C1C" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
