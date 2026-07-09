"use client";

import { useState } from "react";
import type { EmotionalMapDimension } from "@psico/types";

/**
 * MapInfoButton — the ℹ️ that opens the transparency modal.
 *
 * Answers the two questions the user asked out loud: "¿cómo se mide?" and
 * "¿cómo se va llenando?". It explains each of the 6 dimensions, what feeds
 * it today, and the privacy guarantee (we never read the text of your diary
 * or your chats — only categorical signals).
 */

const LABELS: Record<EmotionalMapDimension["key"], string> = {
  calma: "Calma",
  claridad: "Claridad",
  conexion: "Conexión",
  proposito: "Propósito",
  compasion: "Compasión",
  consciencia: "Consciencia",
};

export function MapInfoButton({
  dimensions,
}: {
  dimensions: EmotionalMapDimension[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cómo se mide tu Mapa Emocional"
        title="Cómo se mide tu Mapa Emocional"
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          border: "1.5px solid rgba(255,255,255,0.35)",
          background: "transparent",
          color: "inherit",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        i
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cómo se mide tu Mapa Emocional"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(15,13,20,0.55)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              maxHeight: "85vh",
              overflowY: "auto",
              background: "var(--bg-surface, #fff)",
              color: "var(--color-warm-900)",
              borderRadius: 20,
              border: "1.5px solid var(--color-warm-200)",
              padding: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>
                Cómo se mide tu Mapa
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 22,
                  cursor: "pointer",
                  color: "var(--color-warm-500)",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <p
              style={{
                margin: "12px 0 0",
                fontSize: 13.5,
                lineHeight: 1.6,
                color: "var(--color-warm-600)",
              }}
            >
              Tu mapa no mide cuánto haces, sino cuánto te vas comprendiendo. Se
              arma con seis dimensiones. Cada una se “enciende” cuando reúne
              señales suficientes — hasta entonces la verás como{" "}
              <b>Reuniendo datos</b> en lugar de un número inventado.
            </p>

            <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
              {dimensions.map((dim) => (
                <div key={dim.key}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <b style={{ fontSize: 14 }}>{LABELS[dim.key]}</b>
                    <span
                      style={{
                        fontSize: 11.5,
                        color: "var(--color-warm-500)",
                      }}
                    >
                      {dim.confidence >= 0.15
                        ? `${Math.round(dim.value * 100)}%`
                        : "Reuniendo datos"}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "3px 0 0",
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: "var(--color-warm-600)",
                    }}
                  >
                    {dim.sources}
                  </p>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 14,
                background: "var(--color-sage-50, #f0f5f0)",
                border: "1px solid var(--color-sage-100, #dfeadf)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: "var(--color-warm-700)",
                }}
              >
                🔒 <b>Privacidad primero.</b> El análisis nunca lee el texto de
                tu diario ni de tus conversaciones con Eco — están cifrados de
                extremo a extremo. Solo usamos señales sin contenido: tu ánimo,
                tus etiquetas, con qué frecuencia y a qué horas escribes, lees o
                conversas.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
