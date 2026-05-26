"use client";

import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";

import { registerAction } from "@/actions/auth";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);

    const password = data.get("password") as string;
    const confirm = data.get("confirm") as string;

    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await registerAction({
        name: data.get("name") as string,
        email: data.get("email") as string,
        password,
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
        Crea tu cuenta
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
        Empieza gratis — no necesitas tarjeta de crédito
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="name"
            className="text-sm font-medium"
            style={{ color: "var(--color-warm-700)" }}
          >
            Nombre completo
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            disabled={isPending}
            placeholder="Ana García"
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
            autoComplete="new-password"
            required
            minLength={8}
            disabled={isPending}
            placeholder="Mínimo 8 caracteres"
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
            minLength={8}
            disabled={isPending}
            placeholder="Repite tu contraseña"
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
              ? "var(--color-sage-300)"
              : "var(--color-sage-400)",
          }}
        >
          {isPending ? "Creando cuenta…" : "Crear cuenta gratis"}
        </button>
      </form>

      <p
        className="mt-6 text-center text-sm"
        style={{ color: "var(--color-warm-500)" }}
      >
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-medium"
          style={{ color: "var(--color-lavender-600)" }}
        >
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
