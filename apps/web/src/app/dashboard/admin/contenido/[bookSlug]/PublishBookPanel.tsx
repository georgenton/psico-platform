"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { publishBookAction } from "../actions";

interface Props {
  bookSlug: string;
  draftRevisionId: string;
  draftRevisionNumber: number;
  changedCount: number;
  changedTitles: string[];
}

/**
 * Publishing the book's draft.
 *
 * A confirmation, not an approval workflow: it says which revision and which
 * chapters, and that is the whole of it. Anything more would be process this
 * team does not have yet.
 *
 * The draft id travels with the request, so publishing what you were looking at
 * is enforced by the server rather than hoped for. If it moved, the answer is
 * reload — never retry, which is how you publish somebody else's work in your
 * name.
 */
export function PublishBookPanel({
  bookSlug,
  draftRevisionId,
  draftRevisionNumber,
  changedCount,
  changedTitles,
}: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setPending(true);
    setError(null);
    const result = await publishBookAction(bookSlug, draftRevisionId);
    setPending(false);
    if (result.ok) {
      setConfirming(false);
      router.refresh();
      return;
    }
    if (result.conflict) setConflict(true);
    else setError(result.error ?? "No pudimos publicar.");
  }

  if (conflict) {
    return (
      <div
        role="alert"
        className="rounded-2xl border px-5 py-4"
        style={{
          borderColor: "var(--color-amber-300, #fcd34d)",
          background: "var(--color-amber-50, #fffbeb)",
        }}
      >
        <p className="text-[13.5px] font-semibold text-amber-900">
          El borrador cambió. Recarga antes de publicar.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-3 rounded-full bg-amber-200 px-4 py-2 text-[13px] font-semibold text-amber-900"
        >
          Recargar
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border px-5 py-4"
      style={{
        borderColor: "var(--color-lavender-300)",
        background: "var(--color-lavender-50)",
      }}
    >
      {!confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className="text-[13.5px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            Hay cambios sin publicar en este libro.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-white"
            style={{ background: "var(--color-lavender-600)" }}
          >
            Publicar cambios del libro
          </button>
        </div>
      ) : (
        <div>
          <p
            className="text-[14px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Vas a publicar la revisión r{draftRevisionNumber}.
          </p>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            Capítulos con cambios: {changedCount}.
          </p>
          {changedTitles.length > 0 && (
            <ul
              className="mt-2 list-disc pl-5 text-[13px]"
              style={{ color: "var(--color-warm-700)" }}
            >
              {changedTitles.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="mt-3 text-[13px] text-red-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={publish}
              disabled={pending}
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--color-lavender-600)" }}
            >
              {pending ? "Publicando…" : "Publicar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-full px-4 py-2 text-[13px] font-semibold"
              style={{ color: "var(--color-warm-600)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
