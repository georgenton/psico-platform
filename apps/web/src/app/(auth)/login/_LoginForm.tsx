"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

import { loginAction } from "@/actions/auth";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { PrivacyInfoButton } from "@/components/privacy/PrivacyInfoButton";

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
      <p
        className="mb-1 text-[11px] font-bold uppercase tracking-[0.6px]"
        // `--color-lavender-500` es un valor crudo de la rampa y se usa además
        // en degradados y trazos, donde nada exige contraste. Como TEXTO sobre
        // la página se queda en 3.48:1. `--fg-link-strong` es el nombre que el
        // sistema ya tiene para un acento legible: 7.70 en Contemporary y 6.73
        // en Renacimiento, que son los dos estados que esta pantalla alcanza.
        style={{ color: "var(--fg-link-strong)" }}
      >
        Tu espacio te espera
      </p>
      <h1
        className="mb-2 text-[26px] font-bold leading-tight tracking-tight"
        style={{ color: "var(--color-warm-900)" }}
      >
        Bienvenido de nuevo
      </h1>
      <p
        className="mb-6 text-[14px] leading-[20px]"
        style={{ color: "var(--color-warm-600)" }}
      >
        Ingresa tus datos para continuar. Tu diario y tus conversaciones con Eco
        siguen protegidos — <b>solo tú puedes verlos</b>. <PrivacyInfoButton />
      </p>

      {/* `method="post"` para que el envío nativo —el que ocurre si React aún
          no ha enganchado su manejador— mande los campos en el cuerpo y nunca
          en la URL. Ver #727 y la explicación larga en
          `app/(auth)/register/page.tsx`. */}
      <form
        method="post"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
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
          <Link
            href="/forgot-password"
            // Medía 143×16. No está dentro de un párrafo, así que no le aplica
            // la excepción de enlace en texto corrido: es un control suelto y
            // le toca el mínimo de 24×24 (WCAG 2.2 · 2.5.8). Crece el alto
            // pulsable; el margen negativo conserva la posición.
            className="text-xs -my-1 mt-1 inline-flex min-h-6 items-center self-end py-1"
            style={{ color: "var(--color-lavender-700)" }}
          >
            ¿Olvidaste tu contraseña?
          </Link>
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
          aria-busy={isPending}
          className="mt-1 rounded-xl py-2.5 text-sm font-semibold transition-all"
          style={{
            // El resto de la superficie de autenticación ya usa el relleno de
            // marca pensado para llevar texto: 6.96:1 en Contemporary, 7.15 en
            // Renacimiento. Este botón se había quedado con la rampa cruda, que
            // da 3.63:1.
            //
            // Mientras envía NO se aclara ni se atenúa. La etiqueta sigue
            // diciendo algo («Iniciando sesión…»), y un texto que informa tiene
            // que seguir leyéndose: el escalón más claro de antes lo dejaba
            // peor todavía. Que está ocupado lo dicen la etiqueta y `aria-busy`.
            background: "var(--bg-brand-strong)",
            color: "var(--fg-on-brand)",
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
