import { describe, it, expect } from "vitest";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  decryptString,
  deriveMasterKey,
  deriveSubKey,
  DIARY_KEY_INFO,
  ECO_KEY_INFO,
  encryptString,
  KEY_LEN,
  MASTER_KEY_LEN,
  NONCE_LEN,
} from "../index";

// ─── base64url roundtrip ─────────────────────────────────────────────────────

describe("base64url helpers", () => {
  it("roundtrips arbitrary bytes", () => {
    const input = new Uint8Array([0, 1, 2, 250, 251, 255, 100, 200, 9]);
    const b64 = bytesToBase64Url(input);
    expect(b64).not.toContain("=");
    expect(b64).not.toContain("+");
    expect(b64).not.toContain("/");
    const out = base64UrlToBytes(b64);
    expect(Array.from(out)).toEqual(Array.from(input));
  });

  it("decodes 24-byte nonce length cleanly", () => {
    const input = new Uint8Array(NONCE_LEN).fill(0xab);
    const b64 = bytesToBase64Url(input);
    expect(base64UrlToBytes(b64).length).toBe(NONCE_LEN);
  });

  it("accepts strings with stray padding", () => {
    const padded = "AQID==";
    const out = base64UrlToBytes(padded);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it("throws on invalid character", () => {
    expect(() => base64UrlToBytes("AQ!D")).toThrow();
  });
});

// ─── deriveMasterKey ─────────────────────────────────────────────────────────

describe("deriveMasterKey (Argon2id)", () => {
  // We're using a SHORT-IGNORED-input here only to test the type contract.
  // The real Argon2id parameters are slow (~500ms) which is fine in a real
  // workload but would dominate the test suite. We test correctness end-
  // to-end via a single derivation + roundtrip.
  const SALT_B64 = bytesToBase64Url(new Uint8Array(16).fill(7));

  it("returns 16-byte master key (128-bit, 12-word recovery)", async () => {
    const key = await deriveMasterKey("contraseña-segura", SALT_B64);
    expect(key.length).toBe(MASTER_KEY_LEN);
    expect(MASTER_KEY_LEN).toBe(16);
  });

  it("is deterministic for same password + salt", async () => {
    const a = await deriveMasterKey("hola", SALT_B64);
    const b = await deriveMasterKey("hola", SALT_B64);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("different password → different key (avalanche)", async () => {
    const a = await deriveMasterKey("hola", SALT_B64);
    const b = await deriveMasterKey("Hola", SALT_B64);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("rejects empty password", async () => {
    await expect(deriveMasterKey("", SALT_B64)).rejects.toThrow(
      "CRYPTO_EMPTY_PASSWORD",
    );
  });

  it("rejects empty salt", async () => {
    await expect(deriveMasterKey("hola", "")).rejects.toThrow(
      "CRYPTO_EMPTY_SALT",
    );
  });

  it("rejects salt < 16 bytes (OWASP minimum)", async () => {
    const shortSalt = bytesToBase64Url(new Uint8Array(8));
    await expect(deriveMasterKey("hola", shortSalt)).rejects.toThrow(
      "CRYPTO_SALT_TOO_SHORT",
    );
  });
}, 30_000);

// ─── deriveSubKey ────────────────────────────────────────────────────────────

describe("deriveSubKey (HKDF)", () => {
  const masterKey = new Uint8Array(MASTER_KEY_LEN).fill(42);

  it("returns 32-byte subkey from a 16-byte master key", () => {
    const k = deriveSubKey(masterKey, DIARY_KEY_INFO);
    expect(k.length).toBe(KEY_LEN);
  });

  it("diary subkey != eco subkey (domain separation)", () => {
    const diary = deriveSubKey(masterKey, DIARY_KEY_INFO);
    const eco = deriveSubKey(masterKey, ECO_KEY_INFO);
    expect(Array.from(diary)).not.toEqual(Array.from(eco));
  });

  it("is deterministic", () => {
    const a = deriveSubKey(masterKey, DIARY_KEY_INFO);
    const b = deriveSubKey(masterKey, DIARY_KEY_INFO);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("rejects a master key that is not exactly 16 bytes", () => {
    expect(() => deriveSubKey(new Uint8Array(32), DIARY_KEY_INFO)).toThrow(
      "CRYPTO_INVALID_MASTER_KEY_LENGTH",
    );
  });
});

// ─── encrypt/decrypt roundtrip ───────────────────────────────────────────────

describe("encryptString / decryptString (XChaCha20-Poly1305)", () => {
  const key = new Uint8Array(32).fill(13);

  it("roundtrips ASCII", () => {
    const env = encryptString("hello world", key);
    expect(decryptString(env, key)).toBe("hello world");
  });

  it("roundtrips Spanish + emoji", () => {
    const text = "Hoy me sentí ✨ tranquilo · día gris ☔";
    const env = encryptString(text, key);
    expect(decryptString(env, key)).toBe(text);
  });

  it("roundtrips multiline + long content", () => {
    const text = Array.from({ length: 100 }, (_, i) => `linea ${i}`).join("\n");
    const env = encryptString(text, key);
    expect(decryptString(env, key)).toBe(text);
  });

  it("nonce is 24 bytes base64url-encoded", () => {
    const env = encryptString("x", key);
    expect(base64UrlToBytes(env.nonce).length).toBe(NONCE_LEN);
  });

  it("two writes with same key + plaintext → different ciphertext (random nonce)", () => {
    const a = encryptString("repeat me", key);
    const b = encryptString("repeat me", key);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it("decrypt with wrong key throws CRYPTO_DECRYPT_FAILED", () => {
    const env = encryptString("secret", key);
    const wrongKey = new Uint8Array(32).fill(99);
    expect(() => decryptString(env, wrongKey)).toThrow("CRYPTO_DECRYPT_FAILED");
  });

  it("decrypt with tampered ciphertext throws CRYPTO_DECRYPT_FAILED", () => {
    const env = encryptString("secret", key);
    // Deterministic mutation: flip one bit of the ciphertext bytes. The old
    // string-slice mutation (`slice(0,-2)+"AA"`) was a no-op ~1/N of the time
    // when the ciphertext already ended in "AA", making the test flaky (#557).
    const bytes = base64UrlToBytes(env.ciphertext);
    const index = bytes.length - 1;
    bytes[index] ^= 0x01;
    const tampered = { ...env, ciphertext: bytesToBase64Url(bytes) };
    expect(() => decryptString(tampered, key)).toThrow("CRYPTO_DECRYPT_FAILED");
  });

  it("decrypt with wrong nonce throws CRYPTO_DECRYPT_FAILED", () => {
    const env = encryptString("secret", key);
    const wrongNonce = bytesToBase64Url(new Uint8Array(NONCE_LEN).fill(1));
    expect(() => decryptString({ ...env, nonce: wrongNonce }, key)).toThrow(
      "CRYPTO_DECRYPT_FAILED",
    );
  });

  it("decrypt with non-24-byte nonce throws CRYPTO_DECRYPT_FAILED", () => {
    const env = encryptString("secret", key);
    const shortNonce = bytesToBase64Url(new Uint8Array(8));
    expect(() => decryptString({ ...env, nonce: shortNonce }, key)).toThrow(
      "CRYPTO_DECRYPT_FAILED",
    );
  });
});

// ─── End-to-end ──────────────────────────────────────────────────────────────

describe("end-to-end derivation + cipher roundtrip", () => {
  it("password → masterKey → diaryKey → encrypt → decrypt", async () => {
    const salt = bytesToBase64Url(new Uint8Array(16).fill(0xab));
    const master = await deriveMasterKey("mi-contraseña-fuerte-2026", salt);
    const diary = deriveSubKey(master, DIARY_KEY_INFO);

    const env = encryptString("Lo que pensé hoy.", diary);
    expect(decryptString(env, diary)).toBe("Lo que pensé hoy.");

    // Wrong password → wrong masterKey → wrong diaryKey → decrypt fails.
    const masterB = await deriveMasterKey("otra-contraseña", salt);
    const diaryB = deriveSubKey(masterB, DIARY_KEY_INFO);
    expect(() => decryptString(env, diaryB)).toThrow("CRYPTO_DECRYPT_FAILED");
  });
}, 30_000);
