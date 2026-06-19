"use server";

import { cookies } from "next/headers";

/**
 * Diary session persistence — Option C from the unlock UX discussion.
 *
 * The user's master key never leaves the browser unencrypted. To survive a
 * page reload we split the secret into two halves that must be re-united:
 *
 *  1. An encrypted bundle (ciphertext + nonce) of the master key, stored in
 *     `localStorage` — readable from JS, but useless without (2).
 *  2. The 32-byte wrapping key (`K_wrap`) that decrypts that bundle, stored
 *     in this HttpOnly cookie — NOT readable from JS, only echoed back via
 *     server actions.
 *
 * The cookie lives on the web origin only (Vercel), never reaches the API
 * on Railway. An attacker needs BOTH the cookie (server-side leak) AND the
 * localStorage payload (XSS or filesystem access) to recover the master
 * key. Defense in depth: same theft surface as standard session cookies,
 * without exposing the master key to JS pivots that can read either alone.
 *
 * The actions here are intentionally tiny and pure I/O so the cripto side
 * stays in the client (`diary-key-context.tsx`). Their only job is to
 * persist + retrieve `K_wrap` from the cookie jar.
 */

const COOKIE_NAME = "psico_diary_wrap";
/** 30 days, per the UX decision recorded in CLAUDE.md. */
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Persist the wrap key in the diary session cookie. The value is a 32-byte
 * random buffer encoded as base64url (43 characters), produced client-side.
 *
 * The cookie is HttpOnly + Secure + sameSite=lax so it travels with normal
 * navigations to the same origin but is unreadable from JS — including from
 * any same-origin XSS payload that lands later. `secure` is gated by
 * NODE_ENV so local dev over plain HTTP still works.
 */
export async function saveDiaryWrapKey(keyB64u: string): Promise<void> {
  if (!isValidBase64UrlKey(keyB64u)) {
    // Reject silently — we never want the cookie to hold garbage. The client
    // will fall through to the unlock form on next mount.
    return;
  }
  cookies().set({
    name: COOKIE_NAME,
    value: keyB64u,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Read the wrap key from the cookie. Returns `null` when no session is
 * persisted (cold start, fresh device, expired, or user cleared cookies).
 *
 * Intended use: layout-level read in a Server Component, then pass the
 * value down to `DiaryKeyProvider` so the client can restore the master
 * key without prompting for the password.
 */
export async function getDiaryWrapKey(): Promise<string | null> {
  const value = cookies().get(COOKIE_NAME)?.value;
  return value && isValidBase64UrlKey(value) ? value : null;
}

/**
 * Drop the diary session entirely. Called on:
 *  - explicit "Bloquear Diario" press,
 *  - logout,
 *  - decrypt failure (stale wrap key, password rotated on another device),
 *  - password change with re-encrypt (the client follows up with a fresh
 *    `saveDiaryWrapKey` once the new master key is generated).
 */
export async function clearDiaryWrapKey(): Promise<void> {
  cookies().delete(COOKIE_NAME);
}

/**
 * Validate the cookie payload. A 32-byte random key encoded as unpadded
 * base64url is 43 chars long and uses only the URL-safe alphabet. Anything
 * else is either tampering or a stale prior format — treat as missing.
 */
function isValidBase64UrlKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
