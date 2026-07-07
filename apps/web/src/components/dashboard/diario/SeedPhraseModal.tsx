"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { masterKeyToSeedPhrase } from "@psico/crypto";

/**
 * SeedPhraseModal — one-time backup flow shown right after the user unlocks
 * their diary for the first time.
 *
 * Why this exists:
 *   ADR 0007 forbids server-side password recovery. If a user forgets their
 *   password, the only path back to their entries is a 12-word BIP39 phrase
 *   that encodes the masterKey (ADR 0007 §G v2 — 16-byte key = 12 words).
 *
 * UX (2026-07 redesign — "suave, rápido, cómodo"):
 *   - 12 words (not 24) — halves the visual wall.
 *   - Guardar en un toque: "Copiar" + "Descargar .txt". No re-type quiz.
 *   - One checkbox: "Ya las guardé en un lugar seguro." Then continue.
 *   - The words can be viewed again in Ajustes → Seguridad, so this is a
 *     nudge, not a last-chance exam.
 *
 * Lifecycle:
 *   - `masterKey` comes from DiaryKeyContext (the first unlock seeds it).
 *   - We DO NOT store the seed phrase anywhere — only render it on screen.
 *   - On continue, POST `/api/user/crypto-seed-acknowledged` and refresh the
 *     route so the next load doesn't re-trigger the modal.
 *   - On dismiss without continuing, `cryptoSeedShownAt` stays null so the
 *     modal pops again on next unlock.
 */
export function SeedPhraseModal({
  masterKey,
  apiBase,
  token,
  onAcknowledged,
}: {
  masterKey: Uint8Array;
  apiBase: string;
  token: string | null;
  /** Called after the server confirms; the host hides the modal. */
  onAcknowledged: () => void;
}) {
  const router = useRouter();
  const phrase = useMemo(() => masterKeyToSeedPhrase(masterKey), [masterKey]);
  const words = useMemo(() => phrase.split(" "), [phrase]);

  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleCopy() {
    void navigator.clipboard
      ?.writeText(phrase)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => {
        // Clipboard can be blocked; the download button is the fallback.
      });
  }

  function handleDownload() {
    // Numbered, human-readable text so a user opening the file later can
    // read it without our app. No app branding on the filename to reduce
    // "this is a crypto key" signal for anyone who finds the file.
    const numbered = words.map((w, i) => `${i + 1}. ${w}`).join("\n");
    const contents =
      "Frase de recuperación de tu diario\n" +
      "Guárdala en un lugar seguro. Con estas 12 palabras puedes recuperar " +
      "tu diario si olvidas tu contraseña.\n\n" +
      numbered +
      "\n";
    const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "frase-de-recuperacion.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleContinue() {
    setSubmitting(true);
    setError(null);
    void fetch(`${apiBase}/user/crypto-seed-acknowledged`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => {
        if (!res.ok) throw new Error("ACK_FAILED");
        onAcknowledged();
        router.refresh();
      })
      .catch(() => {
        setError(
          "No pudimos guardar la confirmación. Reintenta en unos segundos.",
        );
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="seed-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
    >
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ border: "1.5px solid var(--color-warm-200)" }}
      >
        <div
          className="px-6 pb-2 pt-6"
          style={{ background: "var(--color-lavender-50)" }}
        >
          <div
            aria-hidden
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-[20px]"
            style={{ background: "white" }}
          >
            🔑
          </div>
          <h2
            id="seed-modal-title"
            className="mt-3 text-center text-[20px] font-bold leading-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            Guarda tu frase de recuperación
          </h2>
          <p
            className="mx-auto mt-1.5 max-w-md text-center text-[12px] leading-relaxed"
            style={{ color: "var(--color-warm-600)" }}
          >
            Si olvidas tu contraseña, estas 12 palabras son la única forma de
            recuperar tu diario. <strong>No las guardamos por ti.</strong>
          </p>
        </div>

        <div className="px-6 pb-6 pt-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {words.map((w, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                style={{ background: "var(--color-warm-50)" }}
              >
                <span
                  className="w-5 text-right text-[10px] font-mono"
                  style={{ color: "var(--color-warm-400)" }}
                >
                  {i + 1}.
                </span>
                <span
                  className="text-[13px] font-medium"
                  style={{ color: "var(--color-warm-800)" }}
                >
                  {w}
                </span>
              </div>
            ))}
          </div>

          {/* Save in one tap */}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 rounded-xl border-[1.5px] bg-white px-4 py-2.5 text-[13px] font-semibold transition-colors"
              style={{
                borderColor: "var(--color-warm-200)",
                color: "var(--color-warm-700)",
              }}
            >
              {copied ? "✓ Copiadas" : "Copiar"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 rounded-xl border-[1.5px] bg-white px-4 py-2.5 text-[13px] font-semibold transition-colors"
              style={{
                borderColor: "var(--color-warm-200)",
                color: "var(--color-warm-700)",
              }}
            >
              Descargar
            </button>
          </div>

          <p
            className="mt-3 text-[11px] leading-relaxed"
            style={{ color: "var(--color-warm-500)" }}
          >
            Guárdalas en un lugar seguro — en papel o en tu gestor de
            contraseñas. Podrás volver a verlas cuando quieras en{" "}
            <strong>Ajustes → Seguridad</strong>.
          </p>

          {/* One soft confirmation */}
          <label
            className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-xl p-3"
            style={{ background: "var(--color-warm-50)" }}
          >
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: "var(--color-sage-400)" }}
            />
            <span
              className="text-[13px] font-medium"
              style={{ color: "var(--color-warm-700)" }}
            >
              Ya las guardé en un lugar seguro
            </span>
          </label>

          {error ? (
            <p
              className="mt-3 text-[12px]"
              style={{ color: "var(--color-error-text, #B91C1C)" }}
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={!saved || submitting}
              onClick={handleContinue}
              className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-sage-400)" }}
            >
              {submitting ? "Guardando…" : "Continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
