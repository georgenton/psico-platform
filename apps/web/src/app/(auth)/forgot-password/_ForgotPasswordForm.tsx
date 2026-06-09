"use client";

import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";

import { authApi, ApiError } from "@/lib/api";

export default function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = (data.get("email") as string).trim();
    setError(null);

    startTransition(async () => {
      try {
        await authApi.forgotPassword(email);
        // The backend returns 200 even for unknown emails (anti-enumeration);
        // we always show the success state.
        setSubmitted(true);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? "No pudimos procesar tu pedido. Reintenta en unos minutos."
            : "Algo salió mal. Reintenta.";
        setError(msg);
      }
    });
  }

  if (submitted) {
    return (
      <>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-warm-800)" }}
        >
          Revisa tu correo
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
          Si tu email está registrado, te enviamos un enlace para restablecer tu
          contraseña. El enlace vence en 1 hora.
        </p>
        <div
          className="rounded-2xl p-4 mb-6 text-sm"
          style={{
            background: "var(--color-sage-100)",
            color: "var(--color-sage-700)",
            border: "1.5px solid var(--color-sage-200)",
          }}
        >
          ¿No te llegó? Revisá la carpeta de spam o reintenta en unos minutos.
        </div>
        <Link
          href="/login"
          className="text-sm font-medium"
          style={{ color: "var(--color-lavender-700)" }}
        >
          ← Volver al login
        </Link>
      </>
    );
  }

  return (
    <>
      <h1
        className="text-2xl font-bold mb-1"
        style={{ color: "var(--color-warm-800)" }}
      >
        Restablecer contraseña
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
        Ingresá tu email y te mandamos un enlace para crear una nueva.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="email"
            className="text-sm font-medium"
            style={{ color: "var(--color-warm-700)" }}
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isPending}
            placeholder="tu@email.com"
            className="rounded-xl px-4 py-2.5 text-sm outline-none transition-all disabled:opacity-60"
            style={{
              background: "var(--color-warm-100)",
              border: "1.5px solid var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
          />
        </div>

        {error ? (
          <p
            className="text-xs"
            style={{ color: "var(--color-rose-600)" }}
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl py-2.5 text-sm font-medium text-white transition-all disabled:opacity-60"
          style={{ background: "var(--color-lavender-600)" }}
        >
          {isPending ? "Enviando..." : "Enviar enlace"}
        </button>

        <div className="flex justify-center mt-2">
          <Link
            href="/login"
            className="text-sm"
            style={{ color: "var(--color-lavender-700)" }}
          >
            ← Volver al login
          </Link>
        </div>
      </form>
    </>
  );
}
