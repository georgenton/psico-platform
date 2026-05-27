import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { deriveMasterKey, deriveSubKey, DIARY_KEY_INFO } from "@psico/crypto";
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
  isLegacyAccount: boolean;
  unlocking: boolean;
  loadingPersisted: boolean;
  error: string | null;
}

export interface DiaryKeyActions {
  unlock: (password: string) => Promise<void>;
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
  const [unlocking, setUnlocking] = useState(false);
  const [loadingPersisted, setLoadingPersisted] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount: try to restore from SecureStore.
  useEffect(() => {
    let active = true;
    diaryKeyStore
      .load()
      .then((stored) => {
        if (active && stored) setKey(stored);
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
        const masterKey = await deriveMasterKey(password, cryptoSalt);
        const diaryKey = deriveSubKey(masterKey, DIARY_KEY_INFO);
        masterKey.fill(0);
        await diaryKeyStore.save(diaryKey);
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

  const lock = useCallback(async () => {
    if (key) key.fill(0);
    setKey(null);
    setError(null);
    await diaryKeyStore.clear();
  }, [key]);

  const value = useMemo<DiaryKeyContextValue>(
    () => ({
      key,
      isLegacyAccount: cryptoSalt === null,
      unlocking,
      loadingPersisted,
      error,
      unlock,
      lock,
    }),
    [key, cryptoSalt, unlocking, loadingPersisted, error, unlock, lock],
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
