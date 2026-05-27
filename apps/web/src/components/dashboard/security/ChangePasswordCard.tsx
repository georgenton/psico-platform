"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DiaryRawCiphersResponse,
  PasswordChangeWithRekeyRequest,
  PasswordChangeWithRekeyResponse,
} from "@psico/types";
import {
  bytesToBase64Url,
  decryptString,
  deriveMasterKey,
  deriveSubKey,
  DIARY_KEY_INFO,
  encryptString,
  randomBytes,
} from "@psico/crypto";

import { useDiaryKey } from "@/lib/crypto/diary-key-context";

/**
 * ChangePasswordCard — password rotation with end-to-end re-encrypt.
 *
 * The hard part of E2E crypto is exactly this flow: a user wants to
 * change their password, but the server can NEVER see their plaintext.
 * The naive approach (just update bcrypt hash) would orphan every diary
 * entry: the new password derives a different master key, so the old
 * ciphertexts become permanently undecryptable.
 *
 * Algorithm (ADR 0007 §F):
 *   1. The user must already be unlocked — we read the OLD master key
 *      from DiaryKeyContext. If they're locked, we refuse and tell them
 *      to unlock first. (We could ask for the old password again here,
 *      but the UX of "go decrypt your diary, then come back" is clearer.)
 *   2. Verify the current password on the server side by sending it as
 *      part of the rekey request — bcrypt.compare happens server-side.
 *   3. Locally: generate a fresh 16-byte cryptoSalt.
 *   4. Locally: derive NEW master key = Argon2id(newPassword, newSalt).
 *   5. Locally: fetch all entries' raw ciphers, decrypt each with the
 *      OLD diaryKey, re-encrypt each with the NEW diaryKey.
 *   6. POST the bundle to `/user/password-change-with-rekey`. The server
 *      runs everything in a single transaction: bcrypt(newPassword),
 *      update User.passwordHash + cryptoSalt, UPDATE each DiaryEntry,
 *      revoke all refresh tokens.
 *   7. Adopt the new master key into DiaryKeyContext so the user can keep
 *      writing without re-unlocking.
 *
 * If any step fails, NOTHING changes server-side (transaction rolls back).
 * The client may have spent CPU cycles on Argon2id + decrypt/encrypt — no
 * data loss, just a retry.
 */
export function ChangePasswordCard({
  cryptoSalt,
  apiBase,
  token,
}: {
  cryptoSalt: string | null;
  apiBase: string;
  token: string | null;
}) {
  const router = useRouter();
  const {
    masterKey: oldMasterKey,
    key: oldDiaryKey,
    adoptMasterKey,
  } = useDiaryKey();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "deriving" | "fetching" | "reencrypting" | "submitting" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [rekeyedCount, setRekeyedCount] = useState<number | null>(null);

  const isLegacyAccount = cryptoSalt === null;
  const unlocked = oldMasterKey !== null && oldDiaryKey !== null;

  async function handleSubmit() {
    setError(null);

    // ── Validation ─────────────────────────────────────────────────────────
    if (isLegacyAccount) {
      setError("Tu cuenta no tiene cifrado E2E activado.");
      return;
    }
    if (!unlocked) {
      setError(
        "Necesitas desbloquear tu diario primero (Diario → Desbloquear). Luego vuelve a esta página.",
      );
      return;
    }
    if (!currentPassword) {
      setError("Ingresa tu contraseña actual.");
      return;
    }
    if (newPassword.length < 10) {
      setError("La nueva contraseña debe tener al menos 10 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    if (!token) {
      setError("Sesión expirada — vuelve a iniciar sesión.");
      return;
    }

    try {
      // ── Step 1: new master key derivation ────────────────────────────────
      setPhase("deriving");
      // Use the secure RNG re-exported by @psico/crypto for parity with mobile
      // (and to make the random call grep-able from a single import).
      const newSaltBytes = randomBytes(16);
      const newSaltB64 = bytesToBase64Url(newSaltBytes);
      const newMasterKey = await deriveMasterKey(newPassword, newSaltB64);
      const newDiaryKey = deriveSubKey(newMasterKey, DIARY_KEY_INFO);

      // ── Step 2: pull all raw ciphers in one request ─────────────────────
      setPhase("fetching");
      const ciphersRes = await fetch(`${apiBase}/diario/entries/raw-ciphers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!ciphersRes.ok) {
        throw new Error(`Could not load entries (${ciphersRes.status})`);
      }
      const ciphers = (await ciphersRes.json()) as DiaryRawCiphersResponse;

      // ── Step 3: decrypt with old key, re-encrypt with new key ───────────
      setPhase("reencrypting");
      const reencryptedEntries = ciphers.entries.map((entry) => {
        // Body
        const bodyPlain = decryptString(
          { ciphertext: entry.textCiphertext, nonce: entry.textNonce },
          oldDiaryKey,
        );
        const bodyNew = encryptString(bodyPlain, newDiaryKey);

        // Excerpt (optional — only present when entry was long enough)
        let excerptOut:
          | { excerptCiphertext: string; excerptNonce: string }
          | undefined;
        if (entry.excerptCiphertext && entry.excerptNonce) {
          const excerptPlain = decryptString(
            {
              ciphertext: entry.excerptCiphertext,
              nonce: entry.excerptNonce,
            },
            oldDiaryKey,
          );
          const excerptNew = encryptString(excerptPlain, newDiaryKey);
          excerptOut = {
            excerptCiphertext: excerptNew.ciphertext,
            excerptNonce: excerptNew.nonce,
          };
        }

        return {
          id: entry.id,
          textCiphertext: bodyNew.ciphertext,
          textNonce: bodyNew.nonce,
          ...(excerptOut ?? {}),
        };
      });

      // ── Step 4: POST atomic password rotation ────────────────────────────
      setPhase("submitting");
      const payload: PasswordChangeWithRekeyRequest = {
        currentPassword,
        newPassword,
        newCryptoSalt: newSaltB64,
        reencryptedEntries,
      };
      const res = await fetch(`${apiBase}/user/password-change-with-rekey`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
          code?: string;
        };
        if (res.status === 401 || body.code === "INVALID_CREDENTIALS") {
          throw new Error("Tu contraseña actual no es correcta.");
        }
        throw new Error(
          body.message ?? "No pudimos cambiar la contraseña. Reintenta.",
        );
      }
      const result = (await res.json()) as PasswordChangeWithRekeyResponse;

      // ── Step 5: adopt the new key into context ──────────────────────────
      adoptMasterKey(newMasterKey);
      // Zero our local copy now that the context owns it.
      newMasterKey.fill(0);

      setRekeyedCount(result.rekeyed);
      setPhase("done");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Server revoked all OTHER refresh tokens, but our current access token
      // still works. Refresh the route so /user/me re-reads cryptoSalt.
      router.refresh();
    } catch (err) {
      setPhase("idle");
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos completar el cambio. Reintenta.",
      );
    }
  }

  const busy = phase !== "idle" && phase !== "done";

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-6"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <header className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[18px]"
          style={{ background: "var(--color-lavender-50)" }}
        >
          🔐
        </div>
        <div>
          <h2
            className="text-[16px] font-bold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Cambiar contraseña
          </h2>
          <p
            className="mt-1 text-[12px] leading-relaxed"
            style={{ color: "var(--color-warm-500)" }}
          >
            Cuando cambias tu contraseña, tu diario se re-cifra automáticamente
            en este dispositivo. Tu texto plano nunca toca el servidor.
          </p>
        </div>
      </header>

      {isLegacyAccount ? (
        <div
          className="mt-4 rounded-xl p-3 text-[12px]"
          style={{
            background: "var(--color-warm-50)",
            color: "var(--color-warm-700)",
            border: "1px solid var(--color-warm-200)",
          }}
        >
          Tu cuenta no tiene cifrado E2E activado. Contacta soporte para
          activarlo antes de cambiar tu contraseña.
        </div>
      ) : !unlocked ? (
        <div
          className="mt-4 rounded-xl p-3 text-[12px]"
          style={{
            background: "var(--color-warm-50)",
            color: "var(--color-warm-700)",
            border: "1px solid var(--color-warm-200)",
          }}
        >
          🔒 Necesitas <strong>desbloquear tu diario</strong> primero (Diario →
          Desbloquear) para que podamos re-cifrar tus entradas. Vuelve aquí
          después.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <Field
            id="current-password"
            label="Contraseña actual"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
            disabled={busy}
            autoComplete="current-password"
          />
          <Field
            id="new-password"
            label="Nueva contraseña (mínimo 10 caracteres)"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            disabled={busy}
            autoComplete="new-password"
          />
          <Field
            id="confirm-password"
            label="Confirma la nueva contraseña"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            disabled={busy}
            autoComplete="new-password"
          />

          {error ? (
            <p
              className="text-[12px]"
              style={{ color: "var(--color-error-text, #B91C1C)" }}
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {phase !== "idle" ? (
            <p
              className="text-[12px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              {phase === "deriving"
                ? "Derivando nueva clave (Argon2id, ~1 segundo)…"
                : phase === "fetching"
                  ? "Descargando entradas cifradas…"
                  : phase === "reencrypting"
                    ? "Re-cifrando cada entrada con la nueva clave…"
                    : phase === "submitting"
                      ? "Guardando atómicamente…"
                      : phase === "done"
                        ? `Listo · ${rekeyedCount} entrada${rekeyedCount === 1 ? "" : "s"} re-cifrada${rekeyedCount === 1 ? "" : "s"}.`
                        : ""}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="w-full rounded-xl px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-sage-400)" }}
          >
            {busy ? "Procesando…" : "Cambiar contraseña"}
          </button>

          <p
            className="text-center text-[11px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            ⓘ El servidor cierra todas tus otras sesiones después del cambio.
          </p>
        </div>
      )}
    </section>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  disabled,
  autoComplete,
}: {
  id: string;
  label: string;
  type: "password" | "text";
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  autoComplete: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-warm-500)" }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-2 w-full rounded-xl border-[1.5px] bg-[var(--color-warm-50)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--color-lavender-400)] disabled:opacity-60"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-800)",
        }}
      />
    </div>
  );
}
