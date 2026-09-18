"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ThemePicker — el theme visual, junto al control de ambiente que ya existía.
 *
 * ── Theme y modo son preferencias distintas ────────────────────────────────
 *
 * El AMBIENTE (Calma · Enfoque · Energía · Noche) responde a «cómo quiero que
 * se sienta ahora mismo» y ya tenía su control, su persistencia y su
 * comportamiento. Nada de eso cambia.
 *
 * El THEME (Contemporary · Renacimiento) responde a «qué sistema visual».
 * Es ortogonal: cualquier theme se combina con cualquier ambiente, y por eso
 * es un segundo control y no cuatro opciones más en el primero.
 *
 * ── Dónde se guarda ───────────────────────────────────────────────────────
 *
 * En `localStorage`, con el prefijo `psico:` que este producto ya usa para las
 * preferencias por dispositivo (`psico:lector:mode`). No se añade tabla,
 * columna, endpoint ni sistema de preferencias: para una revisión visual, la
 * preferencia por dispositivo es suficiente y deja producción intacta.
 * Llevarla a la cuenta, junto al ambiente, es una decisión para después.
 */

export const THEME_IDS = ["contemporary", "renaissance"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_STORAGE_KEY = "psico:theme";

const THEME_LABELS: Record<ThemeId, { label: string; swatch: string }> = {
  contemporary: { label: "Contemporary", swatch: "var(--con-lav-500)" },
  renaissance: { label: "Renacimiento", swatch: "#625078" },
};

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    (THEME_IDS as readonly string[]).includes(value)
  );
}

/** Lee la preferencia guardada. Falla en silencio: sin ella, Contemporary. */
export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "contemporary";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(raw) ? raw : "contemporary";
  } catch {
    return "contemporary";
  }
}

export function applyTheme(next: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = next;
}

export function ThemePicker() {
  // Arranca SIEMPRE en el valor del servidor para que el primer render del
  // cliente coincida con el HTML; la preferencia guardada se aplica después,
  // en el efecto. Leer `localStorage` en el inicializador daría un HTML y un
  // primer render distintos, que es exactamente un error de hidratación.
  const [theme, setTheme] = useState<ThemeId>("contemporary");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function pick(next: ThemeId) {
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* modo privado o almacenamiento bloqueado: el theme vale para esta sesión */
    }
    setOpen(false);
  }

  const active = THEME_LABELS[theme];

  return (
    <div className="amb-wrap relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        // La etiqueta visible se colapsa en pantallas estrechas, así que el
        // nombre accesible se dice aquí y nunca depende de ella.
        aria-label={`Estilo: ${active.label}. Cambiar.`}
        className="amb-trigger flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all"
        style={{
          background: "var(--color-warm-100)",
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-600)",
        }}
      >
        <span
          aria-hidden
          className="amb-swatch h-2.5 w-2.5 rounded-full"
          style={{ background: active.swatch }}
        />
        <span className="amb-label">{active.label}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Selecciona un estilo visual"
          className="absolute right-0 z-40 mt-2 w-48 rounded-2xl border p-1 shadow-lg"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--color-warm-200)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {THEME_IDS.map((id) => {
            const opt = THEME_LABELS[id];
            const isActive = id === theme;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => pick(id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors"
                style={{
                  background: isActive
                    ? "var(--color-lavender-50)"
                    : "transparent",
                  color: isActive
                    ? "var(--color-lavender-700)"
                    : "var(--color-warm-700)",
                }}
              >
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-full"
                  style={{ background: opt.swatch }}
                />
                <span className="font-medium">{opt.label}</span>
                {isActive ? (
                  <span
                    aria-hidden
                    className="ml-auto text-xs"
                    style={{ color: "var(--color-lavender-600)" }}
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
