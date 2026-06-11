"use client";

import { useState, useTransition } from "react";
import type { UserPrivacySettings } from "@psico/types";
import { updatePrivacyAction } from "@/app/dashboard/perfil/actions";

/**
 * PrivacyCard — Sprint Perfil.
 *
 * Toggles de privacidad/share. `shareDiaryWithTherapist` solo afecta
 * el flow de share-with-therapist del Diario (S6) — el body cifrado
 * sigue siendo E2E; este toggle controla si el autor te lo permite
 * tras solicitarlo. Sin acción del autor, no se comparte ni con flag on.
 *
 * Optimistic UX: cada switch dispara una server action independiente.
 * Sin botón "Save" — los cambios se aplican inmediato.
 */
type Field = keyof Pick<
  UserPrivacySettings,
  "shareDiaryWithTherapist" | "anonymizedAnalytics" | "marketingEmail"
>;

const ROWS: Array<{
  key: Field;
  title: string;
  hint: string;
}> = [
  {
    key: "shareDiaryWithTherapist",
    title: "Permitir compartir Diario con terapeuta",
    hint:
      "Cuando un terapeuta lo solicite, podrás aceptar compartir entradas específicas (re-encrypt efímero). Sin esta marca, el flow no inicia.",
  },
  {
    key: "anonymizedAnalytics",
    title: "Analíticas anónimas",
    hint:
      "Compartimos datos de uso (cuántos capítulos completaste, etc.) sin tu contenido. Nos ayuda a mejorar la plataforma.",
  },
  {
    key: "marketingEmail",
    title: "Correos de novedades",
    hint:
      "Nuevos libros del catálogo, mejoras del producto, ofertas estacionales. No incluye operacionales (verificación, alertas, etc).",
  },
];

export function PrivacyCard({ initial }: { initial: UserPrivacySettings }) {
  const [state, setState] = useState<UserPrivacySettings>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<Field | null>(null);

  function toggle(field: Field) {
    const optimistic = !state[field];
    const previous = state[field];
    setState({ ...state, [field]: optimistic });
    setError(null);
    startTransition(() => {
      updatePrivacyAction({ [field]: optimistic })
        .then(() => {
          setFlashKey(field);
          setTimeout(() => setFlashKey(null), 2000);
        })
        .catch((e: Error) => {
          setState({ ...state, [field]: previous });
          setError(e.message || "No pudimos guardar el cambio.");
        });
    });
  }

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <header>
        <h2
          className="text-[15px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Privacidad
        </h2>
        <p
          className="mt-0.5 text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Decide qué compartes con la plataforma y con terceros.
        </p>
      </header>

      <ul className="mt-3 divide-y" style={{ borderColor: "var(--color-warm-100)" }}>
        {ROWS.map((row) => (
          <li
            key={row.key}
            className="flex items-start justify-between gap-3 py-3"
            style={{ borderTopColor: "var(--color-warm-100)" }}
          >
            <div className="min-w-0 flex-1">
              <p
                className="text-[13px] font-semibold"
                style={{ color: "var(--color-warm-900)" }}
              >
                {row.title}
              </p>
              <p
                className="mt-0.5 text-[11.5px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                {row.hint}
              </p>
              {flashKey === row.key ? (
                <p
                  className="mt-1 text-[11px] font-medium"
                  style={{ color: "var(--color-sage-700)" }}
                >
                  ✓ Guardado
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={state[row.key]}
              disabled={pending}
              onClick={() => toggle(row.key)}
              className="relative inline-block h-6 w-11 flex-none rounded-full transition disabled:opacity-50"
              style={{
                background: state[row.key]
                  ? "var(--color-lavender-500)"
                  : "var(--color-warm-200)",
              }}
            >
              <span
                className="absolute top-[2px] h-5 w-5 rounded-full bg-white transition-all"
                style={{ left: state[row.key] ? "22px" : "2px" }}
              />
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
        </p>
      ) : null}

      <footer
        className="mt-4 rounded-xl p-3 text-[11.5px]"
        style={{
          background: "var(--color-warm-50)",
          color: "var(--color-warm-600)",
        }}
      >
        💡 Tu Diario sigue cifrado E2E. Aún con "compartir con terapeuta" activo,
        cada vez que pides compartir una entrada, se re-encripta con la clave del
        terapeuta solo para esa entrada. Nosotros nunca vemos el texto.
      </footer>
    </section>
  );
}
