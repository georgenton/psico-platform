"use client";

import { useState } from "react";
import type { UserMeResponse } from "@psico/types";

import {
  logoutFromPerfilAction,
  requestAccountDeleteAction,
  requestDataExportAction,
} from "@/actions/profile";

export function DangerZone({ me }: { me: UserMeResponse }) {
  const exportRequested = me.privacy.dataExportRequested;
  const deleteRequested = me.privacy.accountDeleteRequested;

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
      data-testid="danger-zone"
    >
      <h2
        className="text-[14px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Zona sensible
      </h2>
      <p
        className="mt-0.5 text-[12px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Acciones irreversibles o con cooldown. Pensá dos veces.
      </p>

      <div className="mt-4 space-y-3">
        <ExportRow alreadyRequested={exportRequested} />
        <DeleteRow alreadyRequested={deleteRequested} />
        <LogoutRow />
      </div>
    </section>
  );
}

function ExportRow({
  alreadyRequested,
}: {
  alreadyRequested: Date | string | null;
}) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setPending(true);
    setError(null);
    try {
      const res = await requestDataExportAction();
      const eta = new Date(res.expectedAt);
      setDone(
        `Te enviaremos un email cuando esté listo (≈${eta.toLocaleString("es-419")})`,
      );
    } catch {
      setError("No pudimos procesar el pedido. Reintenta en unos minutos.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
      style={{ background: "var(--color-warm-50)" }}
    >
      <div className="flex-1">
        <p
          className="text-[13px] font-medium"
          style={{ color: "var(--color-warm-900)" }}
        >
          Exportar mis datos
        </p>
        <p className="text-[11px]" style={{ color: "var(--color-warm-500)" }}>
          Recibís un ZIP con tu perfil + actividad. Solo 1 vez cada 30 días.
        </p>
        {done ? (
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--color-sage-700)" }}
          >
            {done}
          </p>
        ) : null}
        {error ? (
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--color-rose-600)" }}
          >
            {error}
          </p>
        ) : null}
        {alreadyRequested && !done ? (
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Ya solicitaste un export hace{" "}
            {Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(alreadyRequested).getTime()) /
                  (24 * 60 * 60 * 1000),
              ),
            )}{" "}
            días.
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={trigger}
        disabled={pending || Boolean(done)}
        className="rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
        style={{
          borderColor: "var(--color-warm-300)",
          color: "var(--color-warm-700)",
        }}
        data-testid="export-btn"
      >
        {pending ? "Procesando..." : "Solicitar export"}
      </button>
    </div>
  );
}

function DeleteRow({
  alreadyRequested,
}: {
  alreadyRequested: Date | string | null;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(
    alreadyRequested
      ? new Date(alreadyRequested).toLocaleString("es-419")
      : null,
  );

  async function trigger() {
    if (!password) {
      setError("Necesitamos tu contraseña para confirmar.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await requestAccountDeleteAction(
        password,
        reason || undefined,
      );
      const at = new Date(res.deleteAt);
      setScheduledFor(at.toLocaleString("es-419"));
      setOpen(false);
      setPassword("");
      setReason("");
    } catch {
      setError("Contraseña incorrecta o ya hay un pedido en curso.");
    } finally {
      setPending(false);
    }
  }

  if (scheduledFor) {
    return (
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background: "var(--color-rose-50)",
          border: "1.5px solid var(--color-rose-200)",
        }}
      >
        <p
          className="text-[13px] font-medium"
          style={{ color: "var(--color-rose-700)" }}
        >
          Borrado programado
        </p>
        <p
          className="mt-1 text-[12px]"
          style={{ color: "var(--color-rose-600)" }}
        >
          Tu cuenta se eliminará el {scheduledFor}. Hasta entonces, podés
          contactar soporte para cancelar el pedido.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: "var(--color-warm-50)" }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p
            className="text-[13px] font-medium"
            style={{ color: "var(--color-rose-700)" }}
          >
            Eliminar mi cuenta
          </p>
          <p className="text-[11px]" style={{ color: "var(--color-warm-500)" }}>
            Cooldown de 30 días desde la solicitud. Tu Diario se pierde si no
            tenés la frase de respaldo.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-xl border-[1.5px] px-3 py-1.5 text-[12px] font-medium"
            style={{
              borderColor: "var(--color-rose-300)",
              color: "var(--color-rose-700)",
            }}
            data-testid="delete-toggle"
          >
            Eliminar
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 space-y-2">
          <label className="flex flex-col gap-1">
            <span
              className="text-[11px] font-medium"
              style={{ color: "var(--color-warm-700)" }}
            >
              Contraseña actual
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="current-password"
              disabled={pending}
              className="rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13px] focus:outline-none"
              style={{
                borderColor: "var(--color-warm-200)",
                color: "var(--color-warm-900)",
              }}
              data-testid="delete-password"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span
              className="text-[11px] font-medium"
              style={{ color: "var(--color-warm-700)" }}
            >
              Razón (opcional)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              maxLength={500}
              rows={3}
              disabled={pending}
              className="rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13px] focus:outline-none"
              style={{
                borderColor: "var(--color-warm-200)",
                color: "var(--color-warm-900)",
              }}
            />
          </label>
          {error ? (
            <p
              className="text-[11px]"
              style={{ color: "var(--color-rose-600)" }}
            >
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={trigger}
              disabled={pending}
              className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
              style={{ background: "var(--color-rose-600)" }}
              data-testid="delete-confirm"
            >
              {pending ? "Procesando..." : "Confirmar borrado"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPassword("");
                setError(null);
              }}
              className="rounded-xl px-3 py-1.5 text-[12px] font-medium"
              style={{ color: "var(--color-warm-700)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LogoutRow() {
  return (
    <form action={logoutFromPerfilAction}>
      <div
        className="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
        style={{ background: "var(--color-warm-50)" }}
      >
        <div className="flex-1">
          <p
            className="text-[13px] font-medium"
            style={{ color: "var(--color-warm-900)" }}
          >
            Cerrar sesión
          </p>
          <p className="text-[11px]" style={{ color: "var(--color-warm-500)" }}>
            Tendrás que volver a iniciar sesión la próxima vez.
          </p>
        </div>
        <button
          type="submit"
          className="rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-medium"
          style={{
            borderColor: "var(--color-warm-300)",
            color: "var(--color-warm-700)",
          }}
        >
          Salir
        </button>
      </div>
    </form>
  );
}
