"use client";

import { useState } from "react";
import type {
  AuthorAiHelpResponse,
  AuthorAiIntent,
} from "@psico/types";

const INTENTS: Array<{
  key: AuthorAiIntent;
  label: string;
  description: string;
}> = [
  {
    key: "revisar",
    label: "Revisar tono",
    description:
      "Mejora cadencia y claridad sin cambiar la idea central.",
  },
  {
    key: "ejemplo",
    label: "Sugerir ejemplo",
    description:
      "Añade un ejemplo concreto de la vida cotidiana en LATAM.",
  },
  {
    key: "tono",
    label: "Cambiar tono",
    description: "Reformula con un tono más cálido y cercano.",
  },
  {
    key: "simplificar",
    label: "Simplificar",
    description: "Reduce jerga y oraciones largas (nivel B1-B2).",
  },
];

/**
 * AiHelperModal — Sprint S71.C-AI.
 *
 * Modal client-side que llama POST /api/autor/libros/:id/ai-help con
 * `{intent, text, context?}`. Muestra la sugerencia + botón "Reemplazar".
 *
 * `onAccept(text)` se invoca cuando el autor acepta la sugerencia y debe
 * sobreescribir el contenido del bloque en el editor padre.
 */
type Phase = "idle" | "loading" | "ready" | "error";

export function AiHelperModal({
  bookId,
  blockId,
  initialText,
  contextText,
  onClose,
  onAccept,
  apiBase,
  accessToken,
}: {
  bookId: string;
  blockId: string;
  initialText: string;
  contextText: string;
  onClose: () => void;
  onAccept: (text: string) => void;
  apiBase: string;
  accessToken: string;
}) {
  const [intent, setIntent] = useState<AuthorAiIntent>("revisar");
  const [text] = useState(initialText);
  const [result, setResult] = useState<AuthorAiHelpResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPhase("loading");
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${apiBase}/autor/libros/${bookId}/ai-help`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          intent,
          text,
          blockId,
          context: contextText.slice(0, 1000),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AuthorAiHelpResponse;
      setResult(data);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos generar la sugerencia.");
      setPhase("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ background: "rgba(61,46,31,0.45)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[640px] space-y-4 rounded-2xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between">
          <div>
            <p
              className="text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-lavender-500)" }}
            >
              ✨ Asistente de edición
            </p>
            <h2
              className="mt-1 text-[18px] font-bold tracking-tight"
              style={{ color: "var(--color-warm-900)" }}
            >
              Sugiere un cambio
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[16px]"
            style={{ color: "var(--color-warm-500)" }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="grid grid-cols-2 gap-2">
          {INTENTS.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => setIntent(i.key)}
              className="rounded-xl border-[1.5px] p-3 text-left transition"
              style={{
                borderColor:
                  intent === i.key
                    ? "var(--color-lavender-500)"
                    : "var(--color-warm-200)",
                background:
                  intent === i.key
                    ? "var(--color-lavender-50)"
                    : "white",
              }}
            >
              <p
                className="text-[12.5px] font-semibold"
                style={{ color: "var(--color-warm-900)" }}
              >
                {i.label}
              </p>
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                {i.description}
              </p>
            </button>
          ))}
        </div>

        <div
          className="rounded-xl p-3 text-[12.5px]"
          style={{
            background: "var(--color-warm-50)",
            color: "var(--color-warm-700)",
            border: "1px solid var(--color-warm-200)",
          }}
        >
          <p className="font-medium">Texto seleccionado:</p>
          <p className="mt-1 line-clamp-6 whitespace-pre-wrap">{text}</p>
        </div>

        {phase === "ready" && result ? (
          <div
            className="rounded-xl p-3 text-[13px]"
            style={{
              background: "var(--color-lavender-50)",
              color: "var(--color-warm-900)",
              border: "1.5px solid var(--color-lavender-200)",
            }}
          >
            <p
              className="mb-1 text-[11.5px] font-bold uppercase"
              style={{ color: "var(--color-lavender-700)" }}
            >
              {result.source === "model" ? "Sugerencia IA" : "Sugerencia (modo local)"}
            </p>
            <p className="whitespace-pre-wrap">{result.suggestion}</p>
          </div>
        ) : null}

        {error ? (
          <p
            className="text-[12px]"
            style={{ color: "var(--color-rose-700)" }}
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[12.5px] font-medium"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-700)",
            }}
          >
            Cerrar
          </button>
          {phase === "ready" && result ? (
            <button
              type="button"
              onClick={() => {
                onAccept(result.suggestion);
                onClose();
              }}
              className="rounded-full px-4 py-2 text-[12.5px] font-semibold"
              style={{
                background: "var(--color-lavender-500)",
                color: "white",
              }}
            >
              Reemplazar bloque
            </button>
          ) : (
            <button
              type="button"
              onClick={run}
              disabled={phase === "loading"}
              className="rounded-full px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
              style={{
                background: "var(--color-lavender-500)",
                color: "white",
              }}
            >
              {phase === "loading" ? "Generando…" : "Generar sugerencia"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
