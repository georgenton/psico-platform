import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  deriveMasterKey,
  deriveSubKey,
  DIARY_KEY_INFO,
  ECO_KEY_INFO,
} from "@psico/crypto";
import { diaryKeyStore } from "./diary-key-store";

/**
 * Mobile DiaryKeyContext.
 *
 * Differences vs web:
 *   - On mount, tries to load the cached diaryKey from SecureStore.
 *   - Successful unlock persists the diaryKey to SecureStore so the user
 *     doesn't re-enter password on every cold start.
 *   - lock() clears the SecureStore entry too.
 *
 * `cryptoSalt` comes from the auth store (the user object loaded at login)
 * — different plumbing than web because mobile keeps the full user object
 * in the AuthContext.
 */

export interface DiaryKeyState {
  key: Uint8Array | null;
  /**
   * 32-byte Eco subkey. null = locked OR no Eco usage yet (lazy derived
   * inside unlock/adoptMasterKey alongside the diary subkey).
   *
   * Like the diary key, we persist this to SecureStore on unlock so the
   * Eco screen works after a cold start without re-prompting.
   */
  ecoKey: Uint8Array | null;
  /**
   * 32-byte master key from Argon2id(password, salt). null = locked OR
   * restored from SecureStore (we only persist the diary subkey on mobile;
   * the master key stays RAM-only).
   *
   * Needed by:
   *   1. The seed-phrase modal — render the 12-word backup without asking
   *      for the password again.
   *   2. The password-change-with-rekey flow — derive the OLD diaryKey from
   *      the OLD master key while re-encrypting entries with the new one.
   *
   * After a cold restart the master key is null even if `key` is set; the
   * user must lock & unlock to re-derive it. The UI gates on this.
   */
  masterKey: Uint8Array | null;
  isLegacyAccount: boolean;
  unlocking: boolean;
  loadingPersisted: boolean;
  error: string | null;
}

export interface DiaryKeyActions {
  unlock: (password: string) => Promise<void>;
  /**
   * Adopt a master key the caller already has (seed-phrase recovery or
   * post-password-change). Derives the diary subkey, persists it, and
   * seeds the in-memory master key.
   */
  adoptMasterKey: (masterKey: Uint8Array) => Promise<void>;
  lock: () => Promise<void>;
}

export type DiaryKeyContextValue = DiaryKeyState & DiaryKeyActions;

const DiaryKeyContext = createContext<DiaryKeyContextValue | null>(null);

export function DiaryKeyProvider({
  children,
  cryptoSalt,
}: {
  children: React.ReactNode;
  cryptoSalt: string | null;
}) {
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [ecoKey, setEcoKey] = useState<Uint8Array | null>(null);
  const [masterKey, setMasterKey] = useState<Uint8Array | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [loadingPersisted, setLoadingPersisted] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount: try to restore both subkeys from SecureStore.
  useEffect(() => {
    let active = true;
    Promise.all([diaryKeyStore.load(), diaryKeyStore.loadEco()])
      .then(([storedDiary, storedEco]) => {
        if (!active) return;
        if (storedDiary) setKey(storedDiary);
        if (storedEco) setEcoKey(storedEco);
      })
      .catch(() => {
        // SecureStore unavailable (e.g. simulator without Keychain) — fall
        // through to unlock UI. No need to surface the error.
      })
      .finally(() => {
        if (active) setLoadingPersisted(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
        // Persist BOTH subkeys to SecureStore. The master key lives
        // RAM-only — losing it on cold restart is fine for ongoing reads/
        // writes; only seed-phrase + password-change need it, and both
        // explicitly require a fresh unlock.
        await diaryKeyStore.save(diaryKey);
        await diaryKeyStore.saveEco(ecoSub);
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

  const adoptMasterKey = useCallback(async (nextMaster: Uint8Array) => {
    if (nextMaster.length !== 32) {
      setError("La clave maestra tiene un tamaño inválido.");
      return;
    }
    const diaryKey = deriveSubKey(nextMaster, DIARY_KEY_INFO);
    const ecoSub = deriveSubKey(nextMaster, ECO_KEY_INFO);
    // Caller may zero its own copy after this resolves — we own a fresh one.
    const owned = new Uint8Array(nextMaster);
    await diaryKeyStore.save(diaryKey);
    await diaryKeyStore.saveEco(ecoSub);
    setMasterKey(owned);
    setKey(diaryKey);
    setEcoKey(ecoSub);
    setError(null);
  }, []);

  const lock = useCallback(async () => {
    if (key) key.fill(0);
    if (ecoKey) ecoKey.fill(0);
    if (masterKey) masterKey.fill(0);
    setKey(null);
    setEcoKey(null);
    setMasterKey(null);
    setError(null);
    await diaryKeyStore.clear();
  }, [key, ecoKey, masterKey]);

  const value = useMemo<DiaryKeyContextValue>(
    () => ({
      key,
      ecoKey,
      masterKey,
      isLegacyAccount: cryptoSalt === null,
      unlocking,
      loadingPersisted,
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
      loadingPersisted,
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
