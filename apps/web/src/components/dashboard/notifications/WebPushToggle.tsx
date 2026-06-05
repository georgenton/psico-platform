"use client";

import { useEffect, useState } from "react";
import {
  detectWebPushSupport,
  subscribeWebPush,
  unsubscribeWebPush,
} from "@/lib/web-push";

/**
 * WebPushToggle — Sprint S47 (web).
 *
 * Surfaces the browser permission state and offers a single button to
 * subscribe / unsubscribe. We don't try to persist the subscription id
 * server-side anywhere fancy — we just re-derive subscribe state on mount
 * by checking `pushManager.getSubscription()`.
 *
 * UX:
 *  - `Activado`: user has a subscription + permission granted.
 *  - `Desactivado`: any other state. Clicking subscribes.
 *  - `Bloqueado por el navegador`: user denied permission. Shows a hint to
 *    re-enable from browser settings; the button is disabled because the
 *    spec gives no programmatic way to re-prompt after denial.
 *  - `No disponible`: feature detection failed (insecure context, older
 *    browser). Friendly note + disabled button.
 *
 * Auth: receives `apiBase` and `accessToken` props from the page (same
 * pattern as EcoShell) — the API needs Bearer auth to register the
 * subscription against the user.
 */
type Phase =
  | { kind: "loading" }
  | { kind: "unsupported"; reason: string }
  | { kind: "blocked" }
  | { kind: "off" }
  | { kind: "on" }
  | { kind: "submitting" }
  | { kind: "error"; msg: string };

export function WebPushToggle({
  apiBase,
  accessToken,
}: {
  apiBase: string;
  accessToken: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  // We track the DeviceToken id only when we just subscribed in this session;
  // unsubscribe falls back to deleting by-token in a future iteration if
  // the user reloaded between subscribe and unsubscribe.
  const [deviceTokenId, setDeviceTokenId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const support = detectWebPushSupport();
      if (!support.supported) {
        setPhase({ kind: "unsupported", reason: support.reason });
        return;
      }
      if (support.permission === "denied") {
        setPhase({ kind: "blocked" });
        return;
      }
      // Check whether we already have a subscription.
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const existing = reg ? await reg.pushManager.getSubscription() : null;
        setPhase({ kind: existing ? "on" : "off" });
      } catch {
        setPhase({ kind: "off" });
      }
    })();
  }, []);

  async function handleSubscribe() {
    setPhase({ kind: "submitting" });
    try {
      const { id } = await subscribeWebPush(apiBase, accessToken);
      setDeviceTokenId(id);
      setPhase({ kind: "on" });
    } catch (err) {
      const code = (err as Error).message;
      const msg =
        code === "permission-denied"
          ? "Negaste el permiso. Cambialo desde la configuración del navegador."
          : code === "no-vapid-key"
            ? "Falta configurar VAPID en el servidor."
            : code === "subscribe-failed"
              ? "Tu navegador rechazó la suscripción. Reintenta."
              : "No pudimos registrar tu navegador. Reintenta.";
      setPhase({ kind: "error", msg });
    }
  }

  async function handleUnsubscribe() {
    setPhase({ kind: "submitting" });
    await unsubscribeWebPush(apiBase, accessToken, deviceTokenId ?? "");
    setDeviceTokenId(null);
    setPhase({ kind: "off" });
  }

  return (
    <div
      className="rounded-2xl border-[1.5px] bg-white p-4"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p
            className="text-[14px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Notificaciones del navegador
          </p>
          <p
            className="mt-0.5 text-[12.5px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {phase.kind === "unsupported"
              ? "Tu navegador no soporta notificaciones del sistema (requiere HTTPS + navegador moderno)."
              : phase.kind === "blocked"
                ? "Negaste el permiso. Activalo desde la configuración del navegador."
                : phase.kind === "on"
                  ? "Activadas — recibirás alertas aún cuando la pestaña esté cerrada."
                  : "Recibí alertas del recordatorio diario, racha y Eco aún sin abrir Psico."}
          </p>
          {phase.kind === "error" ? (
            <p
              className="mt-2 rounded-lg px-2 py-1 text-[11.5px]"
              style={{ background: "#FEE2E2", color: "#B91C1C" }}
            >
              {phase.msg}
            </p>
          ) : null}
        </div>

        {phase.kind === "loading" ? (
          <span
            className="text-[12px]"
            style={{ color: "var(--color-warm-400)" }}
          >
            Cargando…
          </span>
        ) : phase.kind === "unsupported" || phase.kind === "blocked" ? (
          <button
            type="button"
            disabled
            className="rounded-full px-3 py-1.5 text-[12.5px] font-medium opacity-50"
            style={{
              background: "var(--color-warm-200)",
              color: "var(--color-warm-700)",
            }}
          >
            No disponible
          </button>
        ) : phase.kind === "on" ? (
          <button
            type="button"
            onClick={handleUnsubscribe}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-medium"
            style={{
              background: "var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
          >
            Desactivar
          </button>
        ) : phase.kind === "submitting" ? (
          <button
            type="button"
            disabled
            className="rounded-full px-3 py-1.5 text-[12.5px] font-medium opacity-70"
            style={{
              background: "var(--color-lavender-500)",
              color: "white",
            }}
          >
            Activando…
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubscribe}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-medium"
            style={{
              background: "var(--color-lavender-500)",
              color: "white",
            }}
          >
            Activar
          </button>
        )}
      </div>
    </div>
  );
}
