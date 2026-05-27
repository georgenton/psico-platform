import { describe, it, expect } from "vitest";
import {
  deriveSubKey,
  DIARY_KEY_INFO,
  encryptString,
  decryptString,
  isValidSeedPhrase,
  masterKeyToSeedPhrase,
  seedPhraseToMasterKey,
} from "../index";

// ─── masterKey ↔ seedPhrase roundtrip ────────────────────────────────────────

describe("BIP39 seed phrase utilities", () => {
  it("encodes a 32-byte master key into 24 English words", () => {
    const key = new Uint8Array(32).fill(0x42);
    const phrase = masterKeyToSeedPhrase(key);
    const words = phrase.split(" ");
    expect(words.length).toBe(24);
    // Every word should be from the English wordlist (lowercase ASCII).
    for (const w of words) {
      expect(w).toMatch(/^[a-z]+$/);
    }
  });

  it("roundtrips: masterKey → words → masterKey", () => {
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);
    const phrase = masterKeyToSeedPhrase(key);
    const recovered = seedPhraseToMasterKey(phrase);
    expect(Array.from(recovered)).toEqual(Array.from(key));
  });

  it("normalizes whitespace + case before decoding", () => {
    const key = new Uint8Array(32).fill(7);
    const phrase = masterKeyToSeedPhrase(key);
    const messy = `  ${phrase.toUpperCase().split(" ").join("   ")}  `;
    const recovered = seedPhraseToMasterKey(messy);
    expect(Array.from(recovered)).toEqual(Array.from(key));
  });

  it("rejects master keys that are not exactly 32 bytes", () => {
    expect(() => masterKeyToSeedPhrase(new Uint8Array(16))).toThrow(
      "CRYPTO_INVALID_MASTER_KEY_LENGTH",
    );
    expect(() => masterKeyToSeedPhrase(new Uint8Array(33))).toThrow(
      "CRYPTO_INVALID_MASTER_KEY_LENGTH",
    );
  });

  it("rejects phrases with wrong word count", () => {
    expect(() => seedPhraseToMasterKey("abandon abandon abandon")).toThrow(
      "CRYPTO_INVALID_SEED_PHRASE",
    );
  });

  it("rejects phrases with invalid words", () => {
    // 24 words but the last one is fake.
    const key = new Uint8Array(32);
    const valid = masterKeyToSeedPhrase(key).split(" ");
    valid[23] = "zzzzzz";
    expect(() => seedPhraseToMasterKey(valid.join(" "))).toThrow(
      "CRYPTO_INVALID_SEED_PHRASE",
    );
  });

  it("rejects phrases with bad checksum", () => {
    const key = new Uint8Array(32);
    const valid = masterKeyToSeedPhrase(key).split(" ");
    // Swap the last two valid words — same wordlist, broken checksum.
    [valid[22], valid[23]] = [valid[23], valid[22]];
    expect(() => seedPhraseToMasterKey(valid.join(" "))).toThrow(
      "CRYPTO_INVALID_SEED_PHRASE",
    );
  });
});

// ─── isValidSeedPhrase (UI helper) ───────────────────────────────────────────

describe("isValidSeedPhrase", () => {
  it("returns true for a freshly generated phrase", () => {
    const key = new Uint8Array(32).fill(0xab);
    const phrase = masterKeyToSeedPhrase(key);
    expect(isValidSeedPhrase(phrase)).toBe(true);
  });

  it("returns false instead of throwing on invalid input", () => {
    expect(isValidSeedPhrase("not a phrase")).toBe(false);
    expect(isValidSeedPhrase("")).toBe(false);
    expect(isValidSeedPhrase("a".repeat(24).split("").join(" "))).toBe(false);
  });
});

// ─── End-to-end: recovery scenario ───────────────────────────────────────────

describe("recovery flow simulation", () => {
  it("user can decrypt their diary after recovering masterKey from seed", () => {
    // Sim: user creates an entry, writes the seed phrase down.
    const original = new Uint8Array(32);
    crypto.getRandomValues(original);
    const phrase = masterKeyToSeedPhrase(original);
    const diaryKey = deriveSubKey(original, DIARY_KEY_INFO);
    const envelope = encryptString("Lo que escribí ayer.", diaryKey);

    // Months later: user forgot password, opens recovery flow, types phrase.
    const recovered = seedPhraseToMasterKey(phrase);
    const recoveredDiaryKey = deriveSubKey(recovered, DIARY_KEY_INFO);

    // The recovered diaryKey decrypts the old entry.
    expect(decryptString(envelope, recoveredDiaryKey)).toBe(
      "Lo que escribí ayer.",
    );
  });
});
