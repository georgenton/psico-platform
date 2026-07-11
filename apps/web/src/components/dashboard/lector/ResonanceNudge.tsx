"use client";

import { useEffect, useState } from "react";
import type { ChapterConcept } from "@psico/types";

/**
 * ResonanceNudge — Fase E (ARC cycle: Anchor → Relate → Confirm).
 *
 * Shown once per chapter+session after the user creates a highlight (the
 * anchor). It RELATES the mark to the chapter's concept and asks for an
 * explicit CONFIRMATION — only that tap persists a Resonance and feeds the
 * map. Dismissing stores nothing.
 */
export function ResonanceNudge({
  concept,
  bookSlug,
  chapterOrder,
  apiBase,
  token,
  onClose,
}: {
  concept: ChapterConcept;
  bookSlug: string;
  chapterOrder: number;
  apiBase: string;
  token: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"offer" | "saving" | "done" | "error">(
    "offer",
  );

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [phase, onClose]);

  async function confirm() {
    setPhase("saving");
    try {
      const res = await fetch(`${apiBase}/resonances`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conceptKey: concept.key,
          conceptLabel: concept.label,
          bookSlug,
          chapterOrder,
          source: "highlight",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 55,
        width: "min(340px, calc(100vw - 48px))",
        background: "var(--bg-surface, #fff)",
        border: "1.5px solid var(--color-lavender-200, #ddd6ee)",
        borderRadius: 16,
        boxShadow: "0 8px 30px rgba(60, 45, 90, 0.14)",
        padding: 16,
      }}
    >
      {phase === "done" ? (
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
          🌱 Añadido a tu mapa. Puedes verlo (y quitarlo) en{" "}
          <b>Mis resonancias</b>.
        </p>
      ) : (
        <>
          <p
            style={{
              margin: 0,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "var(--color-warm-700)",
            }}
          >
            Marcaste algo en este capítulo. ¿Te resonó el tema{" "}
            <b>«{concept.label}»</b>? Solo entra a tu mapa si tú lo confirmas.
          </p>
          {phase === "error" ? (
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12,
                color: "var(--color-rose-600, #b25454)",
              }}
            >
              No pudimos guardarlo. Reintenta.
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              disabled={phase === "saving"}
              onClick={() => void confirm()}
              style={{
                border: "none",
                borderRadius: 10,
                padding: "7px 12px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                color: "#fff",
                background: "var(--color-lavender-500, #8a7ab8)",
              }}
            >
              {phase === "saving" ? "Guardando…" : "🌱 Sí, añadir a mi mapa"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: "1px solid var(--color-warm-200)",
                borderRadius: 10,
                padding: "7px 12px",
                fontSize: 12.5,
                cursor: "pointer",
                background: "transparent",
                color: "var(--color-warm-600)",
              }}
            >
              Ahora no
            </button>
          </div>
        </>
      )}
    </div>
  );
}
