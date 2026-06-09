"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

import { authApi, ApiError } from "@/lib/api";

const MIN_PASSWORD = 10;

export default function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const newPassword = data.get("newPassword") as string;
    const confirm = data.get("confirm") as string;

    if (newPassword.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (newPassword !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        await authApi.resetPassword(token, newPassword);
        setDone(true);
      } catch (err) {
        const msg =
          err instanceof ApiError && err.status === 410
            ? "El enlace expiró o ya fue usado. Solicitá uno nuevo."
            : err instanceof ApiError
              ? "No pudimos restablecer tu contraseña. Reintenta."
              : "Algo salió mal. Reintenta.";
        setError(msg);
      }
    });
  }

  if (!token) {
    return (
      <>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-warm-800)" }}
        >
          Enlace inválido
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
          El enlace que abriste no incluye un token. Solicitá uno nuevo desde la
          pantalla de login.
        </p>
        <Link
          href="/forgot-password"
          className="rounded-xl py-2.5 px-4 text-sm font-medium text-white inline-block"
          style={{ background: "var(--color-lavender-600)" }}
        >
          Pedir un enlace nuevo
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-warm-800)" }}
        >
          Listo ✨
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
          Tu contraseña se actualizó. Iniciá sesión con la nueva.
        </p>
        <Link
          href="/login"
          className="rounded-xl py-2.5 px-4 text-sm font-medium text-white inline-block"
          style={{ background: "var(--color-lavender-600)" }}
        >
          Ir al login
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
        Nueva contraseña
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
        Elegí una contraseña segura. Mínimo {MIN_PASSWORD} caracteres.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="newPassword"
            className="text-sm font-medium"
            style={{ color: "var(--color-warm-700)" }}
          >
            Nueva contraseña
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            disabled={isPending}
            className="rounded-xl px-4 py-2.5 text-sm outline-none transition-all disabled:opacity-60"
            style={{
              background: "var(--color-warm-100)",
              border: "1.5px solid var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="confirm"
            className="text-sm font-medium"
            style={{ color: "var(--color-warm-700)" }}
          >
            Confirmar contraseña
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            disabled={isPending}
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
          {isPending ? "Guardando..." : "Restablecer contraseña"}
        </button>
      </form>
    </>
  );
}
