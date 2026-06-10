"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { encryptString } from "@psico/crypto";
import { useDiaryKey } from "@/lib/crypto/diary-key-context";
import { submitFeedbackAction } from "@/actions/terapia";

const TAGS = [
  "empático",
  "puntual",
  "claro",
  "me-ayudó",
  "incómodo",
  "no-conectamos",
];

export function FeedbackModal({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { key } = useDiaryKey();
  const [rating, setRating] = useState<number>(0);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleTag(t: string) {
    setTags((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    );
  }

  function handleSubmit() {
    if (rating === 0) {
      setError("Elegí un rating (1 a 5).");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const trimmed = note.trim();
        const body: Parameters<typeof submitFeedbackAction>[1] = {
          rating,
          tags,
        };
        if (trimmed && key) {
          const env = encryptString(trimmed, key);
          body.noteCiphertext = env.ciphertext;
          body.noteNonce = env.nonce;
        }
        await submitFeedbackAction(sessionId, body);
        router.refresh();
        onClose();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No pudimos guardar tu feedback.",
        );
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <h2
          className="text-[18px] font-semibold"
          style={{ color: "var(--color-warm-900)" }}
        >
          ¿Cómo te fue?
        </h2>
        <p
          className="mt-1 text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Tu nota se cifra antes de salir del navegador. Solo vos podés leerla.
        </p>

        <div className="mt-4 flex justify-between">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className="text-[28px]"
              style={{
                color:
                  rating >= n
                    ? "var(--color-lavender-600)"
                    : "var(--color-warm-300)",
              }}
              aria-label={`Rating ${n}`}
            >
              ★
            </button>
          ))}
        </div>

        <p
          className="mt-4 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-warm-500)" }}
        >
          Tags
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className="rounded-full px-3 py-1 text-[12px] font-medium"
              style={{
                background: tags.includes(t)
                  ? "var(--color-lavender-100)"
                  : "var(--color-warm-50)",
                color: tags.includes(t)
                  ? "var(--color-lavender-700)"
                  : "var(--color-warm-700)",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <p
          className="mt-4 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-warm-500)" }}
        >
          Nota (opcional, E2E)
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Algo que querés recordar de esta sesión…"
          className="mt-1 w-full rounded-xl border-[1.5px] bg-white p-2 text-[12px] focus:outline-none"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-900)",
          }}
        />
        {note && !key ? (
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Desbloqueá tu Diario para cifrar la nota.
          </p>
        ) : null}

        {error ? (
          <p
            className="mt-3 rounded-xl px-3 py-2 text-[12px]"
            style={{
              background: "var(--color-rose-50)",
              color: "var(--color-rose-700)",
            }}
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-[13px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-xl px-4 py-2 text-[13px] font-medium text-white"
            style={{ background: "var(--color-sage-600)" }}
          >
            {pending ? "Guardando…" : "Cerrar sesión"}
          </button>
        </div>
      </div>
    </div>
  );
}
