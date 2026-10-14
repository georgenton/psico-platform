"use client";

import { useState, useTransition } from "react";
import type {
  BestTime,
  ThemePreference,
  UserPreferences,
  VoicePreference,
} from "@psico/types";
import { updatePreferencesAction } from "@/app/dashboard/perfil/actions";

const VOICE_OPTIONS: Array<{ key: VoicePreference; label: string }> = [
  { key: "marina", label: "Marina (cálida)" },
  { key: "tomas", label: "Tomás (sereno)" },
  { key: "none", label: "Sin voz" },
];

/**
 * La voz se guarda y se relee, pero hoy no la consume nadie.
 *
 * Ninguna superficie de lectura o audio lee `voicePreference`: no existe
 * todavía la narración que esta elección escogería. La preferencia NO se
 * retira —está en el modelo, persiste, y el día que haya voces será la que
 * valga— pero ofrecerla en silencio hace que la pantalla prometa algo que no
 * ocurre. Decirlo cuesta una línea y es la diferencia entre una preferencia
 * guardada y una promesa falsa.
 *
 * Cuando exista un consumidor real, esta nota se retira: el trinquete que la
 * acompaña está escrito para fallar si se retira ANTES.
 */
const VOZ_SIN_CONSUMIDOR =
  "Se guarda tu elección. Todavía no hay narración en la app, así que por ahora no cambia lo que escuchas.";

const BEST_TIME_OPTIONS: Array<{ key: BestTime; label: string }> = [
  { key: "morning", label: "Mañana" },
  { key: "noon", label: "Mediodía" },
  { key: "evening", label: "Tarde" },
  { key: "any", label: "Cualquiera" },
];

const THEME_OPTIONS: Array<{ key: ThemePreference; label: string }> = [
  { key: "system", label: "Sistema" },
  { key: "light", label: "Claro" },
  { key: "dark", label: "Oscuro" },
];

/**
 * PreferencesCard — Sprint Perfil.
 *
 * Render-on-edit: muestra los valores actuales como texto + botón
 * "Editar" que abre el form. Diseño elegido para que el card se vea
 * limpio cuando NO está editando (es el caso 95% del tiempo) y para
 * que cambios accidentales no ocurran al pasar por encima.
 */
export function PreferencesCard({ initial }: { initial: UserPreferences }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<UserPreferences>(initial);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    setFlash(null);
    startTransition(() => {
      updatePreferencesAction({
        voicePreference: draft.voicePreference,
        bestTime: draft.bestTime,
        weeklyGoalMinutes: draft.weeklyGoalMinutes,
        theme: draft.theme,
        moodPrompts: draft.moodPrompts,
      })
        .then(() => {
          setFlash("Preferencias guardadas");
          setEditing(false);
          setTimeout(() => setFlash(null), 2500);
        })
        .catch((e: Error) =>
          setError(e.message || "No pudimos guardar las preferencias."),
        );
    });
  }

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <header className="flex items-center justify-between">
        <div>
          <h2
            className="text-[15px] font-bold tracking-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            Preferencias
          </h2>
          <p
            className="mt-0.5 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Voz de la app, tema, mejor horario y objetivo semanal.
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setDraft(initial);
              setEditing(true);
              setError(null);
            }}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-700)",
            }}
          >
            Editar
          </button>
        ) : null}
      </header>

      {!editing ? (
        <dl
          className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]"
          style={{ color: "var(--color-warm-700)" }}
        >
          <Row
            label="Voz"
            value={
              VOICE_OPTIONS.find((v) => v.key === initial.voicePreference)
                ?.label ?? initial.voicePreference
            }
            nota={VOZ_SIN_CONSUMIDOR}
          />
          <Row
            label="Tema"
            value={
              THEME_OPTIONS.find((v) => v.key === initial.theme)?.label ??
              initial.theme
            }
          />
          <Row
            label="Mejor horario"
            value={
              BEST_TIME_OPTIONS.find((v) => v.key === initial.bestTime)
                ?.label ?? initial.bestTime
            }
          />
          <Row
            label="Objetivo semanal"
            value={`${initial.weeklyGoalMinutes} min/sem`}
          />
          <Row
            label="Prompts de ánimo"
            value={initial.moodPrompts ? "Activos" : "Apagados"}
          />
          <Row label="Idioma" value={initial.language} />
          {flash ? (
            <p
              className="col-span-2 mt-2 text-[12px] font-medium"
              style={{ color: "var(--color-sage-700)" }}
            >
              ✓ {flash}
            </p>
          ) : null}
        </dl>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="mt-4 space-y-4"
        >
          <Field label="Voz de la app" nota={VOZ_SIN_CONSUMIDOR}>
            <select
              value={draft.voicePreference}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  voicePreference: e.target.value as VoicePreference,
                })
              }
              className="w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13.5px]"
              style={{ borderColor: "var(--color-warm-200)" }}
            >
              {VOICE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tema">
            <div className="flex gap-2">
              {THEME_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setDraft({ ...draft, theme: o.key })}
                  className="flex-1 rounded-xl border-[1.5px] py-2 text-[12.5px] font-medium"
                  style={{
                    borderColor:
                      draft.theme === o.key
                        ? "var(--color-lavender-500)"
                        : "var(--color-warm-200)",
                    background:
                      draft.theme === o.key
                        ? "var(--color-lavender-50)"
                        : "white",
                    color: "var(--color-warm-800)",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Mejor horario de actividad">
            <div className="flex flex-wrap gap-2">
              {BEST_TIME_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setDraft({ ...draft, bestTime: o.key })}
                  className="rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                  style={{
                    background:
                      draft.bestTime === o.key
                        ? "var(--color-lavender-500)"
                        : "var(--color-warm-100)",
                    color:
                      draft.bestTime === o.key
                        ? "white"
                        : "var(--color-warm-700)",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Objetivo semanal · ${draft.weeklyGoalMinutes} min`}>
            <input
              type="range"
              min={15}
              max={300}
              step={15}
              value={draft.weeklyGoalMinutes}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  weeklyGoalMinutes: Number(e.target.value),
                })
              }
              className="w-full"
            />
          </Field>
          <Field label="Prompts de ánimo (te preguntamos cómo estás)">
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={draft.moodPrompts}
                onChange={(e) =>
                  setDraft({ ...draft, moodPrompts: e.target.checked })
                }
              />
              <span style={{ color: "var(--color-warm-700)" }}>
                Recibir prompts de ánimo durante el día
              </span>
            </label>
          </Field>

          {error ? (
            <p
              className="text-[12px]"
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
                setEditing(false);
                setDraft(initial);
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
              type="submit"
              disabled={pending}
              className="rounded-full px-4 py-1.5 text-[12px] font-semibold disabled:opacity-50"
              style={{
                background: "var(--bg-brand-strong)",
                color: "white",
              }}
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  nota,
}: {
  label: string;
  value: string;
  /** La misma aclaración que en el formulario: el resumen es lo que casi todo
   * el mundo lee, así que una limitación que sólo se contara al editar
   * seguiría siendo una promesa falsa para la mayoría. */
  nota?: string;
}) {
  return (
    <div>
      <dt
        className="text-[11.5px] font-medium uppercase tracking-wider"
        style={{ color: "var(--color-warm-500)" }}
      >
        {label}
      </dt>
      <dd className="mt-0.5">{value}</dd>
      {nota ? (
        <dd
          className="mt-0.5 text-[11.5px] leading-snug"
          style={{ color: "var(--color-warm-500)" }}
        >
          {nota}
        </dd>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
  nota,
}: {
  label: string;
  children: React.ReactNode;
  /**
   * Una aclaración corta bajo el control, para cuando lo que se elige todavía
   * no hace lo que su nombre promete. Va aquí y no en un `aviso` aparte porque
   * sólo se entiende junto a la elección que matiza.
   */
  nota?: string;
}) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-[12px] font-medium"
        style={{ color: "var(--color-warm-700)" }}
      >
        {label}
      </span>
      {children}
      {nota ? (
        <span
          className="mt-1 block text-[11.5px] leading-snug"
          style={{ color: "var(--color-warm-500)" }}
        >
          {nota}
        </span>
      ) : null}
    </label>
  );
}
