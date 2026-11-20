"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { authApi, ApiError } from "@/lib/api";
import ResendVerificationPanel from "./_ResendVerificationPanel";

type Phase =
  | { kind: "verifying" }
  | { kind: "success"; email: string }
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "no-token" }
  | { kind: "error" };

export default function VerifyEmailFlow() {
  const params = useSearchParams();
  const token = params.get("token");

  const [phase, setPhase] = useState<Phase>(
    token ? { kind: "verifying" } : { kind: "no-token" },
  );
  const ranRef = useRef(false);

  useEffect(() => {
    if (!token || ranRef.current) return;
    ranRef.current = true;
    void (async () => {
      try {
        const res = await authApi.verifyEmail(token);
        setPhase({ kind: "success", email: res.email });
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          setPhase({ kind: "expired" });
        } else if (err instanceof ApiError && err.status === 400) {
          setPhase({ kind: "invalid" });
        } else {
          setPhase({ kind: "error" });
        }
      }
    })();
  }, [token]);

  if (phase.kind === "verifying") {
    return (
      <>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-warm-800)" }}
        >
          Confirmando tu correo...
        </h1>
        <p className="text-sm" style={{ color: "var(--color-warm-500)" }}>
          Un momento.
        </p>
      </>
    );
  }

  if (phase.kind === "success") {
    return (
      <>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-warm-800)" }}
        >
          ¡Listo! ✨
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
          Confirmamos tu correo {phase.email}. Ya puedes iniciar sesión.
        </p>
        <Link
          href="/login"
          className="rounded-xl py-2.5 px-4 text-sm font-medium text-white inline-block"
          style={{ background: "var(--bg-brand-strong)" }}
        >
          Ir al login
        </Link>
      </>
    );
  }

  // ── Los cuatro callejones sin salida ──────────────────────────────────────
  //
  // Los cuatro comparten remedio —pedir otro enlace— y hasta hoy ninguno lo
  // ofrecía: dos mandaban a iniciar sesión «para que te enviemos uno nuevo
  // automáticamente», y ese recorrido no existía en el producto. Ahora los
  // cuatro llevan el formulario que de verdad lo pide, y el texto describe lo
  // que va a pasar.
  const DEAD_END: Record<
    "expired" | "invalid" | "no-token" | "error",
    { titulo: string; cuerpo: string }
  > = {
    expired: {
      titulo: "El enlace expiró",
      cuerpo:
        "Los enlaces de verificación valen 24 horas. Pide uno nuevo con tu correo y te lo enviamos.",
    },
    invalid: {
      titulo: "Enlace inválido",
      cuerpo:
        "Este enlace no es válido. Es probable que ya lo hayas usado o que haya llegado cortado. Si todavía necesitas confirmar tu correo, pide uno nuevo.",
    },
    "no-token": {
      titulo: "Enlace incompleto",
      cuerpo:
        "Este enlace no trae el código que necesitamos para confirmar tu correo. Suele pasar cuando el correo lo parte en dos líneas. Pide uno nuevo y ábrelo de una sola vez.",
    },
    error: {
      titulo: "Algo salió mal",
      cuerpo:
        "No pudimos confirmar tu correo. Reintenta en unos minutos, o pide un enlace nuevo.",
    },
  };

  const { titulo, cuerpo } = DEAD_END[phase.kind];

  return (
    <>
      <h1
        className="text-2xl font-bold mb-1"
        style={{ color: "var(--color-warm-800)" }}
      >
        {titulo}
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
        {cuerpo}
      </p>

      <ResendVerificationPanel />

      <div className="flex justify-center mt-4">
        <Link
          href="/login"
          className="text-sm"
          style={{ color: "var(--color-lavender-700)" }}
        >
          ← Volver al login
        </Link>
      </div>
    </>
  );
}
