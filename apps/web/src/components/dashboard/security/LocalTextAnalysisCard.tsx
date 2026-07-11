"use client";

import { useState } from "react";
import { setTextAnalysisConsentCache } from "@/lib/text-analysis-consent";

/**
 * LocalTextAnalysisCard — Fase D (V2, decision L4).
 *
 * Explicit consent for the ON-DEVICE reflection text analysis (TXT-L1).
 * Default off. Turning it off asks for confirmation because the server also
 * deletes every derived numeric row (consent cascade). The card never touches
 * the diary crypto — the text itself stays E2E-encrypted either way.
 */
export function LocalTextAnalysisCard({
  initialEnabled,
  apiBase,
  token,
}: {
  initialEnabled: boolean;
  apiBase: string;
  token: string | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(next: boolean) {
    if (!token) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/user/privacy`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ localTextAnalysis: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEnabled(next);
      setTextAnalysisConsentCache(next);
      setConfirmingOff(false);
      setFlash(
        next
          ? "Activado. Tus próximas reflexiones se analizarán en tu dispositivo."
          : "Desactivado. Borramos los datos derivados de tus reflexiones.",
      );
      setTimeout(() => setFlash(null), 4000);
    } catch {
      setError("No pudimos guardar el cambio. Reintenta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-bold">
            Análisis del lenguaje de tus reflexiones
          </h2>
          <p
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: "var(--color-warm-600)" }}
          >
            Con tu permiso, la app analiza el texto de tus reflexiones{" "}
            <b>en tu dispositivo</b> — el texto nunca sale de él; solo suben
            números (frecuencias de tipos de palabras) que ayudan a tu Mapa
            Emocional. Si lo desactivas, borramos esos datos derivados.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Análisis del lenguaje de tus reflexiones"
          disabled={pending}
          onClick={() => {
            if (enabled) setConfirmingOff(true);
            else void save(true);
          }}
          style={{
            width: 44,
            height: 26,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
            background: enabled
              ? "var(--color-sage-500, #7a9b7a)"
              : "var(--color-warm-200)",
            position: "relative",
            transition: "background 150ms",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: enabled ? 21 : 3,
              width: 20,
              height: 20,
              borderRadius: 999,
              background: "#fff",
              transition: "left 150ms",
            }}
          />
        </button>
      </div>

      {confirmingOff ? (
        <div
          className="mt-3 rounded-xl p-3 text-[13px]"
          style={{
            background: "var(--color-warm-50, #faf7f2)",
            border: "1px solid var(--color-warm-200)",
          }}
        >
          <p style={{ margin: 0, color: "var(--color-warm-700)" }}>
            Al desactivarlo también <b>borramos</b> los datos numéricos ya
            derivados de tus reflexiones. ¿Continuar?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => void save(false)}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white"
              style={{ background: "var(--color-rose-500, #c96a6a)" }}
            >
              Desactivar y borrar
            </button>
            <button
              type="button"
              onClick={() => setConfirmingOff(false)}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
              style={{
                border: "1px solid var(--color-warm-300)",
                color: "var(--color-warm-700)",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {flash ? (
        <p
          className="mt-3 text-[12.5px]"
          style={{ color: "var(--color-sage-600, #5d7f5d)" }}
        >
          {flash}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-3 text-[12.5px]"
          style={{ color: "var(--color-rose-600, #b25454)" }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
