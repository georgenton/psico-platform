"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { reorderChaptersAction } from "../actions";
import type { ChapterRow } from "../contracts";
import { CreateChapterPanel } from "./CreateChapterPanel";
import { PublishBookPanel } from "./PublishBookPanel";

/**
 * The book's structure, and the one place that knows it may be UNSAVED.
 *
 * Publishing, creating a chapter and opening one all address the revision this
 * page was rendered from. The moment a local rearrangement exists, that
 * revision no longer describes what the editor is looking at — so the three of
 * them are interlocked here rather than each discovering the problem on its
 * own. It is the smallest thing that can hold that state coherently; a store or
 * a context would be a framework for one screen.
 *
 * ── Position is a locator, never an identity ──────────────────────────────
 *
 * Every row remembers the order it had IN THE SERVER REVISION, and that number
 * never changes while the editor rearranges. What moves is where the row sits
 * in the list; what gets sent is the sequence of those remembered numbers.
 *
 * The distinction is the whole contract. A book whose manifest is `1, 3, 4` —
 * an ordinary state, since discarding a chapter leaves its slot alone — moved
 * to C, A, B must send `[4, 1, 3]`. Sending the slots themselves (`[1, 3, 4]`)
 * would be a no-op, and densifying them (`[1, 2, 3]`) would ask the server to
 * renumber a book nobody asked to renumber.
 */

interface LocalRow {
  /** Browser-only. Never sent, and never derived from anything addressable. */
  clientKey: string;
  /** The row's order IN THE SERVER REVISION. Frozen for this hydration. */
  sourceOrder: number;
  chapter: ChapterRow;
}

interface PartTuple {
  partNumber: number | null;
  partTitle: string | null;
}

export interface BookStructurePanelProps {
  bookSlug: string;
  chapters: ChapterRow[];
  /** The revision this page was rendered from — the concurrency token. */
  editingRevisionId: string;
  draftRevisionId: string | null;
  draftRevisionNumber: number | null;
  changedUnitCount: number;
  changedTitles: string[];
  structureChanged: boolean;
  chapterCreationAvailable: boolean;
  /** The SERVER's answer. Never re-derived from the rows below. */
  reorderAvailable: boolean;
  reorderBlockedReason: string | null;
}

const BLOCKED_COPY: Record<string, string> = {
  NATIVE_ENTITLEMENT_REQUIRED:
    "Este libro todavía usa el modelo de acceso heredado. Debe migrar su acceso antes de poder reordenarse.",
  PENDING_SYNC:
    "Hay capítulos pendientes de sincronizar antes de poder reordenar.",
};

/**
 * A refusal the editor can act on, per machine-readable code.
 *
 * Fixed copy, never the server's own message: an API error string can name a
 * revision, a column or an internal rule, and none of that belongs on an
 * editorial screen. An unrecognised failure gets the generic line rather than
 * a guess about what went wrong.
 */
const FAILURE_COPY: Record<string, string> = {
  CONTENT_REORDER_REQUIRES_NATIVE_ENTITLEMENT:
    BLOCKED_COPY.NATIVE_ENTITLEMENT_REQUIRED!,
  CONTENT_STRUCTURE_REQUIRES_SYNC: BLOCKED_COPY.PENDING_SYNC!,
  CONTENT_REORDER_ACROSS_PARTS_UNSUPPORTED:
    "Los movimientos entre partes todavía no están disponibles.",
  // A correct client cannot produce these: they mean the page is describing a
  // revision that no longer exists. Reloading is the only sane answer, and
  // resubmitting would just repeat the same wrong description.
  CONTENT_REORDER_DUPLICATE_ORDER:
    "El orden enviado ya no corresponde a este libro. Recarga la página antes de reordenar.",
  CONTENT_REORDER_UNKNOWN_ORDER:
    "El orden enviado ya no corresponde a este libro. Recarga la página antes de reordenar.",
  CONTENT_REORDER_INCOMPLETE:
    "El orden enviado ya no corresponde a este libro. Recarga la página antes de reordenar.",
  CONTENT_REORDER_EMPTY:
    "El orden enviado ya no corresponde a este libro. Recarga la página antes de reordenar.",
};

const GENERIC_FAILURE =
  "No pudimos guardar el nuevo orden. Inténtalo de nuevo o recarga la página.";

const partOf = (c: PartTuple): PartTuple => ({
  partNumber: c.partNumber,
  partTitle: c.partTitle,
});

/** `null`/`null` is a real tuple — it is what "this book has no parts" is. */
const samePart = (a: PartTuple, b: PartTuple) =>
  a.partNumber === b.partNumber && a.partTitle === b.partTitle;

function buildRows(chapters: ChapterRow[], revisionId: string): LocalRow[] {
  return chapters.map((chapter, index) => ({
    // Includes the hydration token and the initial index so a book whose rows
    // legitimately collide on `order` — a structural conflict, which the server
    // reports as not reorderable — still gets distinct React keys.
    clientKey: `${revisionId}:${index}:${chapter.order}`,
    sourceOrder: chapter.order,
    chapter,
  }));
}

export function BookStructurePanel(props: BookStructurePanelProps) {
  const router = useRouter();
  const {
    bookSlug,
    chapters,
    editingRevisionId,
    reorderAvailable,
    reorderBlockedReason,
  } = props;

  const [rows, setRows] = useState<LocalRow[]>(() =>
    buildRows(chapters, editingRevisionId),
  );
  const [reorderMode, setReorderMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Read through a ref so the reset below depends on the revision token ALONE.
  // Server props arrive as a fresh array every render, and keying on it would
  // throw away an editor's arrangement on any unrelated re-render.
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;

  // A successful reorder mints a new revision, so the token changes and every
  // local `sourceOrder` from the old one is stale by definition. Re-hydrating
  // here is what stops that staleness from surviving the refresh.
  useEffect(() => {
    setRows(buildRows(chaptersRef.current, editingRevisionId));
    setReorderMode(false);
    setConflict(false);
    setFailure(null);
  }, [editingRevisionId]);

  const initialOrder = useRef<number[]>(chapters.map((c) => c.order));
  useEffect(() => {
    initialOrder.current = chaptersRef.current.map((c) => c.order);
  }, [editingRevisionId]);

  /**
   * The slots, and what each one's part was.
   *
   * The slot SET is the server's and does not change: reorder permutes
   * occupants between existing positions. Slot k's part tuple is the tuple of
   * whoever originally sat there, which is what a move has to match.
   */
  const slotOrders = [...initialOrder.current].sort((a, b) => a - b);
  const originalAt = new Map(
    chaptersRef.current.map((c) => [c.order, partOf(c)]),
  );
  const slotPart = (index: number): PartTuple =>
    originalAt.get(slotOrders[index]!) ?? { partNumber: null, partTitle: null };

  const dirty =
    rows.map((r) => r.sourceOrder).join(",") !== initialOrder.current.join(",");

  /** Both occupants must belong where they are going. */
  function canSwap(i: number, j: number): boolean {
    if (i < 0 || j < 0 || i >= rows.length || j >= rows.length) return false;
    return (
      samePart(partOf(rows[i]!.chapter), slotPart(j)) &&
      samePart(partOf(rows[j]!.chapter), slotPart(i))
    );
  }

  function swap(i: number, j: number) {
    if (!canSwap(i, j) || saving) return;
    setRows((current) => {
      const next = [...current];
      const a = next[i]!;
      next[i] = next[j]!;
      next[j] = a;
      return next;
    });
    setSaved(false);
    setFailure(null);
  }

  function cancel() {
    // Writes nothing. Restores exactly what the server said.
    setRows(buildRows(chaptersRef.current, editingRevisionId));
    setReorderMode(false);
    setFailure(null);
    setConflict(false);
  }

  async function save() {
    if (!dirty || saving || !reorderAvailable) return;
    setSaving(true);
    setFailure(null);
    setConflict(false);

    const result = await reorderChaptersAction(bookSlug, {
      expectedRevisionId: editingRevisionId,
      orderedChapterOrders: rows.map((r) => r.sourceOrder),
    });
    setSaving(false);

    if (result.ok) {
      setSaved(true);
      // Out of reorder mode immediately. Every local `sourceOrder` describes
      // the revision that was just superseded, so staying in a mode that lets
      // the editor keep moving rows would be inviting a save against a token
      // the server has already moved past.
      setReorderMode(false);
      // No fabricated next state: the server just minted a revision, and the
      // refresh is what tells us what it says.
      router.refresh();
      return;
    }
    if (result.conflict) {
      // The local arrangement stays on screen. Replacing it silently would
      // discard work the editor can still see, and retrying would overwrite a
      // draft this page never read.
      setConflict(true);
      return;
    }
    setFailure((result.code && FAILURE_COPY[result.code]) || GENERIC_FAILURE);
  }

  const blockedCopy = reorderAvailable
    ? null
    : ((reorderBlockedReason && BLOCKED_COPY[reorderBlockedReason]) ??
      "Este libro no puede reordenarse ahora mismo.");

  const interlockReason = reorderMode
    ? "Guarda o cancela el reordenamiento antes de continuar."
    : undefined;

  return (
    <>
      {props.draftRevisionId !== null && props.draftRevisionNumber !== null && (
        <PublishBookPanel
          bookSlug={bookSlug}
          draftRevisionId={props.draftRevisionId}
          draftRevisionNumber={props.draftRevisionNumber}
          changedCount={props.changedUnitCount}
          changedTitles={props.changedTitles}
          structureChanged={props.structureChanged}
          disabled={reorderMode}
          disabledReason={interlockReason}
        />
      )}

      <CreateChapterPanel
        bookSlug={bookSlug}
        editingRevisionId={editingRevisionId}
        available={props.chapterCreationAvailable}
        disabled={reorderMode}
        disabledReason={interlockReason}
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2
          className="text-[14px] font-bold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Capítulos
        </h2>
        {/* A one-chapter book has nothing to permute. Hiding the control is a
            usability call, not a safety one — the server still decides. */}
        {!reorderMode && rows.length >= 2 && (
          <button
            type="button"
            onClick={() => {
              // Local only: no request, no revision, nothing minted.
              setReorderMode(true);
              setSaved(false);
            }}
            disabled={!reorderAvailable}
            title={blockedCopy ?? undefined}
            className="rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
            style={{
              background: "var(--color-lavender-100)",
              color: "var(--color-lavender-700)",
            }}
          >
            Reordenar capítulos
          </button>
        )}
      </div>

      {!reorderMode && blockedCopy && rows.length >= 2 && (
        <p
          className="mt-2 text-[12.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          {blockedCopy}
        </p>
      )}

      {reorderMode && (
        <div
          className="mt-3 rounded-2xl border px-5 py-4"
          style={{
            borderColor: "var(--color-lavender-300)",
            background: "var(--color-lavender-50)",
          }}
        >
          <p
            className="text-[13.5px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            El nuevo orden se guardará en el borrador. Nadie lo verá hasta que
            publiques los cambios del libro.
          </p>
          <p className="mt-2 text-[13px]" role="status">
            {dirty ? "Hay un nuevo orden sin guardar." : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving || !reorderAvailable}
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--color-lavender-600)" }}
            >
              {saving ? "Guardando…" : "Guardar orden"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="rounded-full px-4 py-2 text-[13px] font-semibold"
              style={{ color: "var(--color-warm-600)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {conflict && (
        <div
          role="alert"
          className="mt-3 rounded-2xl border px-5 py-4"
          style={{
            borderColor: "var(--color-amber-300, #fcd34d)",
            background: "var(--color-amber-50, #fffbeb)",
          }}
        >
          <p className="text-[13.5px] font-semibold text-amber-900">
            El borrador cambió en otra pestaña. Recarga antes de guardar este
            orden.
          </p>
          <p className="mt-1 text-[13px] text-amber-900">
            Recargar descarta el orden que armaste aquí.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-3 rounded-full bg-amber-200 px-4 py-2 text-[13px] font-semibold text-amber-900"
          >
            Recargar
          </button>
        </div>
      )}

      {failure && (
        <p role="alert" className="mt-3 text-[13px] text-red-700">
          {failure}
        </p>
      )}

      {saved && !reorderMode && (
        <p
          role="status"
          className="mt-3 text-[13px] font-semibold"
          style={{ color: "var(--color-sage-700)" }}
        >
          Orden guardado en el borrador. Aún no está publicado.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {rows.map((row, index) => {
          const c = row.chapter;
          const displayOrder = slotOrders[index] ?? row.sourceOrder;
          const prevPart = index === 0 ? null : slotPart(index - 1);
          const showPartHeading =
            c.partNumber !== null &&
            (prevPart === null || !samePart(slotPart(index), prevPart));

          return (
            <li key={row.clientKey}>
              {showPartHeading && (
                <p
                  className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-[0.6px]"
                  style={{ color: "var(--color-lavender-700)" }}
                >
                  Parte {c.partNumber}
                  {c.partTitle ? ` · ${c.partTitle}` : ""}
                </p>
              )}
              <div
                className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
                style={{
                  borderColor: c.changed
                    ? "var(--color-lavender-300)"
                    : "var(--color-warm-200)",
                  background: c.changed
                    ? "var(--color-lavender-50)"
                    : "var(--color-warm-50)",
                }}
              >
                <div className="min-w-0">
                  <p
                    className="text-[11px] font-bold uppercase tracking-[0.6px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    Cap. {displayOrder}
                    {c.isNewDraftChapter && " · nuevo"}
                  </p>
                  <p
                    className="truncate text-[14.5px] font-semibold"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {c.title}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {c.isNewDraftChapter ? (
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{
                        background: "var(--color-sage-100)",
                        color: "var(--color-sage-700)",
                      }}
                    >
                      Sin publicar
                    </span>
                  ) : (
                    c.changed && (
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{
                          background: "var(--color-lavender-200)",
                          color: "var(--color-lavender-800)",
                        }}
                      >
                        Con cambios
                      </span>
                    )
                  )}

                  {reorderMode ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => swap(index, index - 1)}
                        disabled={saving || !canSwap(index, index - 1)}
                        aria-label={`Mover «${c.title}» arriba`}
                        title={
                          index > 0 && !canSwap(index, index - 1)
                            ? "Los movimientos entre partes todavía no están disponibles."
                            : "Mover arriba"
                        }
                        className="rounded-full px-3 py-2 text-[13px] font-semibold disabled:opacity-40"
                        style={{
                          background: "var(--color-warm-100)",
                          color: "var(--color-warm-700)",
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => swap(index, index + 1)}
                        disabled={saving || !canSwap(index, index + 1)}
                        aria-label={`Mover «${c.title}» abajo`}
                        title={
                          index < rows.length - 1 && !canSwap(index, index + 1)
                            ? "Los movimientos entre partes todavía no están disponibles."
                            : "Mover abajo"
                        }
                        className="rounded-full px-3 py-2 text-[13px] font-semibold disabled:opacity-40"
                        style={{
                          background: "var(--color-warm-100)",
                          color: "var(--color-warm-700)",
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  ) : c.editable ? (
                    <Link
                      href={`/dashboard/admin/contenido/${bookSlug}/${c.order}`}
                      className="rounded-full px-4 py-2 text-[13px] font-semibold"
                      style={{
                        background: "var(--color-lavender-100)",
                        color: "var(--color-lavender-700)",
                      }}
                    >
                      Editar capítulo
                    </Link>
                  ) : (
                    /* Listed because readers can open it, but there is nothing
                       here to edit yet — so no link that would only 404. */
                    <span
                      className="rounded-full px-4 py-2 text-[13px] font-semibold"
                      style={{
                        background: "var(--color-warm-100)",
                        color: "var(--color-warm-600)",
                      }}
                    >
                      Pendiente de sincronización
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
