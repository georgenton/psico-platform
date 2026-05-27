import * as SecureStore from "expo-secure-store";
import { base64UrlToBytes, bytesToBase64Url } from "@psico/crypto";

/**
 * SecureStore-backed persistence for the user's derived diary key.
 *
 * Mobile UX assumption (vs web):
 *   - The web re-derives per tab session because localStorage is XSS-prone.
 *   - Mobile has hardware-backed Keychain/Keystore — Argon2id @ 64MB on a
 *     mid-range phone is ~800ms; we don't want to subject the user to that
 *     on every cold-start. So we persist the derived key and clear it on
 *     explicit lock / logout.
 *
 * Trade-off documented per ADR 0007 §B "Almacenamiento del masterKey":
 * mobile keeps the masterKey on-device via SecureStore. If the device is
 * compromised, so is the key — same threat model as iOS/Android Keychain
 * across the platform.
 *
 * We store the diaryKey (not masterKey) because once derived, only the
 * subkey is needed for ongoing reads/writes. Master key gets zeroed in
 * the context after subkey derivation.
 */

const KEY_DIARY_KEY = "psico_diary_key_v1";
const KEY_ECO_KEY = "psico_eco_key_v1";

export const diaryKeyStore = {
  async save(diaryKey: Uint8Array): Promise<void> {
    await SecureStore.setItemAsync(KEY_DIARY_KEY, bytesToBase64Url(diaryKey));
  },

  async load(): Promise<Uint8Array | null> {
    const stored = await SecureStore.getItemAsync(KEY_DIARY_KEY);
    if (!stored) return null;
    try {
      return base64UrlToBytes(stored);
    } catch {
      return null;
    }
  },

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY_DIARY_KEY);
    // Sprint front-eco: also clear the Eco subkey so logout / lock zeroes
    // both. Keep the calls independent so a failure on one doesn't skip
    // the other.
    try {
      await SecureStore.deleteItemAsync(KEY_ECO_KEY);
    } catch {
      // SecureStore can throw on simulator-without-Keychain edge cases —
      // swallow because the consumer (logout / lock) doesn't have a useful
      // recovery path.
    }
  },

  /**
   * Sprint front-eco: persist the Eco subkey alongside the diary one.
   * Same SecureStore namespace, separate key so the store API stays
   * symmetric with `save` above.
   */
  async saveEco(ecoKey: Uint8Array): Promise<void> {
    await SecureStore.setItemAsync(KEY_ECO_KEY, bytesToBase64Url(ecoKey));
  },

  async loadEco(): Promise<Uint8Array | null> {
    const stored = await SecureStore.getItemAsync(KEY_ECO_KEY);
    if (!stored) return null;
    try {
      return base64UrlToBytes(stored);
    } catch {
      return null;
    }
  },
};
