"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBookAction } from "./actions";

export function NewBookButton() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = title.trim();
    if (trimmed.length < 2) {
      setError("El título debe tener al menos 2 caracteres.");
      return;
    }
    startTransition(() => {
      createBookAction(trimmed)
        .then(({ bookId }) => {
          setOpen(false);
          setTitle("");
          router.push(`/autor/libros/${bookId}`);
        })
        .catch((e: Error) =>
          setError(e.message || "No pudimos crear el libro."),
        );
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full px-4 py-2 text-[13px] font-semibold transition"
        style={{
          background: "var(--color-lavender-500)",
          color: "white",
        }}
      >
        + Nuevo libro
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-center gap-2 rounded-full border-[1.5px] bg-white p-1.5 pl-3"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <input
        autoFocus
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 120))}
        placeholder="Título del libro"
        maxLength={120}
        className="min-w-[200px] flex-1 bg-transparent text-[13px] outline-none"
        style={{ color: "var(--color-warm-900)" }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setOpen(false);
          setTitle("");
          setError(null);
        }}
        className="rounded-full px-3 py-1.5 text-[12px] font-medium"
        style={{
          background: "var(--color-warm-100)",
          color: "var(--color-warm-700)",
        }}
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        style={{
          background: "var(--color-lavender-500)",
          color: "white",
        }}
      >
        {pending ? "Creando…" : "Crear"}
      </button>
      {error ? (
        <p
          className="basis-full px-2 text-[11.5px]"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
