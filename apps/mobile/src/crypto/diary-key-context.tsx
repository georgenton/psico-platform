import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  deriveMasterKey,
  deriveSubKey,
  DIARY_KEY_INFO,
  ECO_KEY_INFO,
} from "@psico/crypto";
import { diaryKeyStore } from "./diary-key-store";
import { lockPrefs } from "./lock-prefs";
import { getBiometricCapability, promptBiometric } from "./biometric";

/**
 * Mobile DiaryKeyContext.
 *
 * Lifecycle (2026-07 — remember + biometric gate):
 *   - On mount we read the per-device prefs (remember / biometricLock) and the
 *     device biometric capability, then:
 *       · remember = false → stay locked, show the password gate every launch.
 *       · remember = true + no cached key → password gate (first time).
 *       · remember = true + cached key + biometricLock + biometrics available →
 *         hold the key behind a Face ID / huella prompt (`needsBiometric`).
 *       · remember = true + cached key + no biometric gate → reveal directly.
 *   - `unlock` derives from the password (Argon2id) and, if remember is on,
 *     caches the subkeys. `adoptMasterKey` does the same from a recovered key.
 *   - `lock` clears RAM + SecureStore (prefs survive).
 *
 * The biometric gate is a UX gate (see biometric.ts) — the subkey lives in
 * SecureStore; we just require a prompt before loading it into the app.
 *
 * `cryptoSalt` comes from the auth store (the user object loaded at login).
 */

export interface DiaryKeyState {
  key: Uint8Array | null;
  ecoKey: Uint8Array | null;
  masterKey: Uint8Array | null;
  isLegacyAccount: boolean;
  unlocking: boolean;
  loadingPersisted: boolean;
  error: string | null;
  /** User pref: keep the key cached across launches. */
  remember: boolean;
  /** User pref: require biometrics before revealing the cached key. */
  biometricLock: boolean;
  /** Whether this device actually has usable biometrics (hardware + enrolled). */
  biometricAvailable: boolean;
  /** Human label for the modality: "Face ID", "huella", … */
  biometricLabel: string;
  /**
   * A cached key exists but is held behind a biometric prompt that hasn't
   * succeeded yet. The unlock gate shows a "Usar Face ID / huella" button.
   */
  needsBiometric: boolean;
}

export interface DiaryKeyActions {
  unlock: (password: string) => Promise<void>;
  adoptMasterKey: (masterKey: Uint8Array) => Promise<void>;
  lock: () => Promise<void>;
  /** Prompt biometrics and, on success, reveal the cached key. */
  authenticateBiometric: () => Promise<void>;
  setRemember: (next: boolean) => void;
  setBiometricLock: (next: boolean) => void;
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
  const [remember, setRememberState] = useState(true);
  const [biometricLock, setBiometricLockState] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("biometría");
  const [needsBiometric, setNeedsBiometric] = useState(false);

  // De qué cuenta son las claves que hay aquí, abiertas o esperando a la
  // huella. Sólo se entregan si es la cuenta actual, y la pregunta se hace en el
  // render: limpiar en un efecto llega un render tarde. Igual que en web.
  const [dueno, setDueno] = useState<string | null>(null);
  const mias = dueno !== null && dueno === cryptoSalt;

  // La misma cuenta, para preguntarla al TERMINAR algo que tardó. Vale null sin
  // proveedor, así que un desbloqueo no puede guardar nada después de salir.
  const cuentaRef = useRef<string | null>(cryptoSalt);
  useEffect(() => {
    cuentaRef.current = cryptoSalt;
    return () => {
      cuentaRef.current = null;
    };
  }, [cryptoSalt]);

  // Cached subkeys loaded from SecureStore but held back until biometrics pass.
  const pendingRef = useRef<{
    d: Uint8Array | null;
    e: Uint8Array | null;
  } | null>(null);

  // La cuenta cambió con el proveedor montado.
  useEffect(() => {
    if (dueno === null || dueno === cryptoSalt) return;
    for (const k of [key, ecoKey, masterKey]) k?.fill(0);
    setKey(null);
    setEcoKey(null);
    setMasterKey(null);
    setDueno(null);
    pendingRef.current = null;
    setNeedsBiometric(false);
  }, [dueno, cryptoSalt, key, ecoKey, masterKey]);

  // Y lo que estuviera en marcha en la reja era de la cuenta anterior.
  const cuentaPreviaRef = useRef(cryptoSalt);
  useEffect(() => {
    if (cuentaPreviaRef.current === cryptoSalt) return;
    cuentaPreviaRef.current = cryptoSalt;
    setUnlocking(false);
    setError(null);
  }, [cryptoSalt]);

  // On mount: resolve prefs + capability, then decide how to restore.
  useEffect(() => {
    let active = true;
    const sigueIgual = () => active && cuentaRef.current === cryptoSalt;
    (async () => {
      const [rememberPref, bioPref, cap] = await Promise.all([
        lockPrefs.getRemember(),
        lockPrefs.getBiometricLock(),
        getBiometricCapability(),
      ]);
      if (!active) return;
      setRememberState(rememberPref);
      setBiometricLockState(bioPref);
      setBiometricAvailable(cap.available);
      setBiometricLabel(cap.label);

      if (!rememberPref) {
        setLoadingPersisted(false);
        return; // ask for password every launch
      }

      const [storedDiary, storedEco] = await Promise.all([
        diaryKeyStore.load(),
        diaryKeyStore.loadEco(),
      ]).catch(() => [null, null] as const);
      if (!active) return;

      if (!storedDiary) {
        setLoadingPersisted(false);
        return; // nothing cached → first-time password gate
      }

      if (bioPref && cap.available) {
        // Hold the key behind a biometric prompt.
        pendingRef.current = { d: storedDiary, e: storedEco };
        setDueno(cryptoSalt);
        setNeedsBiometric(true);
        setLoadingPersisted(false);
        const ok = await promptBiometric("Desbloquea tu diario");
        if (!sigueIgual()) return;
        if (ok) {
          setKey(storedDiary);
          if (storedEco) setEcoKey(storedEco);
          pendingRef.current = null;
          setNeedsBiometric(false);
        }
        // On failure/cancel we stay in needsBiometric — the gate shows a retry.
        return;
      }

      // No biometric gate → reveal directly (legacy "remember" behaviour).
      if (!sigueIgual()) {
        setLoadingPersisted(false);
        return;
      }
      setDueno(cryptoSalt);
      setKey(storedDiary);
      if (storedEco) setEcoKey(storedEco);
      setLoadingPersisted(false);
    })().catch(() => {
      if (active) setLoadingPersisted(false);
    });
    return () => {
      active = false;
    };
    // Sólo al montar: restaura para la cuenta con la que se montó.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (cuentaRef.current !== cryptoSalt) {
          derivedMaster.fill(0);
          return;
        }
        const diaryKey = deriveSubKey(derivedMaster, DIARY_KEY_INFO);
        const ecoSub = deriveSubKey(derivedMaster, ECO_KEY_INFO);
        // Persist only if the user wants to be remembered on this device.
        if (remember) {
          await diaryKeyStore.save(diaryKey);
          await diaryKeyStore.saveEco(ecoSub);
        } else {
          await diaryKeyStore.clear();
        }
        if (cuentaRef.current !== cryptoSalt) {
          // Se salió mientras se guardaba: lo guardado se retira.
          for (const k of [derivedMaster, diaryKey, ecoSub]) k.fill(0);
          await diaryKeyStore.clear();
          return;
        }
        setDueno(cryptoSalt);
        setMasterKey(derivedMaster);
        setKey(diaryKey);
        setEcoKey(ecoSub);
        pendingRef.current = null;
        setNeedsBiometric(false);
      } catch (err) {
        if (cuentaRef.current !== cryptoSalt) return;
        const code =
          err instanceof Error ? err.message : "CRYPTO_UNKNOWN_ERROR";
        setError(
          code === "CRYPTO_EMPTY_PASSWORD"
            ? "Ingresa tu contraseña."
            : "No pudimos derivar tu clave. Reintenta.",
        );
      } finally {
        if (cuentaRef.current === cryptoSalt) setUnlocking(false);
      }
    },
    [cryptoSalt, remember],
  );

  const adoptMasterKey = useCallback(
    async (nextMaster: Uint8Array) => {
      // Quien la llama puede haberla guardado antes de una petición.
      if (cryptoSalt === null || cuentaRef.current !== cryptoSalt) return;
      if (nextMaster.length !== 32) {
        setError("La clave maestra tiene un tamaño inválido.");
        return;
      }
      const diaryKey = deriveSubKey(nextMaster, DIARY_KEY_INFO);
      const ecoSub = deriveSubKey(nextMaster, ECO_KEY_INFO);
      const owned = new Uint8Array(nextMaster);
      if (remember) {
        await diaryKeyStore.save(diaryKey);
        await diaryKeyStore.saveEco(ecoSub);
      } else {
        await diaryKeyStore.clear();
      }
      if (cuentaRef.current !== cryptoSalt) {
        for (const k of [owned, diaryKey, ecoSub]) k.fill(0);
        await diaryKeyStore.clear();
        return;
      }
      setDueno(cryptoSalt);
      setMasterKey(owned);
      setKey(diaryKey);
      setEcoKey(ecoSub);
      pendingRef.current = null;
      setNeedsBiometric(false);
      setError(null);
    },
    [cryptoSalt, remember],
  );

  const lock = useCallback(async () => {
    if (key) key.fill(0);
    if (ecoKey) ecoKey.fill(0);
    if (masterKey) masterKey.fill(0);
    setKey(null);
    setEcoKey(null);
    setMasterKey(null);
    setDueno(null);
    setError(null);
    pendingRef.current = null;
    setNeedsBiometric(false);
    await diaryKeyStore.clear();
  }, [key, ecoKey, masterKey]);

  const authenticateBiometric = useCallback(async () => {
    setError(null);
    const ok = await promptBiometric("Desbloquea tu diario");
    if (!ok) {
      setError(
        "No pudimos verificar tu identidad. Intenta de nuevo o usa tu contraseña.",
      );
      return;
    }
    const d = pendingRef.current?.d ?? (await diaryKeyStore.load());
    const e = pendingRef.current?.e ?? (await diaryKeyStore.loadEco());
    if (cuentaRef.current !== cryptoSalt) return;
    setDueno(cryptoSalt);
    if (d) setKey(d);
    if (e) setEcoKey(e);
    pendingRef.current = null;
    setNeedsBiometric(false);
  }, [cryptoSalt]);

  const setRemember = useCallback(
    (next: boolean) => {
      setRememberState(next);
      void lockPrefs.setRemember(next);
      if (!next) {
        // Stop caching; keep the current in-memory key for this session.
        void diaryKeyStore.clear();
      } else {
        // Re-enable: persist whatever we currently hold. Not from a callback of
        // a previous account: its buffers may be zeroed by now.
        if (!mias || cuentaRef.current !== cryptoSalt) return;
        if (key) void diaryKeyStore.save(key);
        if (ecoKey) void diaryKeyStore.saveEco(ecoKey);
      }
    },
    [mias, cryptoSalt, key, ecoKey],
  );

  const setBiometricLock = useCallback(
    (next: boolean) => {
      setBiometricLockState(next);
      void lockPrefs.setBiometricLock(next);
      // If we're currently gated and the user turns the gate off, reveal now.
      if (!next && needsBiometric) {
        const d = pendingRef.current?.d;
        const e = pendingRef.current?.e;
        if (d) setKey(d);
        if (e) setEcoKey(e);
        pendingRef.current = null;
        setNeedsBiometric(false);
      }
    },
    [needsBiometric],
  );

  const value = useMemo<DiaryKeyContextValue>(
    () => ({
      key: mias ? key : null,
      ecoKey: mias ? ecoKey : null,
      masterKey: mias ? masterKey : null,
      isLegacyAccount: cryptoSalt === null,
      unlocking,
      loadingPersisted,
      error,
      remember,
      biometricLock,
      biometricAvailable,
      biometricLabel,
      needsBiometric: mias && needsBiometric,
      unlock,
      adoptMasterKey,
      lock,
      authenticateBiometric,
      setRemember,
      setBiometricLock,
    }),
    [
      mias,
      key,
      ecoKey,
      masterKey,
      cryptoSalt,
      unlocking,
      loadingPersisted,
      error,
      remember,
      biometricLock,
      biometricAvailable,
      biometricLabel,
      needsBiometric,
      unlock,
      adoptMasterKey,
      lock,
      authenticateBiometric,
      setRemember,
      setBiometricLock,
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
