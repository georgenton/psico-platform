"use client";

import { useState, useTransition } from "react";
import type { AuthorBookDetail } from "@psico/types";
import { updateBookAction } from "./actions";

const COVER_TOKENS = ["warm", "cool", "mixed"] as const;

export function BookMetaForm({
  book,
  disabled,
}: {
  book: AuthorBookDetail;
  disabled: boolean;
}) {
  const [title, setTitle] = useState(book.title);
  const [subtitle, setSubtitle] = useState(book.subtitle ?? "");
  const [summary, setSummary] = useState(book.summary ?? "");
  const [cover, setCover] = useState(book.cover);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setError(null);
    setFlash(null);
    startTransition(() => {
      updateBookAction(book.id, {
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        summary: summary.trim() || undefined,
        cover,
      })
        .then(() => {
          setFlash("Guardado");
          setTimeout(() => setFlash(null), 2500);
        })
        .catch((e: Error) =>
          setError(e.message || "No pudimos guardar los cambios."),
        );
    });
  }

  return (
    <form
      onSubmit={onSave}
      className="space-y-4 rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <header className="flex items-center justify-between">
        <h2
          className="text-[15px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Información del libro
        </h2>
        {flash ? (
          <span
            className="text-[11.5px] font-medium"
            style={{ color: "var(--color-sage-700)" }}
          >
            ✓ {flash}
          </span>
        ) : null}
      </header>

      {disabled ? (
        <p
          className="rounded-xl px-3 py-2 text-[12px]"
          style={{
            background: "var(--color-warm-100)",
            color: "var(--color-warm-700)",
          }}
        >
          El libro está {book.status === "IN_REVIEW" ? "en revisión" : "archivado"}.
          La metadata no puede editarse.
        </p>
      ) : null}

      <Field label="Título">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 120))}
          disabled={disabled || pending}
          maxLength={120}
          className="w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13.5px] outline-none focus:border-[var(--color-lavender-500)]"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </Field>

      <Field label="Subtítulo (opcional)">
        <input
          type="text"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value.slice(0, 200))}
          disabled={disabled || pending}
          maxLength={200}
          className="w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13.5px] outline-none focus:border-[var(--color-lavender-500)]"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </Field>

      <Field label={`Resumen (${summary.length}/2000) · mínimo 50 para publicar`}>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value.slice(0, 2000))}
          disabled={disabled || pending}
          rows={5}
          maxLength={2000}
          className="w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13.5px] outline-none focus:border-[var(--color-lavender-500)]"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </Field>

      <Field label="Portada (gradient token)">
        <div className="flex gap-2">
          {COVER_TOKENS.map((t) => (
            <button
              key={t}
              type="button"
              disabled={disabled || pending}
              onClick={() => setCover(t)}
              className="flex-1 rounded-xl border-[1.5px] py-3 text-[12.5px] font-semibold capitalize transition disabled:opacity-50"
              style={{
                borderColor:
                  cover === t
                    ? "var(--color-lavender-500)"
                    : "var(--color-warm-200)",
                background:
                  t === "warm"
                    ? "linear-gradient(135deg, #fff7ed, #fed7aa)"
                    : t === "cool"
                      ? "linear-gradient(135deg, #ede9fe, #c7d2fe)"
                      : "linear-gradient(135deg, #fce7f3, #c7d2fe)",
                color: "var(--color-warm-900)",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      {error ? (
        <p
          className="text-[11.5px]"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={disabled || pending}
          className="rounded-full px-4 py-2 text-[12.5px] font-semibold transition disabled:opacity-50"
          style={{
            background: "var(--color-lavender-500)",
            color: "white",
          }}
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-[12px] font-medium"
        style={{ color: "var(--color-warm-700)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
