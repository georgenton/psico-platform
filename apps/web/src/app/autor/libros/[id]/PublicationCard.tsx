"use client";

import { useState, useTransition } from "react";
import type { AuthorPublicationState } from "@psico/types";
import { submitForReviewAction, unpublishAction } from "./actions";

export function PublicationCard({
  bookId,
  publication,
}: {
  bookId: string;
  publication: AuthorPublicationState | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  if (!publication) {
    return (
      <div
        className="rounded-2xl border-[1.5px] bg-white p-5 text-[13px]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-500)",
        }}
      >
        No pudimos cargar el estado de publicación.
      </div>
    );
  }

  const allDone = publication.steps.every((s) => !s.blocker || s.done);

  function onSubmit() {
    setError(null);
    setFlash(null);
    startTransition(() => {
      submitForReviewAction(bookId)
        .then(() => setFlash("Enviado a revisión"))
        .catch((e: Error) => setError(e.message || "No se pudo enviar."));
    });
  }

  function onUnpublish() {
    setError(null);
    setFlash(null);
    startTransition(() => {
      unpublishAction(bookId)
        .then(() => setFlash("Libro despublicado"))
        .catch((e: Error) => setError(e.message || "No se pudo despublicar."));
    });
  }

  return (
    <aside
      className="sticky top-20 space-y-4 rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <h2
        className="text-[15px] font-bold tracking-tight"
        style={{ color: "var(--color-warm-900)" }}
      >
        Publicación
      </h2>

      <ul className="space-y-2">
        {publication.steps.map((s) => (
          <li
            key={s.id}
            className="flex items-start gap-2 text-[12.5px]"
            style={{ color: "var(--color-warm-800)" }}
          >
            <span
              className="mt-[2px] inline-block h-4 w-4 flex-none rounded-full text-center text-[10px] font-bold leading-4"
              style={{
                background: s.done
                  ? "var(--color-sage-600)"
                  : "var(--color-warm-100)",
                color: s.done ? "white" : "var(--color-warm-500)",
              }}
            >
              {s.done ? "✓" : ""}
            </span>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>

      {publication.feedback ? (
        <div
          className="rounded-xl border-[1.5px] p-3 text-[12px]"
          style={{
            borderColor: "var(--color-rose-200)",
            background: "var(--color-rose-50)",
            color: "var(--color-rose-700)",
          }}
        >
          <p className="font-bold">Feedback del editor</p>
          <p className="mt-1 whitespace-pre-wrap">{publication.feedback}</p>
        </div>
      ) : null}

      {error ? (
        <p
          className="text-[11.5px]"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
        </p>
      ) : null}
      {flash ? (
        <p
          className="text-[11.5px] font-medium"
          style={{ color: "var(--color-sage-700)" }}
        >
          ✓ {flash}
        </p>
      ) : null}

      {publication.status === "DRAFT" || publication.reviewState === "REJECTED" ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || !allDone}
          className="w-full rounded-full px-4 py-2 text-[13px] font-semibold transition disabled:opacity-50"
          style={{
            background: "var(--color-lavender-500)",
            color: "white",
          }}
          title={!allDone ? "Completa los blockers antes de enviar." : undefined}
        >
          {pending ? "Enviando…" : "Enviar a revisión"}
        </button>
      ) : null}

      {publication.status === "IN_REVIEW" ? (
        <p
          className="rounded-xl px-3 py-2 text-[12.5px]"
          style={{
            background: "var(--color-lavender-100)",
            color: "var(--color-lavender-700)",
          }}
        >
          En revisión. Te avisaremos cuando el editor decida.
        </p>
      ) : null}

      {publication.status === "PUBLISHED" ? (
        <button
          type="button"
          onClick={onUnpublish}
          disabled={pending}
          className="w-full rounded-full px-4 py-2 text-[13px] font-semibold transition disabled:opacity-50"
          style={{
            background: "var(--color-warm-100)",
            color: "var(--color-warm-700)",
          }}
        >
          {pending ? "Despublicando…" : "Despublicar (vuelve a borrador)"}
        </button>
      ) : null}
    </aside>
  );
}
