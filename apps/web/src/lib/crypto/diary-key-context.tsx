"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  deriveMasterKey,
  deriveSubKey,
  DIARY_KEY_INFO,
  ECO_KEY_INFO,
} from "@psico/crypto";

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
  /**
   * 32-byte Eco subkey, derived from masterKey with HKDF(ECO_KEY_INFO).
   * null = locked (or no Eco messages sent yet — derivation is lazy).
   *
   * Sprint front-eco: the Eco composer encrypts USER messages with this
   * key before posting to /api/eco/messages. The thread view decrypts USER
   * ciphertexts with it on render.
   *
   * Derived in `unlock` and `adoptMasterKey` alongside the diary subkey.
   * Zeroed in `lock`.
   */
  ecoKey: Uint8Array | null;
  /**
   * 32-byte master key from Argon2id(password, cryptoSalt). null = locked.
   *
   * Kept in memory (in addition to the diary subkey) for two reasons:
   *   1. The seed-phrase modal can render the 24-word backup without
   *      asking the user for their password again.
   *   2. The password-change-with-rekey flow needs to derive sub-keys
   *      (DIARY_KEY_INFO) from the OLD master key while re-encrypting
   *      entries with the NEW one.
   *
   * Security note: holding masterKey alongside diaryKey adds 32 B to the
   * heap; the attack surface is unchanged (an attacker with read-memory
   * access already has the diaryKey). On lock() we zero both.
   */
  masterKey: Uint8Array | null;
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
  /**
   * Adopt a master key that the caller already has (e.g. from BIP39 seed
   * phrase recovery, or right after a password change). Derives the
   * diaryKey and seeds it into the context, exactly as `unlock` would.
   */
  adoptMasterKey: (masterKey: Uint8Array) => void;
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
  const [ecoKey, setEcoKey] = useState<Uint8Array | null>(null);
  const [masterKey, setMasterKey] = useState<Uint8Array | null>(null);
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
        const derivedMaster = await deriveMasterKey(password, cryptoSalt);
        const diaryKey = deriveSubKey(derivedMaster, DIARY_KEY_INFO);
        const ecoSub = deriveSubKey(derivedMaster, ECO_KEY_INFO);
        setMasterKey(derivedMaster);
        setKey(diaryKey);
        setEcoKey(ecoSub);
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

  const adoptMasterKey = useCallback((nextMaster: Uint8Array) => {
    if (nextMaster.length !== 32) {
      setError("La clave maestra tiene un tamaño inválido.");
      return;
    }
    const diaryKey = deriveSubKey(nextMaster, DIARY_KEY_INFO);
    const ecoSub = deriveSubKey(nextMaster, ECO_KEY_INFO);
    // We copy `nextMaster` so the caller can safely zero its own buffer.
    const owned = new Uint8Array(nextMaster);
    setMasterKey(owned);
    setKey(diaryKey);
    setEcoKey(ecoSub);
    setError(null);
  }, []);

  const lock = useCallback(() => {
    if (key) key.fill(0);
    if (ecoKey) ecoKey.fill(0);
    if (masterKey) masterKey.fill(0);
    setKey(null);
    setEcoKey(null);
    setMasterKey(null);
    setError(null);
  }, [key, ecoKey, masterKey]);

  const value = useMemo<DiaryKeyContextValue>(
    () => ({
      key,
      ecoKey,
      masterKey,
      isLegacyAccount: cryptoSalt === null,
      unlocking,
      error,
      unlock,
      adoptMasterKey,
      lock,
    }),
    [
      key,
      ecoKey,
      masterKey,
      cryptoSalt,
      unlocking,
      error,
      unlock,
      adoptMasterKey,
      lock,
    ],
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
