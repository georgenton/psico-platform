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
  },
};
