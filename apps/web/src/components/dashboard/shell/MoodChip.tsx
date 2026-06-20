"use client";

import { useEffect, useRef, useState } from "react";
import { DIARY_MOODS, type DiaryMoodId } from "@psico/types";
import { moodApi } from "@psico/api-client";

/**
 * MoodChip — Sprint B2 Topbar component.
 *
 * The chip shows "¿Cómo estás?" when the user has no mood yet, or "Hoy: X"
 * once set. Click opens a 7-swatch popover; picking a mood fires
 * `POST /api/mood` (via `moodApi.log`), updates the chip optimistically, and
 * closes the popover. On error we surface a discreet retry hint inside the
 * popover so the user doesn't lose the picked swatch silently.
 *
 * The popover dismisses on outside click + Escape. We anchor it absolutely
 * to the chip so it never affects flow.
 */
export function MoodChip({
  initialMood,
  onMoodChange,
}: {
  initialMood: DiaryMoodId | null;
  /** Fires after a successful log so the parent can refresh derived UI. */
  onMoodChange?: (mood: DiaryMoodId) => void;
}) {
  const [mood, setMood] = useState<DiaryMoodId | null>(initialMood);
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

  async function pick(next: DiaryMoodId) {
    if (pending) return;
    setPending(true);
    setError(null);
    const previous = mood;
    setMood(next);
    try {
      await moodApi.log({ mood: next });
      onMoodChange?.(next);
      setOpen(false);
    } catch {
      setMood(previous);
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  const activeOption = mood
    ? (DIARY_MOODS.find((m) => m.id === mood) ?? null)
    : null;

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all"
        style={{
          background: activeOption
            ? "var(--color-lavender-50)"
            : "var(--color-warm-100)",
          borderColor: activeOption
            ? "var(--color-lavender-200)"
            : "var(--color-warm-200)",
          color: activeOption
            ? "var(--color-lavender-700)"
            : "var(--color-warm-600)",
        }}
      >
        <span aria-hidden>{activeOption ? activeOption.emoji : "🫧"}</span>
        <span>
          {activeOption ? `Hoy: ${activeOption.label}` : "¿Cómo estás?"}
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Selecciona tu estado de ánimo"
          className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border p-3 shadow-lg"
          style={{
            background: "white",
            borderColor: "var(--color-warm-200)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <p
            className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-warm-500)" }}
          >
            Tu estado de ánimo
          </p>
          <div className="grid grid-cols-7 gap-1">
            {DIARY_MOODS.map((m) => {
              const active = m.id === mood;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={pending}
                  onClick={() => pick(m.id)}
                  title={m.label}
                  aria-label={m.label}
                  aria-pressed={active}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition-all hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background: active
                      ? "var(--color-lavender-100)"
                      : "transparent",
                    border: `1.5px solid ${
                      active ? "var(--color-lavender-300)" : "transparent"
                    }`,
                  }}
                >
                  <span aria-hidden>{m.emoji}</span>
                </button>
              );
            })}
          </div>
          {error ? (
            <p
              className="mt-2 px-1 text-xs"
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
