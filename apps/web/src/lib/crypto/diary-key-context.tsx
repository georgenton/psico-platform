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
  MASTER_KEY_LEN,
  randomBytes,
} from "@psico/crypto";
import { clearDiaryWrapKey, saveDiaryWrapKey } from "@/actions/diary-session";
import { useSesionVigente } from "./sesion-vigente";

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
 *   - When the session becomes ANOTHER account with this provider still
 *     mounted: the keys stop being handed out in that same render, and are
 *     wiped right after. See `ClavesAbiertas`.
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

/**
 * El sobre lleva dentro, cifrado junto a la clave, de qué cuenta es.
 *
 * EL FALLO QUE ESTO IMPIDE. El sobre y la galleta son del NAVEGADOR, no de la
 * cuenta. Si una persona salía por un camino que no borraba la galleta —o su
 * sesión caducaba sin salir— y otra entraba en el mismo equipo, el arranque en
 * frío restauraba la clave de la primera sin preguntar de quién era: lo que
 * escribiera la segunda quedaba cifrado con la llave ajena, y «Mostrar frase»
 * enseñaba las doce palabras de otra persona.
 *
 * La marca es la sal de la cuenta, que ya es única por persona y que este
 * contexto ya recibe. Va DENTRO del texto cifrado: no se añade nada legible al
 * almacenamiento y no se puede cambiar sin la mitad de la llave que guarda el
 * servidor. El punto no existe en base64url, así que separa sin ambigüedad.
 *
 * Un sobre anterior a esta marca no dice de quién es, y se trata como ajeno:
 * se descarta y se pide la contraseña una vez.
 */
const OWNER_SEPARATOR = ".";

/**
 * ¿Es esto una clave maestra de este esquema?
 *
 * La longitud la manda `MASTER_KEY_LEN`, no un número escrito aquí. Antes había
 * dos comprobaciones contra `32` —la longitud de la v1— en sitios distintos, y
 * ninguna de las dos podía cumplirse: desde `MASTER_KEY_VERSION = 2` las claves
 * miden 16. Que las dos pregunten lo mismo, en un solo sitio, es lo que impide
 * que vuelvan a separarse.
 *
 * Cuidado al leer el resto del archivo: los `32` que quedan son correctos y no
 * hablan de esto. Las subclaves de HKDF sí miden 32, y la clave que envuelve el
 * sobre también, porque XChaCha20-Poly1305 la necesita así.
 */
function esClaveMaestraValida(bytes: Uint8Array): boolean {
  return bytes.length === MASTER_KEY_LEN;
}
/**
 * Per-device preference: does the user want us to keep the diary unlocked on
 * THIS browser ("recordar") or ask for the password every session ("pedir
 * cada vez")? Default: remember (decision 2026-07 — fluidity-first, with a
 * visible control at the unlock gate and in Ajustes → Seguridad).
 */
const REMEMBER_KEY = "psico:diary:remember";

/** Read the remember preference. Defaults to `true` (SSR + first visit). */
function readRememberPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(REMEMBER_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

interface WrappedPayload {
  ciphertext: string;
  nonce: string;
  /** ISO timestamp when the bundle was written. Helps debug stale entries. */
  savedAt: string;
}

/**
 * Lo que hay dentro del sobre guardado, o null si esta mitad de la llave no lo
 * abre — porque no hay sobre, está roto, es de otra sesión o es del formato que
 * todavía no decía de quién era.
 */
function abrirSobre(
  llaveB64u: string | null,
): { dueno: string; master: Uint8Array } | null {
  if (llaveB64u === null) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as WrappedPayload;
    const wrap = base64UrlToBytes(llaveB64u);
    const opened = decryptString(
      { ciphertext: payload.ciphertext, nonce: payload.nonce },
      wrap,
    );
    wrap.fill(0);
    const [dueno, masterB64u, ...rest] = opened.split(OWNER_SEPARATOR);
    if (dueno === undefined || masterB64u === undefined || rest.length > 0) {
      return null;
    }
    const master = base64UrlToBytes(masterB64u);
    return esClaveMaestraValida(master) ? { dueno, master } : null;
  } catch {
    return null;
  }
}

/**
 * Las claves abiertas, junto con la cuenta de la que son.
 *
 * EL FALLO QUE ESTO IMPIDE. Las tres claves vivían en tres estados sueltos, sin
 * nada que dijera de quién eran. La sesión es una cookie del navegador entero:
 * si otra pestaña entra con otra cuenta, el layout de ésta trae la sal nueva en
 * el siguiente refresco —guardar Perfil, repetir el tour, marcar «Recordar»,
 * guardar una reflexión— SIN desmontar este proveedor. Las claves de la primera
 * persona seguían en el contexto, y lo que escribiera la segunda quedaba
 * cifrado con ellas.
 *
 * Ahora van juntas y con dueño, y el contexto sólo las entrega si son de la
 * cuenta actual. Esa pregunta se hace en el RENDER (`abiertas`, abajo): limpiar
 * en un efecto llega un render tarde.
 */
interface ClavesAbiertas {
  /** La sal con la que se derivaron: la cuenta a la que pertenecen. */
  dueno: string;
  /**
   * Sólo tras un cambio de contraseña, que trae sal nueva: la que la cuenta
   * tenía hasta entonces. El proveedor la sigue recibiendo hasta que el layout
   * se entere, y en ese hueco la sesión es la misma y sigue abierta.
   */
  salAnterior: string | null;
  master: Uint8Array;
  diary: Uint8Array;
  eco: Uint8Array;
}

function abrirClaves(
  master: Uint8Array,
  dueno: string,
  salAnterior: string | null = null,
): ClavesAbiertas {
  return {
    dueno,
    salAnterior,
    master,
    diary: deriveSubKey(master, DIARY_KEY_INFO),
    eco: deriveSubKey(master, ECO_KEY_INFO),
  };
}

function sonDe(claves: ClavesAbiertas, cuenta: string | null): boolean {
  return (
    cuenta !== null &&
    (claves.dueno === cuenta || claves.salAnterior === cuenta)
  );
}

function ponerACero(claves: ClavesAbiertas): void {
  claves.master.fill(0);
  claves.diary.fill(0);
  claves.eco.fill(0);
}

/**
 * Lo que dice la reja mientras no se sabe de quién es la sesión: al llegar, o si
 * cambió en otra pestaña. Se resuelve solo —o la pestaña se va—, así que no pide
 * recargar.
 */
const SESION_SIN_CONFIRMAR =
  "Estamos confirmando tu sesión. Inténtalo de nuevo en un momento.";

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
   * La clave maestra de Argon2id(password, cryptoSalt). null = bloqueado.
   *
   * Mide `MASTER_KEY_LEN` — 16 bytes desde `MASTER_KEY_VERSION = 2`
   * (ADR 0007 §G v2, julio 2026). Aquí ponía «32-byte», que era la v1, y ese
   * comentario sobrevivió al cambio: los dos guards de este archivo se
   * escribieron contra él y rechazaban todas las claves reales. Por eso ahora
   * la longitud no se escribe a mano en ninguna parte.
   *
   * Kept in memory (in addition to the diary subkey) for two reasons:
   *   1. The seed-phrase modal can render the 12-word backup without
   *      asking the user for their password again.
   *   2. The password-change-with-rekey flow needs to derive sub-keys
   *      (DIARY_KEY_INFO) from the OLD master key while re-encrypting
   *      entries with the NEW one.
   */
  masterKey: Uint8Array | null;
  /** Whether `cryptoSalt` is null on the user (legacy account, no E2E). */
  isLegacyAccount: boolean;
  /**
   * Whether the user wants the diary remembered on this device. When true we
   * persist a wrap pair so reloads restore silently; when false the key lives
   * only in tab memory and each fresh session re-prompts for the password.
   * The value is per-device (localStorage), never sent to the server.
   */
  remember: boolean;
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
   *
   * `cryptoSalt` sólo hace falta cuando la clave nueva llega con una sal nueva
   * —el cambio de contraseña—: el proveedor todavía sostiene la anterior, y la
   * recarga siguiente llegará con la nueva.
   */
  adoptMasterKey: (masterKey: Uint8Array, cryptoSalt?: string) => void;
  /** Forget the key + clear persisted wrap pair (RAM + storage + cookie). */
  lock: () => void;
  /**
   * Change the per-device "recordar" preference. Turning it OFF wipes the
   * persisted wrap pair immediately (next session will ask for the password)
   * but keeps the current in-memory key so the session isn't interrupted.
   * Turning it ON persists the current master key right away, if unlocked.
   */
  setRemember: (next: boolean) => void;
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
  // La cuenta a la que se le pueden entregar claves AHORA. null: no tiene
  // cifrado, o esta pestaña ya no sabe de quién es la sesión.
  const vigente = useSesionVigente();
  const cuenta = vigente ? cryptoSalt : null;

  const [guardadas, setGuardadas] = useState<ClavesAbiertas | null>(null);
  const abiertas =
    guardadas !== null && sonDe(guardadas, cuenta) ? guardadas : null;

  const [unlocking, setUnlocking] = useState(false);
  const [remember, setRememberState] = useState<boolean>(readRememberPref);
  const [restoring, setRestoring] = useState<boolean>(
    () => initialWrapKey !== null && cryptoSalt !== null,
  );
  const [error, setError] = useState<string | null>(null);

  // We persist the wrap pair every time we adopt a new master key, but the
  // localStorage write only matters in the browser. This ref keeps the most
  // recent wrap key around without re-reading the cookie.
  const wrapKeyRef = useRef<string | null>(initialWrapKey);

  // La misma cuenta, para preguntarla al TERMINAR algo que tardó: una
  // derivación, un cambio de contraseña con dos peticiones por medio, un botón
  // de una pantalla que ya no está. Vale null fuera del panel, así que nada
  // iniciado aquí puede guardar un sobre después de salir.
  const cuentaRef = useRef<string | null>(cuenta);
  useEffect(() => {
    cuentaRef.current = cuenta;
    return () => {
      cuentaRef.current = null;
    };
  }, [cuenta]);

  // ── Persistence helpers ────────────────────────────────────────────────

  /**
   * Wrap the master key with a freshly generated K_wrap, write the
   * ciphertext to localStorage and the K_wrap to the diary session cookie.
   * Best-effort: a single failure (cookie blocked, storage quota) falls
   * back to RAM-only behaviour without crashing the unlock.
   *
   * `dueno` es el de la CLAVE, no el de la sesión: quien llama dice de quién es
   * lo que entrega, y eso es lo que se escribe dentro.
   */
  const persistMasterKey = useCallback(
    async (master: Uint8Array, dueno: string) => {
      if (typeof window === "undefined") return;
      try {
        const wrap = randomBytes(32);
        const masterB64u = bytesToBase64Url(master);
        const envelope = encryptString(
          `${dueno}${OWNER_SEPARATOR}${masterB64u}`,
          wrap,
        );
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
    },
    [],
  );

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
    // Hasta que se sepa de quién es la sesión no se abre lo recordado, y tampoco
    // se tira: lo que hay en el dispositivo puede ser ya de otra cuenta.
    if (!restoring || !vigente) return;
    if (cryptoSalt === null || initialWrapKey === null) {
      setRestoring(false);
      return;
    }
    // User chose "pedir cada vez": never silently restore. Drop any lingering
    // persistence so we don't keep a wrap pair around against their wish.
    if (!remember) {
      wipePersistence();
      setRestoring(false);
      return;
    }
    const sobre = abrirSobre(initialWrapKey);
    if (sobre === null || sobre.dueno !== cryptoSalt) {
      // No bundle (the cookie says we should be unlocked but localStorage is
      // gone), a stale wrap (password changed elsewhere), tampered storage, or
      // a bundle that belongs to another account. Reset both sides so the next
      // interaction prompts for the password.
      sobre?.master.fill(0);
      wipePersistence();
    } else {
      setGuardadas(abrirClaves(sobre.master, sobre.dueno));
    }
    setRestoring(false);
  }, [
    restoring,
    vigente,
    cryptoSalt,
    initialWrapKey,
    remember,
    wipePersistence,
  ]);

  // ── La cuenta cambia con el proveedor montado ──────────────────────────

  // Las claves que dejaron de entregarse se borran. `abiertas` ya las ocultó en
  // el mismo render; esto es lo que impide que sigan en memoria, y que vuelvan
  // a valer si la sesión regresa a la primera cuenta.
  useEffect(() => {
    if (guardadas === null) return;
    if (!sonDe(guardadas, cuenta)) {
      ponerACero(guardadas);
      setGuardadas(null);
    } else if (guardadas.salAnterior !== null && guardadas.dueno === cuenta) {
      // Llegó la sal nueva: la anterior deja de ser de esta cuenta.
      setGuardadas({ ...guardadas, salAnterior: null });
    }
  }, [guardadas, cuenta]);

  // Lo que estuviera en marcha en la reja era de la cuenta anterior: ni su
  // espera ni su error son de la que llega.
  const cuentaPreviaRef = useRef(cuenta);
  useEffect(() => {
    if (cuentaPreviaRef.current === cuenta) return;
    cuentaPreviaRef.current = cuenta;
    setUnlocking(false);
    setError(null);
  }, [cuenta]);

  // Y lo guardado en el dispositivo, sólo si se SABE que no es de la cuenta que
  // llega. Su propio sobre —desbloqueó en otra pestaña— no se toca, y tampoco se
  // abre aquí: pide su contraseña una vez, o recarga. Uno que ninguna de las dos
  // llaves abre no se sabe de quién es, y lo decide el arranque siguiente.
  //
  // Mira `cryptoSalt` y no `cuenta`: que esta pestaña no sepa de quién es la
  // sesión no es motivo para borrar nada.
  const salPreviaRef = useRef(cryptoSalt);
  useEffect(() => {
    if (salPreviaRef.current === cryptoSalt) return;
    salPreviaRef.current = cryptoSalt;
    const sobre = abrirSobre(wrapKeyRef.current) ?? abrirSobre(initialWrapKey);
    if (sobre === null) return;
    sobre.master.fill(0);
    if (sobre.dueno !== cryptoSalt) wipePersistence();
  }, [cryptoSalt, initialWrapKey, wipePersistence]);

  // ── Actions ────────────────────────────────────────────────────────────

  const unlock = useCallback(
    async (password: string) => {
      if (!vigente) {
        setError(SESION_SIN_CONFIRMAR);
        return;
      }
      if (!cryptoSalt) {
        setError("Tu cuenta no tiene cifrado E2E activado.");
        return;
      }
      setUnlocking(true);
      setError(null);
      try {
        const derivedMaster = await deriveMasterKey(password, cryptoSalt);
        // Argon2id tarda. Si entretanto la sesión es de otra persona, o ya no
        // hay panel, esta clave no es de nadie que esté mirando.
        if (cuentaRef.current !== cryptoSalt) {
          derivedMaster.fill(0);
          return;
        }
        setGuardadas(abrirClaves(derivedMaster, cryptoSalt));
        // Only persist across sessions when the user opted to be remembered.
        if (remember) await persistMasterKey(derivedMaster, cryptoSalt);
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
        // La reja de otra cuenta no es de este desbloqueo.
        if (cuentaRef.current === cryptoSalt) setUnlocking(false);
      }
    },
    // `remember` va aquí porque la línea de arriba lo lee.
    //
    // Sin él, `unlock` se memoizaba una sola vez y se quedaba para siempre con
    // el valor del primer render — `true`, el que hay por defecto. Quien
    // desmarcara «Recordar en este dispositivo» EN LA PROPIA REJA, que es donde
    // el texto dice «Desmárcalo si es un equipo compartido», veía cómo se
    // guardaba el sobre igualmente. `adoptMasterKey`, cuatro líneas más abajo,
    // sí lo declaraba; sólo este se había quedado atrás.
    [cryptoSalt, vigente, persistMasterKey, remember],
  );

  const adoptMasterKey = useCallback(
    (nextMaster: Uint8Array, nextCryptoSalt?: string) => {
      // Esta función nació con la cuenta `cuenta`. Quien la llama puede haberla
      // guardado antes de dos peticiones —el cambio de contraseña lo hace—, y si
      // al terminar la sesión es de otra persona, no se adopta ni se guarda.
      if (cuenta === null || cuentaRef.current !== cuenta) return;
      if (!esClaveMaestraValida(nextMaster)) {
        setError("La clave maestra tiene un tamaño inválido.");
        return;
      }
      // We copy `nextMaster` so the caller can safely zero its own buffer.
      const owned = new Uint8Array(nextMaster);
      const dueno = nextCryptoSalt ?? cuenta;
      setGuardadas(abrirClaves(owned, dueno, dueno === cuenta ? null : cuenta));
      setError(null);
      if (remember) void persistMasterKey(owned, dueno);
    },
    [cuenta, remember, persistMasterKey],
  );

  const setRemember = useCallback(
    (next: boolean) => {
      // Sin saber de quién es la sesión no se toca lo guardado, ni la
      // preferencia, que es del navegador entero.
      if (!vigente) return;
      setRememberState(next);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(REMEMBER_KEY, next ? "1" : "0");
        } catch {
          // Private mode / quota — the in-memory value still drives behaviour.
        }
      }
      if (!next) {
        // Stop remembering: drop the persisted wrap so the next session asks
        // for the password. The current in-memory key stays valid.
        wipePersistence();
      } else if (abiertas !== null && cuentaRef.current === cuenta) {
        // Re-enabling: persist the key we already hold so reloads restore.
        // The ref check is for a stale callback: its buffer may be zeroed by
        // now, and a zeroed master key must never reach the device.
        void persistMasterKey(abiertas.master, abiertas.dueno);
      }
    },
    [vigente, abiertas, cuenta, wipePersistence, persistMasterKey],
  );

  const lock = useCallback(() => {
    if (guardadas !== null) ponerACero(guardadas);
    setGuardadas(null);
    setError(null);
    if (vigente) wipePersistence();
  }, [vigente, guardadas, wipePersistence]);

  const value = useMemo<DiaryKeyContextValue>(
    () => ({
      key: abiertas?.diary ?? null,
      ecoKey: abiertas?.eco ?? null,
      masterKey: abiertas?.master ?? null,
      isLegacyAccount: cryptoSalt === null,
      remember,
      unlocking,
      restoring,
      error,
      unlock,
      adoptMasterKey,
      lock,
      setRemember,
    }),
    [
      abiertas,
      cryptoSalt,
      remember,
      unlocking,
      restoring,
      error,
      unlock,
      adoptMasterKey,
      lock,
      setRemember,
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
