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
 *   password, the only path back to their entries is a 24-word BIP39 phrase
 *   that encodes the masterKey. We show it once, ask the user to confirm
 *   three random positions, and then mark `cryptoSeedShownAt` on the server
 *   so we don't bother them again.
 *
 * Why the confirm step (3 random words, not all 24):
 *   - 24-word retype is exhausting and trains "click to dismiss" behavior.
 *   - 3-word confirm at random positions proves the user actually wrote it
 *     down (the chance of guessing three specific BIP39 words is ~1 in 8e9).
 *   - If they fail, we surface a soft retry — no acknowledgment is sent.
 *
 * Lifecycle:
 *   - `masterKey` comes from DiaryKeyContext (the first unlock seeds it).
 *   - We DO NOT store the seed phrase anywhere — only render it on screen.
 *   - On confirm, POST `/api/user/crypto-seed-acknowledged` and refresh the
 *     route so the next load doesn't re-trigger the modal.
 *   - On dismiss without confirm, we keep `cryptoSeedShownAt` null so the
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

  // Pick 3 positions to confirm. Stable across re-renders by storing in state.
  const [confirmIndexes] = useState<number[]>(() => pickThreeIndexes());
  const [step, setStep] = useState<"view" | "confirm">("view");
  const [inputs, setInputs] = useState<string[]>(["", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleConfirm() {
    const ok = confirmIndexes.every(
      (idx, slot) =>
        inputs[slot].trim().toLowerCase() === words[idx].toLowerCase(),
    );
    if (!ok) {
      setError(
        "Una o más palabras no coinciden. Revísalas — el orden y la ortografía importan.",
      );
      return;
    }
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
        className="w-full max-w-[560px] overflow-hidden rounded-2xl bg-white shadow-2xl"
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
            Anota tu frase de recuperación
          </h2>
          <p
            className="mx-auto mt-1.5 max-w-md text-center text-[12px] leading-relaxed"
            style={{ color: "var(--color-warm-600)" }}
          >
            Si olvidas tu contraseña, estas 24 palabras son la única forma de
            recuperar tu diario. <strong>No las guardamos.</strong>
          </p>
        </div>

        {step === "view" ? (
          <div className="px-6 pb-6 pt-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {words.map((w, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                  style={{ background: "var(--color-warm-50)" }}
                >
                  <span
                    className="w-6 text-right text-[10px] font-mono"
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
            <div
              className="mt-4 rounded-xl p-3 text-[11px] leading-relaxed"
              style={{
                background: "var(--color-warm-50)",
                color: "var(--color-warm-600)",
                border: "1px solid var(--color-warm-200)",
              }}
            >
              <p>
                <strong>Cómo guardarlas bien:</strong> en papel, en un lugar
                seguro. Evita capturas de pantalla — son fáciles de robar.
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white"
                style={{ background: "var(--color-sage-400)" }}
              >
                Las anoté, continuar
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-6 pt-5">
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--color-warm-700)" }}
            >
              Para confirmar que las anotaste, escribe las palabras que
              corresponden a estas posiciones:
            </p>
            <div className="mt-4 space-y-3">
              {confirmIndexes.map((idx, slot) => (
                <label
                  key={idx}
                  className="block text-[12px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  Palabra #{idx + 1}
                  <input
                    type="text"
                    value={inputs[slot]}
                    onChange={(e) => {
                      const next = [...inputs];
                      next[slot] = e.target.value;
                      setInputs(next);
                    }}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="mt-1.5 w-full rounded-xl border-[1.5px] bg-[var(--color-warm-50)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--color-lavender-400)]"
                    style={{
                      borderColor: "var(--color-warm-200)",
                      color: "var(--color-warm-800)",
                    }}
                  />
                </label>
              ))}
            </div>
            {error ? (
              <p
                className="mt-3 text-[12px]"
                style={{ color: "var(--color-error-text, #B91C1C)" }}
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  setStep("view");
                  setInputs(["", "", ""]);
                  setError(null);
                }}
                className="rounded-xl px-5 py-2.5 text-[13px] font-medium"
                style={{ color: "var(--color-warm-600)" }}
              >
                ← Volver a ver las palabras
              </button>
              <button
                type="button"
                disabled={submitting || inputs.some((v) => !v.trim())}
                onClick={handleConfirm}
                className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--color-sage-400)" }}
              >
                {submitting ? "Guardando…" : "Confirmar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Pick three distinct indexes in [0, 24). The exact distribution doesn't
 * matter cryptographically — we just want a non-trivial proof-of-write.
 */
function pickThreeIndexes(): number[] {
  const chosen = new Set<number>();
  while (chosen.size < 3) {
    chosen.add(Math.floor(Math.random() * 24));
  }
  return [...chosen].sort((a, b) => a - b);
}
