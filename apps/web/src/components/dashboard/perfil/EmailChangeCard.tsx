"use client";

import { useState } from "react";
import type { UserMeResponse } from "@psico/types";

import { requestEmailChangeAction } from "@/actions/profile";

export function EmailChangeCard({ me }: { me: UserMeResponse }) {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit() {
    if (!newEmail || newEmail === me.user.email) {
      setError("Tiene que ser un email distinto al actual.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await requestEmailChangeAction(newEmail);
      setSentTo(res.verificationSentTo);
      setOpen(false);
      setNewEmail("");
    } catch {
      setError("No pudimos enviar la verificación. Reintenta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
      data-testid="email-change-card"
    >
      <h2
        className="text-[14px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Email de la cuenta
      </h2>
      <p
        className="mt-0.5 text-[12px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Tu email actual es{" "}
        <span style={{ color: "var(--color-warm-900)" }}>{me.user.email}</span>.
        Cambiarlo dispara una verificación al email nuevo.
      </p>

      {sentTo ? (
        <p
          className="mt-3 rounded-xl px-3 py-2 text-[12px]"
          style={{
            background: "var(--color-sage-100)",
            color: "var(--color-sage-700)",
          }}
          role="status"
        >
          Te enviamos un enlace de confirmación a {sentTo}. Hacé click para
          activar el cambio.
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-medium"
          style={{
            borderColor: "var(--color-warm-300)",
            color: "var(--color-warm-700)",
          }}
          data-testid="email-change-toggle"
        >
          Cambiar email
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="flex flex-col gap-1">
            <span
              className="text-[12px] font-medium"
              style={{ color: "var(--color-warm-700)" }}
            >
              Nuevo email
            </span>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.currentTarget.value)}
              autoComplete="email"
              disabled={pending}
              placeholder="tu-nuevo@email.com"
              className="rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13px] focus:outline-none"
              style={{
                borderColor: "var(--color-warm-200)",
                color: "var(--color-warm-900)",
              }}
              data-testid="email-change-input"
            />
          </label>
          {error ? (
            <p
              className="text-[11px]"
              style={{ color: "var(--color-rose-600)" }}
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
              style={{ background: "var(--color-lavender-600)" }}
              data-testid="email-change-submit"
            >
              {pending ? "Enviando..." : "Enviar verificación"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setNewEmail("");
                setError(null);
              }}
              className="rounded-xl px-3 py-1.5 text-[12px] font-medium"
              style={{ color: "var(--color-warm-700)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
