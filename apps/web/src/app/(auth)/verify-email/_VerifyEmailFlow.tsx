"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { authApi, ApiError } from "@/lib/api";
import ResendVerificationPanel from "./_ResendVerificationPanel";

type Phase =
  | { kind: "verifying" }
  | { kind: "success" }
  | { kind: "request" }
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "no-token" }
  | { kind: "error" };

/**
 * Sin token hay dos situaciones distintas, y la diferencia es de dónde viene
 * la persona. Desde un correo con el enlace partido llega sin `?resend` y ve
 * «enlace incompleto». Desde el login —«¿No te llegó el correo?»— llega con
 * `?resend=1`: nunca tuvo un enlace, así que decirle que el suyo está
 * incompleto sería falso. Un token presente gana siempre: es lo que se pidió
 * abrir.
 */
function initialPhase(token: string | null, resend: string | null): Phase {
  if (token) return { kind: "verifying" };
  if (resend === "1") return { kind: "request" };
  return { kind: "no-token" };
}

export default function VerifyEmailFlow() {
  const params = useSearchParams();
  const token = params.get("token");
  const resend = params.get("resend");

  const [phase, setPhase] = useState<Phase>(() => initialPhase(token, resend));
  const ranRef = useRef(false);

  useEffect(() => {
    if (!token || ranRef.current) return;
    ranRef.current = true;
    void (async () => {
      try {
        await authApi.verifyEmail(token);
        // La API contesta `{ ok, userId }`: no devuelve la dirección. La
        // primera versión de esta pantalla interpolaba `res.email`, que nunca
        // llegaba, y decía «Confirmamos tu correo .» — visto en staging el
        // 2026-11-23. La frase no necesita la dirección: quien la lee acaba de
        // abrir el enlace desde su propio correo.
        setPhase({ kind: "success" });
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
          Confirmamos tu correo. Ya puedes iniciar sesión.
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

  // ── Los cuatro callejones sin salida, y la entrada desde el login ─────────
  //
  // Los cuatro callejones comparten remedio —pedir otro enlace— y hasta hoy
  // ninguno lo ofrecía: dos mandaban a iniciar sesión «para que te enviemos uno
  // nuevo automáticamente», y ese recorrido no existía en el producto. Ahora
  // los cuatro llevan el formulario que de verdad lo pide. La quinta entrada,
  // `request`, es para quien nunca recibió el primer correo y llega desde el
  // login: el mismo formulario, con un texto que no le habla de un enlace que
  // no tiene.
  //
  // Ningún texto de aquí promete un envío: lo que pase después lo decide el
  // servidor, que contesta lo mismo en todos los casos.
  const DEAD_END: Record<
    "request" | "expired" | "invalid" | "no-token" | "error",
    { titulo: string; cuerpo: string }
  > = {
    request: {
      titulo: "Confirma tu correo",
      cuerpo:
        "Si no te llegó el correo para confirmar tu cuenta, o ya no lo encuentras, escribe la dirección con la que te registraste y pide un enlace nuevo.",
    },
    expired: {
      titulo: "El enlace expiró",
      cuerpo:
        "Este enlace ya venció: los enlaces de verificación valen 24 horas. Puedes pedir otro con tu correo.",
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
