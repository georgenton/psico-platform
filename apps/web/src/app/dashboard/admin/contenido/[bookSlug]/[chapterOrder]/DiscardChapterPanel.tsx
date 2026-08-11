"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { discardChapterAction } from "../../actions";

/**
 * Taking a never-published chapter back out of the draft.
 *
 * Offered only for a chapter no reader has ever seen — the server refuses the
 * rest, and the button is absent rather than present-and-failing.
 *
 * The copy avoids "eliminar" deliberately, because nothing is deleted: the
 * chapter stops being part of the next publish, and every revision that already
 * referenced it stays exactly as it was.
 */
export function DiscardChapterPanel({
  bookSlug,
  chapterOrder,
  revisionId,
}: {
  bookSlug: string;
  chapterOrder: number;
  revisionId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function discard() {
    setBusy(true);
    setError(null);
    const result = await discardChapterAction(
      bookSlug,
      chapterOrder,
      revisionId,
    );
    setBusy(false);

    if (result.conflict) {
      setError(
        "El borrador cambió mientras mirabas esta pantalla. Recarga antes de descartar.",
      );
      return;
    }
    if (!result.ok) {
      setError(result.error ?? "No pudimos descartar el capítulo.");
      return;
    }
    router.push(`/dashboard/admin/contenido/${bookSlug}`);
  }

  return (
    <section
      className="mt-6 rounded-2xl border px-5 py-4"
      style={{
        borderColor: "var(--color-warm-200)",
        background: "var(--color-warm-50)",
      }}
    >
      <h2
        className="text-[13.5px] font-bold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Capítulo sin publicar
      </h2>
      <p
        className="mt-1 text-[12.5px]"
        style={{ color: "var(--color-warm-600)" }}
      >
        Nadie lo ha leído todavía. Puedes sacarlo del borrador: el resto de tus
        cambios en el libro se conservan.
      </p>

      {error !== null && (
        <p
          role="alert"
          className="mt-3 text-[12.5px] font-semibold"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
        </p>
      )}

      {confirming ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={discard}
            disabled={busy}
            className="rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
            style={{
              background: "var(--color-rose-600)",
              color: "var(--color-warm-50)",
            }}
          >
            {busy ? "Descartando…" : "Sí, sacarlo del borrador"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-warm-600)" }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-full px-4 py-2 text-[13px] font-semibold"
          style={{
            background: "var(--color-warm-100)",
            color: "var(--color-warm-700)",
          }}
        >
          Descartar capítulo
        </button>
      )}
    </section>
  );
}
