"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

import { loginAction } from "@/actions/auth";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? undefined;

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await loginAction({
        email: data.get("email") as string,
        password: data.get("password") as string,
        from,
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      <h1
        className="text-2xl font-bold mb-1"
        style={{ color: "var(--color-warm-800)" }}
      >
        Bienvenido de nuevo
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
        Ingresa tus datos para continuar
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
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--color-lavender-400)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--color-warm-200)")
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="password"
            className="text-sm font-medium"
            style={{ color: "var(--color-warm-700)" }}
          >
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            placeholder="••••••••"
            className="rounded-xl px-4 py-2.5 text-sm outline-none transition-all disabled:opacity-60"
            style={{
              background: "var(--color-warm-100)",
              border: "1.5px solid var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--color-lavender-400)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--color-warm-200)")
            }
          />
        </div>

        {error && (
          <p
            className="text-sm rounded-xl px-4 py-3"
            style={{
              background: "#FEF2F2",
              color: "#B91C1C",
              border: "1px solid #FECACA",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-60"
          style={{
            background: isPending
              ? "var(--color-lavender-400)"
              : "var(--color-lavender-500)",
          }}
        >
          {isPending ? "Iniciando sesión…" : "Iniciar sesión"}
        </button>
      </form>

      <Divider />
      <GoogleSignInButton text="signin_with" from={from} />

      <p
        className="mt-6 text-center text-sm"
        style={{ color: "var(--color-warm-500)" }}
      >
        ¿No tienes cuenta?{" "}
        <Link
          href="/register"
          className="font-medium"
          style={{ color: "var(--color-lavender-600)" }}
        >
          Regístrate gratis
        </Link>
      </p>
    </>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <div
        className="h-px flex-1"
        style={{ background: "var(--color-warm-200)" }}
      />
      <span className="text-[11px]" style={{ color: "var(--color-warm-500)" }}>
        o
      </span>
      <div
        className="h-px flex-1"
        style={{ background: "var(--color-warm-200)" }}
      />
    </div>
  );
}
