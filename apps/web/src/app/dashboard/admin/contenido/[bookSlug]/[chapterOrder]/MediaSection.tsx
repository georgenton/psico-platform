"use client";

import { useCallback, useEffect, useState } from "react";

import {
  adoptChapterMediaAction,
  listChapterMediaAction,
  publishMediaDraftAction,
  updateMediaDraftAction,
} from "../../actions";
import { MEDIA_KIND_LABEL, type MediaCard } from "../../contracts";

/**
 * The chapter's three formats.
 *
 * Two different states live on every card and the copy keeps them apart, because
 * confusing them is how an editor publishes something they thought was private:
 *
 *   what a READER sees — «Disponible» or «En producción»
 *   where the definition LIVES — código, borrador, or publicado
 *
 * A CMS draft is invisible to readers even when it holds a fully playable
 * definition, so «Borrador» never implies the audiobook stopped working.
 *
 * No playback here, and no provider fields: the API does not send an object key
 * or a Stream UID, so there is nothing on this screen that could leak one.
 */

interface Props {
  bookSlug: string;
  chapterOrder: number;
}

const AVAILABILITY_LABEL: Record<string, string> = {
  AVAILABLE: "Disponible",
  COMING_SOON: "En producción",
};

const EDITORIAL_LABEL: Record<string, string> = {
  CODE_OWNED: "En código",
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
};

export function MediaSection({ bookSlug, chapterOrder }: Props) {
  const [cards, setCards] = useState<MediaCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await listChapterMediaAction(bookSlug, chapterOrder);
    if (result.ok && result.data) {
      setCards(result.data.media);
      setError(null);
      return;
    }
    setError(result.error ?? "No pudimos cargar la multimedia del capítulo.");
  }, [bookSlug, chapterOrder]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function adopt(card: MediaCard) {
    setBusyKey(card.mediaKey);
    const result = await adoptChapterMediaAction(
      bookSlug,
      chapterOrder,
      card.mediaKey,
    );
    setBusyKey(null);
    if (!result.ok) {
      setError(result.error ?? "No pudimos administrar esta pieza.");
      return;
    }
    await reload();
  }

  async function publish(card: MediaCard) {
    if (!card.draftId) return;
    setBusyKey(card.mediaKey);
    const result = await publishMediaDraftAction(
      card.draftId,
      bookSlug,
      chapterOrder,
    );
    setBusyKey(null);
    if (!result.ok) {
      setError(result.error ?? "No pudimos publicar esta definición.");
      return;
    }
    await reload();
  }

  return (
    <section className="mt-10">
      <h2
        className="text-[11px] font-bold uppercase tracking-[0.6px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Multimedia del capítulo
      </h2>
      <p
        className="mt-1 text-[12.5px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Aquí se administra la ficha editorial. Subir el archivo llegará en la
        siguiente etapa.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-red-700">
          {error}
        </p>
      )}

      {cards === null ? (
        <p
          className="mt-4 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Cargando…
        </p>
      ) : cards.length === 0 ? (
        <p
          className="mt-4 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Este capítulo todavía no tiene formatos multimedia.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {cards.map((card) => (
            <li
              key={card.mediaKey}
              className="rounded-xl border px-4 py-3"
              style={{
                borderColor:
                  card.editorialStatus === "DRAFT"
                    ? "var(--color-lavender-300)"
                    : "var(--color-warm-200)",
                background:
                  card.editorialStatus === "DRAFT"
                    ? "var(--color-lavender-50)"
                    : "var(--color-warm-50)",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="text-[11px] font-bold uppercase tracking-[0.6px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {MEDIA_KIND_LABEL[card.kind] ?? card.kind}
                  </p>
                  <p
                    className="text-[14.5px] font-semibold"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {card.title}
                  </p>
                  <p
                    className="mt-1 text-[12.5px]"
                    style={{ color: "var(--color-warm-600)" }}
                  >
                    {/* Reader-facing state first, editorial state second —
                        they answer different questions. */}
                    {AVAILABILITY_LABEL[card.runtimeAvailability]} ·{" "}
                    {EDITORIAL_LABEL[card.editorialStatus]} · v
                    {card.mediaVersion}
                    {!card.sourceReady && " · sin archivo"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {card.editorialStatus === "CODE_OWNED" && (
                    <button
                      type="button"
                      onClick={() => void adopt(card)}
                      disabled={busyKey === card.mediaKey}
                      className="rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
                      style={{
                        background: "var(--color-lavender-100)",
                        color: "var(--color-lavender-700)",
                      }}
                    >
                      {busyKey === card.mediaKey
                        ? "Adoptando…"
                        : "Administrar en CMS"}
                    </button>
                  )}
                  {card.editorialStatus === "DRAFT" && card.draftId && (
                    <button
                      type="button"
                      onClick={() => void publish(card)}
                      disabled={busyKey === card.mediaKey}
                      className="rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                      style={{ background: "var(--color-lavender-600)" }}
                    >
                      {busyKey === card.mediaKey
                        ? "Publicando…"
                        : "Publicar definición"}
                    </button>
                  )}
                </div>
              </div>

              {card.editorialStatus === "DRAFT" && card.draftId && (
                <MediaDraftEditor
                  card={card}
                  draftId={card.draftId}
                  onSaved={reload}
                />
              )}

              {card.editorialStatus === "PUBLISHED" && (
                <p
                  className="mt-3 text-[12px]"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  Publicado. La creación de una nueva versión estará disponible
                  al administrar un nuevo archivo multimedia.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Editorial copy only: no identity, no source, no access policy. */
function MediaDraftEditor({
  card,
  draftId,
  onSaved,
}: {
  card: MediaCard;
  draftId: string;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [durationSec, setDurationSec] = useState(
    card.durationSec === null ? "" : String(card.durationSec),
  );
  const [marks, setMarks] = useState(card.chapters);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const parsed = durationSec.trim() === "" ? null : Number(durationSec);
    const result = await updateMediaDraftAction(draftId, {
      title,
      description,
      durationSec: Number.isFinite(parsed as number)
        ? (parsed as number)
        : null,
      chapters: marks,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "No pudimos guardar la ficha.");
      return;
    }
    setSaved(true);
    await onSaved();
  }

  return (
    <div
      className="mt-3 space-y-2 border-t pt-3"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <label className="block">
        <span
          className="text-[11.5px] font-semibold"
          style={{ color: "var(--color-warm-600)" }}
        >
          Título
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label={`Título de ${MEDIA_KIND_LABEL[card.kind] ?? card.kind}`}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px]"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </label>

      <label className="block">
        <span
          className="text-[11.5px] font-semibold"
          style={{ color: "var(--color-warm-600)" }}
        >
          Descripción
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label={`Descripción de ${MEDIA_KIND_LABEL[card.kind] ?? card.kind}`}
          rows={3}
          className="mt-1 w-full resize-y rounded-lg border px-3 py-2 text-[13.5px]"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </label>

      <label className="block max-w-[220px]">
        <span
          className="text-[11.5px] font-semibold"
          style={{ color: "var(--color-warm-600)" }}
        >
          Duración (segundos)
        </span>
        <input
          value={durationSec}
          onChange={(e) => setDurationSec(e.target.value)}
          inputMode="numeric"
          aria-label={`Duración de ${MEDIA_KIND_LABEL[card.kind] ?? card.kind}`}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px]"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </label>

      <div>
        <span
          className="text-[11.5px] font-semibold"
          style={{ color: "var(--color-warm-600)" }}
        >
          Marcas de capítulo
        </span>
        {marks.map((m, i) => (
          <div key={i} className="mt-1 flex gap-2">
            <input
              value={String(m.startSec)}
              inputMode="numeric"
              aria-label={`Segundo de la marca ${i + 1}`}
              onChange={(e) =>
                setMarks((prev) =>
                  prev.map((x, j) =>
                    j === i
                      ? { ...x, startSec: Number(e.target.value) || 0 }
                      : x,
                  ),
                )
              }
              className="w-[90px] rounded-lg border px-2 py-1.5 text-[13px]"
              style={{ borderColor: "var(--color-warm-200)" }}
            />
            <input
              value={m.label}
              aria-label={`Título de la marca ${i + 1}`}
              onChange={(e) =>
                setMarks((prev) =>
                  prev.map((x, j) =>
                    j === i ? { ...x, label: e.target.value } : x,
                  ),
                )
              }
              className="flex-1 rounded-lg border px-2 py-1.5 text-[13px]"
              style={{ borderColor: "var(--color-warm-200)" }}
            />
            <button
              type="button"
              aria-label={`Quitar la marca ${i + 1}`}
              onClick={() => setMarks((prev) => prev.filter((_, j) => j !== i))}
              className="px-2 text-[12px]"
              style={{ color: "var(--color-rose-600, #be123c)" }}
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setMarks((prev) => [...prev, { startSec: 0, label: "" }])
          }
          className="mt-2 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
          style={{
            background: "var(--color-warm-100)",
            color: "var(--color-warm-700)",
          }}
        >
          + Marca
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
          style={{
            background: "var(--color-lavender-100)",
            color: "var(--color-lavender-700)",
          }}
        >
          {saving ? "Guardando…" : "Guardar ficha"}
        </button>
        {saved && (
          <span
            role="status"
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-sage-700)" }}
          >
            Ficha guardada
          </span>
        )}
        {error && (
          <span role="alert" className="text-[13px] text-red-700">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
