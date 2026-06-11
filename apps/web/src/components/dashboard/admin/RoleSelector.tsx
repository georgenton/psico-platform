"use client";

import { useState, useTransition } from "react";
import type { UserRole } from "@psico/types";
import { changeUserRoleAction } from "@/app/dashboard/admin/users/actions";

const ROLES: UserRole[] = ["USER", "AUTHOR", "PSYCHOLOGIST", "ADMIN"];

/**
 * RoleSelector — Sprint S72.
 *
 * Client Component que abre un mini-composer: select de rol + textarea
 * opcional para la razón del cambio. Backend logs el cambio en
 * `RoleChangeLog`. `isSelf` deshabilita demote para el propio admin.
 */
type Phase = "idle" | "editing" | "done";

export function RoleSelector({
  userId,
  currentRole,
  isSelf,
}: {
  userId: string;
  currentRole: UserRole;
  isSelf: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [nextRole, setNextRole] = useState<UserRole>(currentRole);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(() => {
      changeUserRoleAction(userId, nextRole, reason)
        .then((res) => {
          if (!res.changed) {
            setError("Sin cambio: ya tenía ese rol.");
            return;
          }
          setPhase("done");
        })
        .catch((e: Error) => setError(e.message || "No se pudo cambiar."));
    });
  }

  if (phase === "done") {
    return (
      <span
        className="text-[12px] font-medium"
        style={{ color: "var(--color-sage-700)" }}
      >
        ✓ Rol actualizado
      </span>
    );
  }

  if (phase === "editing") {
    return (
      <div className="w-full sm:w-[280px] space-y-2">
        <label
          className="block text-[11.5px] font-medium"
          style={{ color: "var(--color-warm-700)" }}
        >
          Nuevo rol
        </label>
        <select
          value={nextRole}
          onChange={(e) => setNextRole(e.target.value as UserRole)}
          disabled={pending}
          className="w-full rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[13px] outline-none"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          {ROLES.map((r) => (
            <option
              key={r}
              value={r}
              disabled={isSelf && r !== "ADMIN"}
            >
              {r}
              {isSelf && r !== "ADMIN" ? " — bloqueado (eres tú)" : ""}
            </option>
          ))}
        </select>
        <label
          className="block text-[11.5px] font-medium"
          style={{ color: "var(--color-warm-700)" }}
        >
          Razón (opcional)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          rows={2}
          maxLength={500}
          placeholder="Onboarding B2B autor, rotación de equipo…"
          className="w-full rounded-xl border-[1.5px] bg-white p-2 text-[12.5px] outline-none"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
        {error ? (
          <p
            className="text-[11.5px]"
            style={{ color: "var(--color-rose-700)" }}
          >
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPhase("idle");
              setReason("");
              setNextRole(currentRole);
              setError(null);
            }}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-700)",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending || nextRole === currentRole}
            onClick={submit}
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
            style={{
              background: "var(--color-lavender-500)",
              color: "white",
            }}
          >
            {pending ? "Guardando…" : "Confirmar cambio"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPhase("editing")}
      className="rounded-full px-3 py-1.5 text-[12px] font-medium"
      style={{
        background: "var(--color-warm-100)",
        color: "var(--color-warm-700)",
      }}
    >
      Cambiar rol
    </button>
  );
}
