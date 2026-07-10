"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { analyzeReflectionText, DIARY_MOODS } from "@psico/types";
import type { CreateDiaryEntryRequest } from "@psico/types";
import { encryptString } from "@psico/crypto";
import { useDiaryKey } from "@/lib/crypto/diary-key-context";
import { UnlockGate } from "@/components/dashboard/diario/UnlockGate";

/**
 * ReflexionTab — the "Reflexión" tab of the reader companion dock.
 *
 * A reflexión is an E2E-encrypted diary entry (`DiaryEntry`) about the READER
 * — what a passage stirred in them. Distinct from a nota (plaintext, about the
 * text). It carries a mood + tags and feeds the Mapa Emocional.
 *
 * Crypto: identical to the Diario composer (ActiveComposer). The plaintext is
 * encrypted in the browser with the diary key; only base64url ciphertext goes
 * on the wire. After saving we analyze the plaintext ON DEVICE and upload only
 * the numeric features (Etapa 6) — the text never leaves the device.
 *
 * Seeding: when opened from a highlighted passage we pre-fill a soft lead-in
 * that quotes the passage. The user can keep it (it gets encrypted like any
 * other entry) or delete it and write freely.
 */

/** Build the reflexión seed from a highlighted passage. */
export function reflexionSeed(passage: string): string {
  const clean = passage.trim().replace(/\s+/g, " ");
  const quote =
    clean.length > 200 ? `${clean.slice(0, 200).trimEnd()}…` : clean;
  return `Leí esto: «${quote}»\n\nMe hizo pensar en… `;
}

export function ReflexionTab({
  apiBase,
  token,
  seed,
  onSeedConsumed,
}: {
  apiBase: string;
  token: string | null;
  /** Composer pre-fill from a highlighted passage (consumed once). */
  seed: string | null;
  onSeedConsumed: () => void;
}) {
  const { key, isLegacyAccount } = useDiaryKey();

  const [text, setText] = useState("");
  const [mood, setMood] = useState<string>("ok");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed once from a highlighted passage.
  useEffect(() => {
    if (!seed) return;
    setText((prev) => (prev ? prev : seed));
    onSeedConsumed();
  }, [seed, onSeedConsumed]);

  const todayLabel = new Date().toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  async function handleSubmit() {
    if (!key || !text.trim() || !token) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = text.trim();
      const envelope = encryptString(trimmed, key);
      const excerptText =
        trimmed.length > 140 ? `${trimmed.slice(0, 140).trimEnd()}…` : trimmed;
      const excerpt = encryptString(excerptText, key);
      const body: CreateDiaryEntryRequest = {
        mood,
        kind: "free",
        textCiphertext: envelope.ciphertext,
        textNonce: envelope.nonce,
        excerptCiphertext: excerpt.ciphertext,
        excerptNonce: excerpt.nonce,
      };
      const res = await fetch(`${apiBase}/reflexiones/entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Etapa 6 — analyze on device, upload ONLY numbers. Best-effort.
      try {
        const created = (await res.json().catch(() => null)) as {
          id?: string;
        } | null;
        const features = analyzeReflectionText(trimmed);
        if (features) {
          void fetch(`${apiBase}/emotional-map/text-features`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ ...features, entryId: created?.id }),
          }).catch(() => undefined);
        }
      } catch {
        // ignore — self-knowledge signal is optional; the entry is saved
      }
      setText("");
      setSaved(true);
    } catch {
      setError("No pudimos guardar tu reflexión. Reintenta.");
    } finally {
      setSaving(false);
    }
  }

  if (isLegacyAccount) {
    return (
      <div className="flex-1 px-5 py-6">
        <p className="text-[13px]" style={{ color: "var(--color-warm-600)" }}>
          Tu cuenta aún no tiene activada la protección de privacidad. Contacta
          soporte para habilitarla antes de escribir reflexiones cifradas.
        </p>
      </div>
    );
  }

  if (!key) {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <UnlockGate context="diario" />
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex-1 px-5 py-8 text-center">
        <p className="text-[22px]" aria-hidden>
          🪷
        </p>
        <p
          className="mt-2 text-[14px] font-semibold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Guardado en tu diario
        </p>
        <p
          className="mx-auto mt-1 max-w-xs text-[12.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Tu reflexión quedó cifrada y sumó a tu Mapa Emocional.
        </p>
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setSaved(false)}
            className="rounded-full px-4 py-1.5 text-[12px] font-semibold text-white"
            style={{ background: "var(--color-sage-400)" }}
          >
            Escribir otra
          </button>
          <Link
            href="/dashboard/reflexiones"
            className="text-[12px] underline-offset-2 hover:underline"
            style={{ color: "var(--color-lavender-700)" }}
          >
            Ver en Reflexiones →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.1em]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Una reflexión es sobre ti — se cifra y solo tú la lees
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {DIARY_MOODS.map((m) => {
          const active = m.id === mood;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMood(m.id)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1 text-[11.5px] font-semibold transition-colors"
              style={
                active
                  ? {
                      background: "var(--color-warm-900)",
                      color: "var(--color-warm-50)",
                      borderColor: "var(--color-warm-900)",
                    }
                  : {
                      background: "var(--color-warm-50)",
                      color: "var(--color-warm-800)",
                      borderColor: "var(--color-warm-200)",
                    }
              }
            >
              <span>{m.emoji}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      <textarea
        rows={7}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={saving}
        placeholder="¿Qué te movió de lo que leíste? Escribe lo que necesites — nadie lo lee más que tú."
        className="mt-3 w-full resize-none rounded-xl border-[1.5px] bg-[var(--color-warm-50)] p-3 text-[13.5px] leading-relaxed outline-none focus:border-[var(--color-lavender-400)]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-800)",
        }}
      />

      <div
        className="mt-2 flex items-center justify-between text-[11px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        <span className="font-mono">{todayLabel}</span>
      </div>

      {error ? (
        <p
          className="mt-2 text-[12px]"
          role="alert"
          style={{ color: "var(--color-error-text, #B91C1C)" }}
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || !text.trim()}
        className="mt-3 w-full rounded-xl px-5 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--color-sage-400)" }}
      >
        {saving ? "Cifrando…" : "🪷 Guardar reflexión"}
      </button>
    </div>
  );
}
