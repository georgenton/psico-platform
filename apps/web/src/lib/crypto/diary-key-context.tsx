"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { deriveMasterKey, deriveSubKey, DIARY_KEY_INFO } from "@psico/crypto";

/**
 * DiaryKeyContext — provides the user's derived diary key during a session.
 *
 * Lifecycle:
 *   - Initial state: `key = null` (locked). The Diario UI shows an unlock form.
 *   - User enters their password → derive masterKey (Argon2id) + diaryKey (HKDF).
 *   - Key stays in memory (React state) until the tab closes or user signs out.
 *
 * Why not persist:
 *   - localStorage exposes the key to any successful XSS (no recovery).
 *   - IndexedDB with wrapKey is safer but requires a device-secret cookie
 *     handshake — deferred to Sprint S6-crypto-v2.
 *   - For v1: re-derive per tab session. UX cost = one password prompt per
 *     diary visit; security upside = key never touches disk.
 *
 * The provider is mounted on the diary subtree only — no need to derive
 * for users who never open the diario.
 */

export interface DiaryKeyState {
  /** 32-byte diary subkey. null = locked. */
  key: Uint8Array | null;
  /** Whether `cryptoSalt` is null on the user (legacy account, no E2E). */
  isLegacyAccount: boolean;
  /** Derivation is in flight (Argon2id ~500ms on desktop). */
  unlocking: boolean;
  /** Last unlock error message, or null. */
  error: string | null;
}

export interface DiaryKeyActions {
  /** Prompt the user for their password and derive the diary key. */
  unlock: (password: string) => Promise<void>;
  /** Forget the key (e.g. user logs out or hits "lock again"). */
  lock: () => void;
}

export type DiaryKeyContextValue = DiaryKeyState & DiaryKeyActions;

const DiaryKeyContext = createContext<DiaryKeyContextValue | null>(null);

export function DiaryKeyProvider({
  children,
  cryptoSalt,
}: {
  children: React.ReactNode;
  /**
   * The user's base64url Argon2id salt, sourced from /api/user/me or the
   * session cookie. `null` for legacy accounts → we render the "feature
   * unavailable" path instead of the unlock form.
   */
  cryptoSalt: string | null;
}) {
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(
    async (password: string) => {
      if (!cryptoSalt) {
        setError("Tu cuenta no tiene cifrado E2E activado.");
        return;
      }
      setUnlocking(true);
      setError(null);
      try {
        const masterKey = await deriveMasterKey(password, cryptoSalt);
        const diaryKey = deriveSubKey(masterKey, DIARY_KEY_INFO);
        // Zero the master key buffer ASAP — diaryKey is enough for v1.
        masterKey.fill(0);
        setKey(diaryKey);
      } catch (err) {
        const code =
          err instanceof Error ? err.message : "CRYPTO_UNKNOWN_ERROR";
        setError(
          code === "CRYPTO_EMPTY_PASSWORD"
            ? "Ingresa tu contraseña."
            : "No pudimos derivar tu clave. Reintenta.",
        );
      } finally {
        setUnlocking(false);
      }
    },
    [cryptoSalt],
  );

  const lock = useCallback(() => {
    if (key) key.fill(0);
    setKey(null);
    setError(null);
  }, [key]);

  const value = useMemo<DiaryKeyContextValue>(
    () => ({
      key,
      isLegacyAccount: cryptoSalt === null,
      unlocking,
      error,
      unlock,
      lock,
    }),
    [key, cryptoSalt, unlocking, error, unlock, lock],
  );

  return (
    <DiaryKeyContext.Provider value={value}>
      {children}
    </DiaryKeyContext.Provider>
  );
}

export function useDiaryKey(): DiaryKeyContextValue {
  const ctx = useContext(DiaryKeyContext);
  if (!ctx) {
    throw new Error("useDiaryKey must be used inside <DiaryKeyProvider>");
  }
  return ctx;
}
