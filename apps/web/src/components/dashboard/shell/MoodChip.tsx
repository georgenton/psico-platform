"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHECKIN_SCALE,
  DIARY_MOODS,
  type CheckinItem,
  type DiaryMoodId,
} from "@psico/types";
import { moodApi } from "@psico/api-client";
import { IconChevronDown, IconMoodFace } from "./icons";

/**
 * MoodChip — Sprint B6b parity with redesign-v2 (mood-chip + mood-pop),
 * extended with the Etapa-2 micro-checkin: after the mood pick, the popover
 * asks ONE rotating 5-second question (0–4 scale) that feeds the Emotional
 * Map's Claridad/Compasión/Consciencia axes as MEASURED signals. The checkin
 * is best-effort — any failure just closes the popover like before.
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
  const [checkinItem, setCheckinItem] = useState<CheckinItem | null>(null);
  const [thanks, setThanks] = useState(false);
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

  function closeAll() {
    setOpen(false);
    setCheckinItem(null);
    setThanks(false);
  }

  async function pick(next: DiaryMoodId) {
    if (pending) return;
    setPending(true);
    setError(null);
    const previous = mood;
    setMood(next);
    try {
      await moodApi.log({ mood: next });
      onMoodChange?.(next);
      // Etapa 2 — best-effort follow-up question. Any failure = close as before.
      try {
        const { item } = await moodApi.nextCheckin();
        if (item) {
          setCheckinItem(item);
        } else {
          closeAll();
        }
      } catch {
        closeAll();
      }
    } catch {
      setMood(previous);
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  async function answerCheckin(score: number) {
    if (pending || !checkinItem) return;
    setPending(true);
    try {
      await moodApi.logCheckin({ itemKey: checkinItem.key, score });
      setThanks(true);
      setTimeout(closeAll, 1200);
    } catch {
      closeAll();
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
        aria-label={
          checkinItem ? "Pregunta del día" : "Selecciona tu estado de ánimo"
        }
      >
        {thanks ? (
          <p
            style={{
              margin: 0,
              padding: "10px 6px",
              font: "600 13.5px/1.4 var(--font-sans)",
              color: "var(--color-sage-600)",
              textAlign: "center",
            }}
          >
            ¡Gracias! Esto alimenta tu Mapa Emocional.
          </p>
        ) : checkinItem ? (
          <div style={{ padding: "4px 2px" }}>
            <p
              style={{
                margin: "0 0 10px",
                font: "700 13.5px/1.4 var(--font-sans)",
                color: "var(--color-warm-900)",
              }}
            >
              {checkinItem.text}
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CHECKIN_SCALE.map((label, score) => (
                <button
                  key={label}
                  type="button"
                  disabled={pending}
                  onClick={() => answerCheckin(score)}
                  style={{
                    flex: "1 1 auto",
                    padding: "7px 10px",
                    borderRadius: 9999,
                    border: "1px solid var(--color-warm-200)",
                    background: "#fff",
                    font: "600 12px/1 var(--font-sans)",
                    color: "var(--color-warm-700)",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={closeAll}
              style={{
                marginTop: 10,
                background: "none",
                border: "none",
                font: "600 11.5px/1 var(--font-sans)",
                color: "var(--color-warm-400)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Omitir por hoy
            </button>
          </div>
        ) : (
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
        )}
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
