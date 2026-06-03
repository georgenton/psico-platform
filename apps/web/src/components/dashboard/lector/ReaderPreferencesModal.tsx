"use client";

import { useState } from "react";

export interface ReaderPrefs {
  theme: "system" | "light" | "sepia" | "dark";
  font: "serif" | "sans";
  fontSize: number;
  lineHeight: number;
}

interface Props {
  isOpen: boolean;
  initial: ReaderPrefs;
  onClose: () => void;
  /** Applied live; also persisted via PATCH /api/user/reader-preferences. */
  onChange: (prefs: ReaderPrefs) => void;
}

const THEMES = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "sepia", label: "Sepia" },
  { value: "dark", label: "Oscuro" },
] as const;

const FONTS = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
] as const;

/**
 * ReaderPreferencesModal — Aa-style settings sheet.
 *
 * We apply changes optimistically: every dial twist calls `onChange` so
 * the layout re-renders instantly. The parent debounces the PATCH so
 * dragging the size slider doesn't fire 30 requests.
 */
export function ReaderPreferencesModal({
  isOpen,
  initial,
  onClose,
  onChange,
}: Props) {
  const [prefs, setPrefs] = useState<ReaderPrefs>(initial);

  if (!isOpen) return null;

  function update<K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    onChange(next);
  }

  return (
    <div
      role="dialog"
      aria-label="Preferencias de lectura"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between">
          <h3
            className="text-[14px] font-bold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Aa · Lectura
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[20px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            ×
          </button>
        </header>

        {/* Theme */}
        <fieldset className="mb-5">
          <legend
            className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Tema
          </legend>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => {
              const active = prefs.theme === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update("theme", t.value)}
                  className="rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold"
                  style={
                    active
                      ? {
                          background: "var(--color-lavender-500)",
                          color: "white",
                          borderColor: "var(--color-lavender-500)",
                        }
                      : {
                          background: "white",
                          color: "var(--color-warm-700)",
                          borderColor: "var(--color-warm-200)",
                        }
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Font family */}
        <fieldset className="mb-5">
          <legend
            className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Tipografía
          </legend>
          <div className="flex gap-2">
            {FONTS.map((f) => {
              const active = prefs.font === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => update("font", f.value)}
                  className="flex-1 rounded-xl border-[1.5px] py-3 text-[14px] font-semibold"
                  style={
                    active
                      ? {
                          background: "var(--color-warm-100)",
                          color: "var(--color-warm-900)",
                          borderColor: "var(--color-warm-400)",
                          fontFamily:
                            f.value === "serif" ? "serif" : "sans-serif",
                        }
                      : {
                          background: "white",
                          color: "var(--color-warm-500)",
                          borderColor: "var(--color-warm-200)",
                          fontFamily:
                            f.value === "serif" ? "serif" : "sans-serif",
                        }
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Font size */}
        <fieldset className="mb-5">
          <legend
            className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Tamaño · {prefs.fontSize}px
          </legend>
          <input
            type="range"
            min={14}
            max={28}
            step={1}
            value={prefs.fontSize}
            onChange={(e) => update("fontSize", Number(e.target.value))}
            className="w-full"
          />
        </fieldset>

        {/* Line height */}
        <fieldset>
          <legend
            className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Interlineado · {prefs.lineHeight.toFixed(1)}
          </legend>
          <input
            type="range"
            min={1.2}
            max={2.2}
            step={0.1}
            value={prefs.lineHeight}
            onChange={(e) => update("lineHeight", Number(e.target.value))}
            className="w-full"
          />
        </fieldset>
      </div>
    </div>
  );
}
