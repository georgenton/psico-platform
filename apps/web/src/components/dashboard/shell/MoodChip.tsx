"use client";

import { useEffect, useRef, useState } from "react";
import { DIARY_MOODS, type DiaryMoodId } from "@psico/types";
import { moodApi } from "@psico/api-client";
import { IconChevronDown, IconMoodFace } from "./icons";

/**
 * MoodChip — Sprint B6b parity with redesign-v2 (mood-chip + mood-pop).
 *
 * Renders the chip + face-grid popover from
 * `docs/design/redesign-v2/dashboard/index.html`. Classes (`mood-chip`,
 * `mc-face`, `mood-pop`, `mp-opt`) come from `dashboard-design.css`.
 */
export function MoodChip({
  initialMood,
  onMoodChange,
}: {
  initialMood: DiaryMoodId | null;
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
  const variant = (activeOption?.id ?? "ok") as Parameters<
    typeof IconMoodFace
  >[0]["variant"];

  return (
    <div className="mood-wrap" ref={wrapperRef}>
      <button
        type="button"
        className="mood-chip"
        data-mood={activeOption?.id ?? undefined}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          activeOption
            ? `Tu ánimo: ${activeOption.label}. Cambiar.`
            : "Marcar tu ánimo"
        }
      >
        <span className="mc-face" aria-hidden>
          <IconMoodFace variant={variant} size={18} />
        </span>
        <span className="mc-txt">
          {activeOption ? (
            <>
              Hoy: <b>{activeOption.label}</b>
            </>
          ) : (
            "¿Cómo estás?"
          )}
        </span>
        <span className="mc-chev" aria-hidden>
          <IconChevronDown size={14} />
        </span>
      </button>

      <div
        className={`mood-pop${open ? " open" : ""}`}
        role="dialog"
        aria-label="Selecciona tu estado de ánimo"
      >
        <div className="mood-pop-row">
          {DIARY_MOODS.map((m) => {
            const active = m.id === mood;
            const v = m.id as Parameters<typeof IconMoodFace>[0]["variant"];
            return (
              <button
                key={m.id}
                type="button"
                className={`mp-opt${active ? ` on ${m.id}` : ""}`}
                disabled={pending}
                onClick={() => pick(m.id)}
                aria-pressed={active}
                aria-label={m.label}
              >
                <IconMoodFace variant={v} size={28} className="face" />
                <span>{m.label}</span>
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
    </div>
  );
}
