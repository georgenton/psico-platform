"use client";

import { useState } from "react";
import { isValidSeedPhrase, seedPhraseToMasterKey } from "@psico/crypto";
import { useDiaryKey } from "@/lib/crypto/diary-key-context";
import { PrivacyInfoButton } from "@/components/privacy/PrivacyInfoButton";

/**
 * UnlockGate — password prompt that derives the diary key.
 *
 * Shown when `useDiaryKey().key === null`. The user enters their account
 * password once per tab session; the Argon2id derivation (~500ms desktop,
 * ~800ms mid-range phone) runs locally and the resulting key never touches
 * the network or disk.
 *
 * UX considerations:
 *   - The button shows a spinner during derivation so the user knows we're
 *     "thinking" — Argon2id is intentionally slow.
 *   - On failure we show a generic "no pudimos derivar" message; we never
 *     distinguish "wrong password" from "tampered salt" because both mean
 *     the same to the user.
 *   - For legacy accounts (cryptoSalt === null) we render an inactive note
 *     instead of the password form.
 */
export function UnlockGate() {
  const {
    unlock,
    adoptMasterKey,
    unlocking,
    error,
    isLegacyAccount,
    remember,
    setRemember,
  } = useDiaryKey();
  const [password, setPassword] = useState("");
  // `mode` toggles between the standard password unlock and the seed-phrase
  // recovery unlock. The recovery path skips Argon2id entirely — the BIP39
  // phrase IS the serialized master key.
  const [mode, setMode] = useState<"password" | "seed">("password");
  const [seedText, setSeedText] = useState("");
  const [seedError, setSeedError] = useState<string | null>(null);

  function handleSeedUnlock() {
    setSeedError(null);
    const trimmed = seedText.trim();
    if (!isValidSeedPhrase(trimmed)) {
      setSeedError(
        "Esta frase no es válida. Revisa que sean exactamente 12 palabras y que estén bien escritas.",
      );
      return;
    }
    try {
      const recovered = seedPhraseToMasterKey(trimmed);
      adoptMasterKey(recovered);
      // Zero our local copy — adoptMasterKey takes its own.
      recovered.fill(0);
      setSeedText("");
    } catch {
      setSeedError(
        "No pudimos recuperar la clave a partir de esta frase. Verifícala palabra por palabra.",
      );
    }
  }

  if (isLegacyAccount) {
    return (
      <div
        className="rounded-2xl border-[1.5px] bg-white p-6"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <div
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-[22px]"
          style={{ background: "var(--color-warm-100)" }}
        >
          🔓
        </div>
        <h3
          className="mt-4 text-center text-[18px] font-bold leading-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Tu cuenta no tiene cifrado E2E activado
        </h3>
        <p
          className="mx-auto mt-2 max-w-md text-center text-[13px] leading-relaxed"
          style={{ color: "var(--color-warm-500)" }}
        >
          Las cuentas creadas antes del módulo de cripto no tienen un salt
          Argon2id. Si quieres activarlo, contacta soporte — vamos a generar uno
          nuevo y re-cifrar tu diario.
        </p>
      </div>
    );
  }

  if (mode === "seed") {
    return (
      <div
        className="rounded-2xl border-[1.5px] bg-white p-6"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <div
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-[22px]"
          style={{ background: "var(--color-lavender-50)" }}
        >
          🔑
        </div>
        <h3
          className="mt-4 text-center text-[18px] font-bold leading-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Recupera con tu frase de respaldo
        </h3>
        <p
          className="mx-auto mt-2 max-w-md text-center text-[13px] leading-relaxed"
          style={{ color: "var(--color-warm-500)" }}
        >
          Escribe las 12 palabras separadas por espacio. Usa esta opción
          únicamente si olvidaste tu contraseña.
        </p>
        <label
          htmlFor="diary-seed"
          className="mt-5 block text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-warm-500)" }}
        >
          Frase de 12 palabras
        </label>
        <textarea
          id="diary-seed"
          value={seedText}
          onChange={(e) => setSeedText(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          rows={4}
          placeholder="palabra1 palabra2 palabra3 …"
          className="mt-2 w-full rounded-xl border-[1.5px] bg-[var(--color-warm-50)] px-3 py-2.5 text-[13px] font-mono outline-none focus:border-[var(--color-lavender-400)]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-800)",
          }}
        />
        {seedError ? (
          <p
            className="mt-2 text-[12px]"
            style={{ color: "var(--color-error-text, #B91C1C)" }}
            role="alert"
          >
            {seedError}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!seedText.trim()}
          onClick={handleSeedUnlock}
          className="mt-4 w-full rounded-xl px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-sage-400)" }}
        >
          Recuperar acceso
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("password");
            setSeedError(null);
            setSeedText("");
          }}
          className="mt-3 w-full text-center text-[12px] underline"
          style={{ color: "var(--color-warm-500)" }}
        >
          Volver a usar contraseña
        </button>
        <p
          className="mt-3 text-center text-[11px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          ⓘ La recuperación es 100% local. Tu frase no se envía al servidor.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (password) unlock(password);
      }}
      className="rounded-2xl border-[1.5px] bg-white p-6"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div
        aria-hidden
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-[22px]"
        style={{ background: "var(--color-lavender-50)" }}
      >
        🔒
      </div>
      <h3
        className="mt-4 text-center text-[18px] font-bold leading-tight"
        style={{ color: "var(--color-warm-900)" }}
      >
        Desbloquea tu diario
      </h3>
      <p
        className="mx-auto mt-2 max-w-md text-center text-[13px] leading-relaxed"
        style={{ color: "var(--color-warm-500)" }}
      >
        Tu diario se cifra en tu dispositivo. Escribe{" "}
        <b style={{ color: "var(--color-warm-700)" }}>
          la misma contraseña con la que iniciaste sesión
        </b>{" "}
        para abrirlo. Solo tú puedes leerlo.
      </p>
      <div className="mt-2 flex justify-center">
        <PrivacyInfoButton variant="diario" label="¿Por qué?" />
      </div>
      <label
        htmlFor="diary-password"
        className="mt-5 block text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-warm-500)" }}
      >
        Contraseña de tu cuenta (la misma del login)
      </label>
      <input
        id="diary-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        disabled={unlocking}
        className="mt-2 w-full rounded-xl border-[1.5px] bg-[var(--color-warm-50)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--color-lavender-400)]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-800)",
        }}
      />
      {error ? (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "var(--color-error-text, #B91C1C)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* Remember-vs-ask control. Default is "recordar" (checked). Unchecking
          it means we never persist the key — each session re-prompts. */}
      <label
        className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5"
        style={{ background: "var(--color-warm-50)" }}
      >
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          disabled={unlocking}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-sage-500,#5B8A72)]"
        />
        <span className="text-[12.5px] leading-snug">
          <span
            className="font-semibold"
            style={{ color: "var(--color-warm-800)" }}
          >
            Recordar en este dispositivo
          </span>
          <span
            className="mt-0.5 block"
            style={{ color: "var(--color-warm-500)" }}
          >
            {remember
              ? "No te pediremos la contraseña la próxima vez en este equipo. Desmárcalo si es un equipo compartido."
              : "Te pediremos la contraseña cada vez que entres. Márcalo para no repetirla en tu equipo personal."}
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={unlocking || !password}
        className="mt-4 w-full rounded-xl px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--color-sage-400)" }}
      >
        {unlocking ? "Derivando clave…" : "Desbloquear"}
      </button>
      <button
        type="button"
        onClick={() => setMode("seed")}
        className="mt-3 w-full text-center text-[12px] underline"
        style={{ color: "var(--color-warm-500)" }}
      >
        Olvidé mi contraseña — usar frase de respaldo
      </button>
      <p
        className="mt-3 text-center text-[11px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        ⓘ La derivación toma ~1 segundo. Tu contraseña nunca sale del
        dispositivo.
      </p>
    </form>
  );
}
