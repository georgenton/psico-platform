import { describe, it, expect } from "vitest";
import {
  deriveSubKey,
  DIARY_KEY_INFO,
  encryptString,
  decryptString,
  isValidSeedPhrase,
  masterKeyToSeedPhrase,
  seedPhraseToMasterKey,
  SEED_PHRASE_WORD_COUNT,
  MASTER_KEY_LEN,
} from "../index";

// ─── masterKey ↔ seedPhrase roundtrip ────────────────────────────────────────

describe("BIP39 seed phrase utilities", () => {
  it("encodes a 16-byte master key into 12 Spanish words", () => {
    const key = new Uint8Array(MASTER_KEY_LEN).fill(0x42);
    const phrase = masterKeyToSeedPhrase(key);
    const words = phrase.split(" ");
    expect(words.length).toBe(SEED_PHRASE_WORD_COUNT);
    expect(SEED_PHRASE_WORD_COUNT).toBe(12);
    // Every word should be from the Spanish wordlist: lowercase letters plus
    // combining marks. @scure ships the wordlist NFKD-decomposed, so an
    // accented word like "árido" is "a" + U+0301 (combining acute) rather
    // than the precomposed "á" — hence \p{M} in the class, not literal á.
    for (const w of words) {
      expect(w).toMatch(/^[\p{Ll}\p{M}]+$/u);
    }
  });

  it("roundtrips: masterKey → words → masterKey", () => {
    const key = new Uint8Array(MASTER_KEY_LEN);
    crypto.getRandomValues(key);
    const phrase = masterKeyToSeedPhrase(key);
    const recovered = seedPhraseToMasterKey(phrase);
    expect(Array.from(recovered)).toEqual(Array.from(key));
  });

  it("normalizes whitespace + case before decoding", () => {
    const key = new Uint8Array(MASTER_KEY_LEN).fill(7);
    const phrase = masterKeyToSeedPhrase(key);
    const messy = `  ${phrase.toUpperCase().split(" ").join("   ")}  `;
    const recovered = seedPhraseToMasterKey(messy);
    expect(Array.from(recovered)).toEqual(Array.from(key));
  });

  it("rejects master keys that are not exactly 16 bytes", () => {
    expect(() => masterKeyToSeedPhrase(new Uint8Array(32))).toThrow(
      "CRYPTO_INVALID_MASTER_KEY_LENGTH",
    );
    expect(() => masterKeyToSeedPhrase(new Uint8Array(15))).toThrow(
      "CRYPTO_INVALID_MASTER_KEY_LENGTH",
    );
  });

  it("rejects phrases with wrong word count", () => {
    expect(() => seedPhraseToMasterKey("abandon abandon abandon")).toThrow(
      "CRYPTO_INVALID_SEED_PHRASE",
    );
    // A valid 24-word phrase is now the WRONG length too.
    const key32 = new Uint8Array(32).fill(1);
    // (encode via a fresh 12-word phrase padded — just assert 3 words fails,
    //  a real 24-word input is exercised implicitly by the word-count guard).
    expect(() => seedPhraseToMasterKey(key32.join(" "))).toThrow(
      "CRYPTO_INVALID_SEED_PHRASE",
    );
  });

  it("rejects phrases with invalid words", () => {
    // 12 words but the last one is fake.
    const key = new Uint8Array(MASTER_KEY_LEN);
    const valid = masterKeyToSeedPhrase(key).split(" ");
    valid[SEED_PHRASE_WORD_COUNT - 1] = "zzzzzz";
    expect(() => seedPhraseToMasterKey(valid.join(" "))).toThrow(
      "CRYPTO_INVALID_SEED_PHRASE",
    );
  });

  it("rejects phrases with bad checksum", () => {
    const key = new Uint8Array(MASTER_KEY_LEN);
    const valid = masterKeyToSeedPhrase(key).split(" ");
    // Swap the last two valid words — same wordlist, broken checksum.
    const a = SEED_PHRASE_WORD_COUNT - 2;
    const b = SEED_PHRASE_WORD_COUNT - 1;
    [valid[a], valid[b]] = [valid[b], valid[a]];
    expect(() => seedPhraseToMasterKey(valid.join(" "))).toThrow(
      "CRYPTO_INVALID_SEED_PHRASE",
    );
  });
});

// ─── isValidSeedPhrase (UI helper) ───────────────────────────────────────────

describe("isValidSeedPhrase", () => {
  it("returns true for a freshly generated phrase", () => {
    const key = new Uint8Array(MASTER_KEY_LEN).fill(0xab);
    const phrase = masterKeyToSeedPhrase(key);
    expect(isValidSeedPhrase(phrase)).toBe(true);
  });

  it("returns false instead of throwing on invalid input", () => {
    expect(isValidSeedPhrase("not a phrase")).toBe(false);
    expect(isValidSeedPhrase("")).toBe(false);
    expect(isValidSeedPhrase("a".repeat(12).split("").join(" "))).toBe(false);
  });
});

// ─── End-to-end: recovery scenario ───────────────────────────────────────────

describe("recovery flow simulation", () => {
  it("user can decrypt their diary after recovering masterKey from seed", () => {
    // Sim: user creates an entry, writes the seed phrase down.
    const original = new Uint8Array(MASTER_KEY_LEN);
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
