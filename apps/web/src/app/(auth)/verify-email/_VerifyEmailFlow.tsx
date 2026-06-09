"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { authApi, ApiError } from "@/lib/api";

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

  if (phase.kind === "no-token") {
    return (
      <>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-warm-800)" }}
        >
          Enlace incompleto
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
          El enlace de verificación no incluye un token. Pedile al sistema que
          te envíe uno nuevo desde la pantalla de login.
        </p>
        <Link
          href="/login"
          className="rounded-xl py-2.5 px-4 text-sm font-medium text-white inline-block"
          style={{ background: "var(--color-lavender-600)" }}
        >
          Volver al login
        </Link>
      </>
    );
  }

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
          Confirmamos tu correo {phase.email}. Ya podés iniciar sesión.
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

  if (phase.kind === "expired") {
    return (
      <>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-warm-800)" }}
        >
          El enlace expiró
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
          Los enlaces de verificación valen 24 horas. Iniciá sesión para que te
          enviemos uno nuevo automáticamente.
        </p>
        <Link
          href="/login"
          className="rounded-xl py-2.5 px-4 text-sm font-medium text-white inline-block"
          style={{ background: "var(--color-lavender-600)" }}
        >
          Volver al login
        </Link>
      </>
    );
  }

  if (phase.kind === "invalid") {
    return (
      <>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-warm-800)" }}
        >
          Enlace inválido
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
          Este enlace no es válido. Es probable que ya lo hayas usado o que haya
          sido modificado.
        </p>
        <Link
          href="/login"
          className="rounded-xl py-2.5 px-4 text-sm font-medium text-white inline-block"
          style={{ background: "var(--color-lavender-600)" }}
        >
          Volver al login
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
        Algo salió mal
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-warm-500)" }}>
        No pudimos confirmar tu correo. Reintenta en unos minutos o iniciá
        sesión para pedir un enlace nuevo.
      </p>
      <Link
        href="/login"
        className="rounded-xl py-2.5 px-4 text-sm font-medium text-white inline-block"
        style={{ background: "var(--color-lavender-600)" }}
      >
        Volver al login
      </Link>
    </>
  );
}
