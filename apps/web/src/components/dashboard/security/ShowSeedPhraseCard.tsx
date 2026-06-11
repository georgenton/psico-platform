"use client";

import { useState } from "react";
import { masterKeyToSeedPhrase } from "@psico/crypto";
import {
  DiaryKeyProvider,
  useDiaryKey,
} from "@/lib/crypto/diary-key-context";
import { UnlockGate } from "@/components/dashboard/diario/UnlockGate";

/**
 * ShowSeedPhraseCard — Sprint seed-recovery.
 *
 * Permite que el usuario vea (otra vez) su frase de respaldo de 24
 * palabras después del modal post-onboarding inicial. Requiere desbloquear
 * el Diario primero — la seed phrase se deriva del masterKey, así que el
 * usuario debe autenticarse con la password (o con la seed misma).
 *
 * Por qué seguridad extra: si alguien tiene acceso a la sesión activa
 * pero no a la password, no debería poder ver la frase sin volver a
 * autenticarse. Esto es paranoia razonable — la frase deja al portador
 * descifrar TODO el Diario para siempre.
 */
export function ShowSeedPhraseCard({
  cryptoSalt,
}: {
  cryptoSalt: string | null;
}) {
  return (
    <DiaryKeyProvider cryptoSalt={cryptoSalt}>
      <Inner />
    </DiaryKeyProvider>
  );
}

function Inner() {
  const { masterKey } = useDiaryKey();
  const [step, setStep] = useState<"idle" | "unlocking" | "shown">("idle");
  const [revealed, setRevealed] = useState<string | null>(null);

  // When unlock completes, the context gets masterKey. We don't auto-reveal
  // — the user still has to click "Mostrar mi frase" so they're aware of
  // the screen-capture risk window.
  function reveal() {
    if (!masterKey) {
      setStep("unlocking");
      return;
    }
    setRevealed(masterKeyToSeedPhrase(masterKey));
    setStep("shown");
  }

  function hide() {
    setRevealed(null);
    setStep("idle");
  }

  if (step === "unlocking") {
    return (
      <section
        className="rounded-2xl border-[1.5px] bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <h2
          className="text-[16px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Mi frase de respaldo
        </h2>
        <p
          className="mt-1 text-[12.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Para ver tu frase, primero desbloquea tu Diario.
        </p>
        <div className="mt-4">
          <UnlockGate />
        </div>
        {masterKey ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={reveal}
              className="rounded-full px-4 py-2 text-[12.5px] font-semibold"
              style={{
                background: "var(--color-lavender-500)",
                color: "white",
              }}
            >
              Mostrar mi frase →
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-[16px] font-bold tracking-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            Mi frase de respaldo
          </h2>
          <p
            className="mt-1 text-[12.5px] leading-relaxed"
            style={{ color: "var(--color-warm-500)" }}
          >
            Tus 24 palabras de recuperación. Si olvidas tu contraseña, son la
            única forma de recuperar tu Diario. Guárdalas en un lugar seguro:
            offline preferentemente — un papel en tu casa, no una nota digital.
          </p>
        </div>
      </header>

      {revealed ? (
        <RevealedSeed words={revealed} onHide={hide} />
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p
            className="text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {masterKey
              ? "Tu Diario está desbloqueado. Listo para mostrar."
              : "Necesitas desbloquear tu Diario primero."}
          </p>
          <button
            type="button"
            onClick={reveal}
            className="rounded-full px-4 py-2 text-[12.5px] font-semibold"
            style={{
              background: "var(--color-lavender-500)",
              color: "white",
            }}
          >
            Mostrar mi frase
          </button>
        </div>
      )}

      <footer
        className="mt-4 rounded-xl p-3 text-[11.5px]"
        style={{
          background: "var(--color-rose-50)",
          color: "var(--color-rose-700)",
        }}
      >
        ⚠️ Cualquiera con estas 24 palabras puede descifrar todo tu Diario para
        siempre. Tratálas como tu password — no las compartas, no las saques
        de tu dispositivo sin precauciones.
      </footer>
    </section>
  );
}

function RevealedSeed({
  words,
  onHide,
}: {
  words: string;
  onHide: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function onCopy() {
    void navigator.clipboard.writeText(words);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const parts = words.split(/\s+/);
  return (
    <div className="mt-4 space-y-3">
      <ol
        className="grid grid-cols-2 gap-2 rounded-xl border-[1.5px] p-4 text-[13px] sm:grid-cols-4"
        style={{
          borderColor: "var(--color-lavender-300)",
          background: "var(--color-lavender-50)",
        }}
      >
        {parts.map((w, idx) => (
          <li
            key={`${idx}-${w}`}
            className="flex items-baseline gap-2"
            style={{ color: "var(--color-warm-900)" }}
          >
            <span
              className="font-mono text-[10.5px] font-bold"
              style={{ color: "var(--color-lavender-700)" }}
            >
              {String(idx + 1).padStart(2, "0")}.
            </span>
            <span className="font-mono">{w}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full px-3 py-1.5 text-[12px] font-medium"
          style={{
            background: copied
              ? "var(--color-sage-100)"
              : "var(--color-warm-100)",
            color: copied
              ? "var(--color-sage-700)"
              : "var(--color-warm-700)",
          }}
        >
          {copied ? "✓ Copiado" : "Copiar las 24 palabras"}
        </button>
        <button
          type="button"
          onClick={onHide}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
          style={{
            background: "var(--color-rose-100)",
            color: "var(--color-rose-700)",
          }}
        >
          Ocultar
        </button>
      </div>
    </div>
  );
}
