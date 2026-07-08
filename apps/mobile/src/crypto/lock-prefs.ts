import * as SecureStore from "expo-secure-store";

/**
 * Per-device preferences for the diary/Eco lock. These are NOT secrets (they
 * hold no key material) but we keep them in SecureStore to sit next to the
 * key store and to survive reinstalls consistently.
 *
 *   - remember:      keep the derived key cached across app launches
 *                    (default true — fluidity-first, 2026-07 decision).
 *   - biometricLock: require Face ID / huella before revealing the cached key
 *                    (default true — "Face ID para abrir"). Only takes effect
 *                    when biometrics are actually available on the device.
 *
 * Missing entries fall back to the defaults so existing installs (which never
 * wrote these keys) behave exactly as before: remembered, and — now —
 * biometric-gated if the device supports it.
 */

const KEY_REMEMBER = "psico_diary_remember_v1";
const KEY_BIOMETRIC = "psico_diary_biometric_v1";

async function readBool(key: string, fallback: boolean): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v === null) return fallback;
    return v === "1";
  } catch {
    return fallback;
  }
}

async function writeBool(key: string, value: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value ? "1" : "0");
  } catch {
    // Keychain unavailable (simulator edge cases) — the in-memory value in the
    // context still drives behaviour for this session.
  }
}

export const lockPrefs = {
  getRemember: () => readBool(KEY_REMEMBER, true),
  setRemember: (v: boolean) => writeBool(KEY_REMEMBER, v),
  getBiometricLock: () => readBool(KEY_BIOMETRIC, true),
  setBiometricLock: (v: boolean) => writeBool(KEY_BIOMETRIC, v),
};
