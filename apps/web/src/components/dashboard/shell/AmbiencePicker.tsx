"use client";

import { useEffect, useRef, useState } from "react";
import { AMBIENT_IDS, type AmbientId } from "@psico/types";
import { usersApi } from "@psico/api-client";

/**
 * AmbiencePicker — Sprint B2 Topbar component.
 *
 * Lets the user re-skin the dashboard with one of the four ambient themes
 * (Calma / Enfoque / Energía / Noche). All four are free by Sprint B1
 * decision; gating happens nowhere.
 *
 * The picker is purely cosmetic in this PR — the visual override comes
 * from the `body.amb-{id}` class. The class flips here optimistically so
 * the change feels instant, then `PATCH /api/user/preferences` persists.
 * On error we roll the class back and surface a discreet inline message.
 *
 * `onChange` lets the parent shell forward the picked id to the global
 * AmbientThemeApplier so other consumers (e.g. a mounted /api/home payload)
 * stay in sync without a refetch.
 */

const AMBIENT_LABELS: Record<AmbientId, { label: string; swatch: string }> = {
  calma: { label: "Calma", swatch: "var(--color-lavender-300)" },
  enfoque: { label: "Enfoque", swatch: "#5b6cf0" },
  energia: { label: "Energía", swatch: "#d97b4b" },
  noche: { label: "Noche", swatch: "#3a3340" },
};

function applyBodyClass(next: AmbientId) {
  if (typeof document === "undefined") return;
  for (const id of AMBIENT_IDS) {
    document.body.classList.remove(`amb-${id}`);
  }
  document.body.classList.add(`amb-${next}`);
}

export function AmbiencePicker({
  initialAmbient,
  onChange,
}: {
  initialAmbient: AmbientId;
  onChange?: (next: AmbientId) => void;
}) {
  const [ambient, setAmbient] = useState<AmbientId>(initialAmbient);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setError(null);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setError(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function pick(next: AmbientId) {
    if (pending || next === ambient) {
      setOpen(false);
      return;
    }
    setPending(true);
    setError(null);
    const previous = ambient;
    setAmbient(next);
    applyBodyClass(next);
    try {
      await usersApi.updatePreferences({ ambient: next });
      onChange?.(next);
      setOpen(false);
    } catch {
      setAmbient(previous);
      applyBodyClass(previous);
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  const active = AMBIENT_LABELS[ambient];

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all"
        style={{
          background: "var(--color-warm-100)",
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-600)",
        }}
      >
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: active.swatch }}
        />
        <span>{active.label}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Selecciona un ambiente"
          className="absolute right-0 z-40 mt-2 w-48 rounded-2xl border p-1 shadow-lg"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--color-warm-200)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {AMBIENT_IDS.map((id) => {
            const opt = AMBIENT_LABELS[id];
            const isActive = id === ambient;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                disabled={pending}
                onClick={() => pick(id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
          {error ? (
            <p
              className="mt-1 px-3 py-1 text-xs"
              style={{ color: "var(--color-error-text)" }}
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
