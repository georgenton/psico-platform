"use client";

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
  base64UrlToBytes,
  bytesToBase64Url,
  decryptString,
  deriveMasterKey,
  deriveSubKey,
  DIARY_KEY_INFO,
  ECO_KEY_INFO,
  encryptString,
  randomBytes,
} from "@psico/crypto";
import { clearDiaryWrapKey, saveDiaryWrapKey } from "@/actions/diary-session";

/**
 * DiaryKeyContext — provides the user's derived diary key during a session.
 *
 * Lifecycle (Option C persistence — ADR 0007 §G v2):
 *   - Initial render: if the layout already passed `initialWrapKey` AND the
 *     browser has a `psico:diary:wrapped` entry in localStorage, we try to
 *     decrypt the wrapped master key. Success → context fills in silently,
 *     UI never asks for the password.
 *   - First-time / failed restore: `key = null` (locked). The Diario UI
 *     shows an unlock form. After unlock we both keep the key in memory
 *     AND persist a fresh wrap pair (cookie + localStorage).
 *   - On password change: the rekey flow calls `adoptMasterKey(newKey)`
 *     which automatically writes a fresh wrap pair so the next reload
 *     restores against the new master.
 *   - On manual `lock()` or `logout`: we wipe RAM, localStorage, and the
 *     wrap-key cookie.
 *
 * Why this design (vs RAM-only):
 *   - Friction. Asking for the password on every full navigation makes the
 *     diary feel hostile, especially since the iOS reload behaviour wipes
 *     in-memory key on swipe-back too.
 *   - Same theft surface as a normal session cookie. An attacker needs
 *     BOTH the HttpOnly cookie (server-side) AND the localStorage payload
 *     (client-side) to recover the master key. Either half alone is junk.
 *   - The master key itself never touches JS-accessible storage. Only the
 *     ciphertext does, and the wrap key never leaves the server.
 *
 * The provider is hoisted to the dashboard layout so the unlock survives
 * navigation between Diario / Eco / Patrones / Seguridad.
 */

const LOCAL_STORAGE_KEY = "psico:diary:wrapped";

interface WrappedPayload {
  ciphertext: string;
  nonce: string;
  /** ISO timestamp when the bundle was written. Helps debug stale entries. */
  savedAt: string;
}

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
   */
  masterKey: Uint8Array | null;
  /** Whether `cryptoSalt` is null on the user (legacy account, no E2E). */
  isLegacyAccount: boolean;
  /** Derivation is in flight (Argon2id ~500ms on desktop). */
  unlocking: boolean;
  /**
   * Restore attempt from the persisted wrap pair is in flight. The Diario
   * UI uses this to render a tiny "Restaurando sesión…" skeleton instead
   * of flashing the unlock form on every reload.
   */
  restoring: boolean;
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
   * Also re-persists a fresh wrap pair so the next reload restores
   * against this new master.
   */
  adoptMasterKey: (masterKey: Uint8Array) => void;
  /** Forget the key + clear persisted wrap pair (RAM + storage + cookie). */
  lock: () => void;
}

export type DiaryKeyContextValue = DiaryKeyState & DiaryKeyActions;

const DiaryKeyContext = createContext<DiaryKeyContextValue | null>(null);

export function DiaryKeyProvider({
  children,
  cryptoSalt,
  initialWrapKey,
}: {
  children: React.ReactNode;
  /**
   * The user's base64url Argon2id salt, sourced from /api/user/me or the
   * session cookie. `null` for legacy accounts → we render the "feature
   * unavailable" path instead of the unlock form.
   */
  cryptoSalt: string | null;
  /**
   * Wrap key read by the server layout from the `psico_diary_wrap` cookie.
   * When non-null AND the browser has a matching localStorage payload we
   * restore the master key silently. `null` (no cookie) means the user is
   * either fresh or chose to lock — show the password prompt.
   */
  initialWrapKey: string | null;
}) {
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [ecoKey, setEcoKey] = useState<Uint8Array | null>(null);
  const [masterKey, setMasterKey] = useState<Uint8Array | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [restoring, setRestoring] = useState<boolean>(
    () => initialWrapKey !== null && cryptoSalt !== null,
  );
  const [error, setError] = useState<string | null>(null);

  // We persist the wrap pair every time we adopt a new master key, but the
  // localStorage write only matters in the browser. This ref keeps the most
  // recent wrap key around without re-reading the cookie.
  const wrapKeyRef = useRef<string | null>(initialWrapKey);

  // ── Persistence helpers ────────────────────────────────────────────────

  /**
   * Wrap the master key with a freshly generated K_wrap, write the
   * ciphertext to localStorage and the K_wrap to the diary session cookie.
   * Best-effort: a single failure (cookie blocked, storage quota) falls
   * back to RAM-only behaviour without crashing the unlock.
   */
  const persistMasterKey = useCallback(async (master: Uint8Array) => {
    if (typeof window === "undefined") return;
    try {
      const wrap = randomBytes(32);
      const masterB64u = bytesToBase64Url(master);
      const envelope = encryptString(masterB64u, wrap);
      const payload: WrappedPayload = {
        ciphertext: envelope.ciphertext,
        nonce: envelope.nonce,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
      const wrapB64u = bytesToBase64Url(wrap);
      wrapKeyRef.current = wrapB64u;
      // Server Action runs over fetch — fire-and-forget; the cookie is set
      // on the response and the browser persists it automatically.
      void saveDiaryWrapKey(wrapB64u);
      wrap.fill(0);
    } catch {
      // Persistence failed; the in-memory keys still work for this session.
    }
  }, []);

  /**
   * Wipe localStorage + cookie. Safe to call multiple times.
   */
  const wipePersistence = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // Quota / private mode — ignore.
    }
    wrapKeyRef.current = null;
    void clearDiaryWrapKey();
  }, []);

  // ── Cold-start restore ─────────────────────────────────────────────────

  useEffect(() => {
    if (!restoring) return;
    if (cryptoSalt === null || initialWrapKey === null) {
      setRestoring(false);
      return;
    }
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) {
        // Cookie says we should be unlocked, but localStorage is gone
        // (probably cleared in privacy settings). Drop the cookie too so
        // subsequent loads don't keep retrying.
        wipePersistence();
        setRestoring(false);
        return;
      }
      const payload = JSON.parse(raw) as WrappedPayload;
      const wrap = base64UrlToBytes(initialWrapKey);
      const masterB64u = decryptString(
        { ciphertext: payload.ciphertext, nonce: payload.nonce },
        wrap,
      );
      wrap.fill(0);
      const master = base64UrlToBytes(masterB64u);
      if (master.length !== 32) throw new Error("INVALID_LENGTH");
      const diaryKey = deriveSubKey(master, DIARY_KEY_INFO);
      const ecoSub = deriveSubKey(master, ECO_KEY_INFO);
      setMasterKey(master);
      setKey(diaryKey);
      setEcoKey(ecoSub);
    } catch {
      // Stale wrap (password changed elsewhere) or tampered storage. Reset
      // both sides so the next interaction prompts for the password.
      wipePersistence();
    } finally {
      setRestoring(false);
    }
  }, [restoring, cryptoSalt, initialWrapKey, wipePersistence]);

  // ── Actions ────────────────────────────────────────────────────────────

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
        await persistMasterKey(derivedMaster);
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
    [cryptoSalt, persistMasterKey],
  );

  const adoptMasterKey = useCallback(
    (nextMaster: Uint8Array) => {
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
      void persistMasterKey(owned);
    },
    [persistMasterKey],
  );

  const lock = useCallback(() => {
    if (key) key.fill(0);
    if (ecoKey) ecoKey.fill(0);
    if (masterKey) masterKey.fill(0);
    setKey(null);
    setEcoKey(null);
    setMasterKey(null);
    setError(null);
    wipePersistence();
  }, [key, ecoKey, masterKey, wipePersistence]);

  const value = useMemo<DiaryKeyContextValue>(
    () => ({
      key,
      ecoKey,
      masterKey,
      isLegacyAccount: cryptoSalt === null,
      unlocking,
      restoring,
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
      restoring,
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
