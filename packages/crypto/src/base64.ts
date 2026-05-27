/**
 * Base64url helpers.
 *
 * The wire format for `textCiphertext`, `textNonce`, and friends is
 * base64url (RFC 4648 §5) with NO padding. Buffers ↔ strings live behind
 * these two functions so callers never copy-paste the conversion.
 *
 * We deliberately don't depend on Node's Buffer — this package runs in
 * browser and React Native, where atob/btoa exist but only handle UTF-16.
 * The encode/decode below use Uint8Array end-to-end.
 */

const BASE64URL_LOOKUP =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64URL_LOOKUP[b0 >> 2];
    out += BASE64URL_LOOKUP[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += BASE64URL_LOOKUP[((b1 & 0x0f) << 2) | (b2 >> 6)];
    out += BASE64URL_LOOKUP[b2 & 0x3f];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const b0 = bytes[i];
    out += BASE64URL_LOOKUP[b0 >> 2];
    out += BASE64URL_LOOKUP[(b0 & 0x03) << 4];
  } else if (rem === 2) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    out += BASE64URL_LOOKUP[b0 >> 2];
    out += BASE64URL_LOOKUP[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += BASE64URL_LOOKUP[(b1 & 0x0f) << 2];
  }
  return out;
}

export function base64UrlToBytes(value: string): Uint8Array {
  // Strip padding if any client mistakenly sent it.
  const clean = value.replace(/=+$/, "");
  const len = clean.length;
  const byteLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(byteLen);

  let outIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = lookupIndex(clean.charCodeAt(i));
    const c1 = lookupIndex(clean.charCodeAt(i + 1));
    const c2 = i + 2 < len ? lookupIndex(clean.charCodeAt(i + 2)) : -1;
    const c3 = i + 3 < len ? lookupIndex(clean.charCodeAt(i + 3)) : -1;

    out[outIdx++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) out[outIdx++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    if (c3 >= 0) out[outIdx++] = ((c2 & 0x03) << 6) | c3;
  }
  return out;
}

function lookupIndex(charCode: number): number {
  // A-Z
  if (charCode >= 65 && charCode <= 90) return charCode - 65;
  // a-z
  if (charCode >= 97 && charCode <= 122) return charCode - 97 + 26;
  // 0-9
  if (charCode >= 48 && charCode <= 57) return charCode - 48 + 52;
  // - and _
  if (charCode === 45) return 62;
  if (charCode === 95) return 63;
  throw new Error("Invalid base64url character");
}

/** UTF-8 string → bytes, with the modern web/RN-friendly TextEncoder. */
export function stringToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** Bytes → UTF-8 string. Throws on invalid sequences (good — catches tamper). */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
