"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** What a focus trap considers reachable. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const panelRef = useRef<HTMLDivElement>(null);
  /** Who had the keyboard when this opened — almost always the Aa button. */
  const restoreRef = useRef<HTMLElement | null>(null);

  // Focus goes in when the sheet opens and comes back out when it closes. A
  // dialog that declares `aria-modal` and then leaves the keyboard behind on
  // the chapter is worse than no dialog: the reader tabs through text they
  // cannot see. Handing focus back is the other half of the same promise.
  useEffect(() => {
    if (!isOpen) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      const back = restoreRef.current;
      if (back?.isConnected) {
        back.focus();
        return;
      }
      // The trigger can be gone — the reader re-rendered, or the bar changed
      // shape. Aa is the logical destination; if it is not there either, the
      // browser's default is better than focusing something arbitrary.
      document
        .querySelector<HTMLElement>(
          'button[aria-label="Preferencias de lectura"]',
        )
        ?.focus();
    };
  }, [isOpen]);

  // Escape closes, and the keyboard stays inside while it is open.
  //
  // This is a NATIVE listener on the dialog element, not a React `onKeyDown`
  // prop and not a listener on `document`, and the difference is the whole
  // point. React 18 delegates events from the root container — which under the
  // App Router is `document` itself — so by the time a synthetic handler runs,
  // the event has ALREADY reached `document`, and `stopPropagation()` there
  // cannot stop a listener sitting on that same node. The reader's companion
  // dock has exactly such a listener, so one Escape used to close two
  // surfaces. Measured: with the synthetic handler, Escape still arrived at
  // `document` once; with this one, zero times.
  //
  // Attached to the dialog, it is not a global shortcut either: it exists only
  // while this dialog is open, reacts only to Escape and Tab, and dismisses
  // only itself.
  const overlayRef = useRef<HTMLDivElement>(null);
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items || items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      // Only the two edges need handling; in between the browser is right.
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (
        e.shiftKey &&
        (active === first || active === panelRef.current)
      ) {
        e.preventDefault();
        last.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!isOpen || !overlay) return;
    overlay.addEventListener("keydown", onKey);
    return () => overlay.removeEventListener("keydown", onKey);
  }, [isOpen, onKey]);

  if (!isOpen) return null;

  function update<K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    onChange(next);
  }

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Preferencias de lectura"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl bg-white p-6 outline-none"
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
            // The «×» glyph is not an accessible name: without this a screen
            // reader announces "button" and nothing else.
            aria-label="Cerrar preferencias de lectura"
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
                          background: "var(--bg-brand-strong)",
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
