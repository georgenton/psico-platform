"use client";

import { useState } from "react";
import { useDiaryKey } from "@/lib/crypto/diary-key-context";

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
  const { unlock, unlocking, error, isLegacyAccount } = useDiaryKey();
  const [password, setPassword] = useState("");

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
        Tu diario se cifra en tu dispositivo con una clave derivada de tu
        contraseña. Ingrésala una vez para esta sesión.
      </p>
      <label
        htmlFor="diary-password"
        className="mt-5 block text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-warm-500)" }}
      >
        Contraseña de tu cuenta
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
      <button
        type="submit"
        disabled={unlocking || !password}
        className="mt-4 w-full rounded-xl px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--color-sage-400)" }}
      >
        {unlocking ? "Derivando clave…" : "Desbloquear"}
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
