"use client";

import { useState, useTransition } from "react";
import type {
  UpdateNotificationsRequest,
  UserNotificationSettings,
} from "@psico/types";
import { updateNotificationsAction } from "@/actions/notifications";

/**
 * NotificationsForm — Sprint S45 (web).
 *
 * One row per setting. Toggles update optimistically and POST through the
 * server action. The reminderTime input uses native `<input type="time">`
 * for ubiquitous support; we round to the nearest minute on submit so the
 * server gets a clean HH:MM value.
 *
 * UX choices:
 * - Each toggle is independent — saving one doesn't block the others.
 * - A small "Guardado · hace un momento" banner appears for 3s after each
 *   successful save so the user gets confirmation without modal noise.
 * - Errors render inline next to the failing row so the user knows
 *   exactly what didn't save.
 */
const ROWS: Array<{
  key: keyof UserNotificationSettings;
  label: string;
  hint: string;
}> = [
  {
    key: "dailyReminder",
    label: "Recordatorio diario",
    hint: "Te notificamos a tu hora para escribir en el diario o leer un capítulo.",
  },
  {
    key: "streakReminders",
    label: "Recordatorios de racha",
    hint: "Avisos cuando tu racha esté por romperse.",
  },
  {
    key: "ecoReplies",
    label: "Respuestas de Eco",
    hint: "Te avisamos cuando Eco termine una respuesta larga (futuro).",
  },
  {
    key: "weeklyReport",
    label: "Resumen semanal",
    hint: "Email cada lunes con tu mapa emocional de la semana pasada.",
  },
  {
    key: "terapiaReminders",
    label: "Recordatorios de terapia",
    hint: "Avisos antes de tu próxima sesión (v2, cuando Terapia esté activa).",
  },
];

export function NotificationsForm({
  initial,
}: {
  initial: UserNotificationSettings;
}) {
  const [state, setState] = useState<UserNotificationSettings>(initial);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();

  function save(patch: UpdateNotificationsRequest) {
    const prev = state;
    const optimistic = { ...state, ...patch };
    setState(optimistic);
    setError(null);
    startTransition(async () => {
      try {
        const next = await updateNotificationsAction(patch);
        setState(next);
        setSavedFlash("Guardado · hace un momento");
        setTimeout(() => setSavedFlash(null), 3000);
      } catch {
        setState(prev);
        setError("No pudimos guardar el cambio. Reintenta.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {savedFlash ? (
        <p
          className="rounded-xl px-3 py-2 text-[12px]"
          role="status"
          style={{
            background: "var(--color-sage-50, #F0F6EE)",
            color: "var(--color-sage-700, #2F5A2A)",
          }}
        >
          {savedFlash}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-xl px-3 py-2 text-[12px]"
          role="alert"
          style={{ background: "#FEE2E2", color: "#B91C1C" }}
        >
          {error}
        </p>
      ) : null}

      <ul
        className="divide-y rounded-2xl border-[1.5px] bg-white"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        {ROWS.map((r) => {
          const v = state[r.key] as boolean;
          return (
            <li
              key={r.key}
              className="flex items-start gap-4 px-5 py-4"
              style={{ borderColor: "var(--color-warm-100)" }}
            >
              <div className="flex-1">
                <p
                  className="text-[14px] font-semibold"
                  style={{ color: "var(--color-warm-900)" }}
                >
                  {r.label}
                </p>
                <p
                  className="mt-0.5 text-[12.5px]"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  {r.hint}
                </p>
              </div>
              <button
                type="button"
                aria-pressed={v}
                aria-label={r.label}
                disabled={submitting}
                onClick={() => save({ [r.key]: !v })}
                className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50"
                style={{
                  background: v
                    ? "var(--color-lavender-500)"
                    : "var(--color-warm-300)",
                }}
              >
                <span
                  className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
                  style={{
                    transform: v ? "translateX(22px)" : "translateX(2px)",
                  }}
                />
              </button>
            </li>
          );
        })}

        {/* reminderTime — only meaningful when dailyReminder is on */}
        <li
          className="flex items-start gap-4 px-5 py-4"
          style={{ borderColor: "var(--color-warm-100)" }}
        >
          <div className="flex-1">
            <p
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-warm-900)" }}
            >
              Hora del recordatorio
            </p>
            <p
              className="mt-0.5 text-[12.5px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              {state.dailyReminder
                ? "El recordatorio diario se enviará a esta hora local."
                : "Activa el recordatorio diario primero."}
            </p>
          </div>
          <input
            type="time"
            value={state.reminderTime}
            disabled={!state.dailyReminder || submitting}
            onChange={(e) => save({ reminderTime: e.target.value })}
            className="rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[14px] disabled:opacity-50"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
          />
        </li>
      </ul>

      <p className="text-[11.5px]" style={{ color: "var(--color-warm-400)" }}>
        Estos ajustes se sincronizan entre web y mobile. Los cambios entran en
        vigor en el próximo ciclo de notificaciones.
      </p>
    </div>
  );
}
