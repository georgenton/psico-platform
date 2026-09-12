import "server-only";

import { cookies } from "next/headers";

/**
 * The guest session cookie.
 *
 * The raw guest token is issued exactly once, by `POST /api/circles/invitations/
 * accept`, and it is the only thing standing between a stranger and somebody
 * else's Dúo. So it goes straight into an `HttpOnly` cookie and is never handed
 * back to the browser in any form a script can read: not a body, not a header,
 * not an inlined prop, not a data attribute.
 *
 * `SameSite=Lax` rather than `Strict` because the person arrives by following a
 * link somebody sent them — a cross-site top-level GET. `Strict` would withhold
 * the cookie on exactly that navigation and the room would look logged-out to
 * the one person it belongs to. `Lax` still withholds it from cross-site POSTs,
 * which is where CSRF lives, and the command handlers check `Origin` on top.
 *
 * `Secure` follows the deployment rather than being hardcoded: on `localhost`
 * over plain HTTP a `Secure` cookie is silently dropped, so the flow would be
 * untestable locally. Every deployed environment is HTTPS and gets the flag.
 */
export const GUEST_COOKIE = "fv_circulo_guest";

/**
 * Hard ceiling regardless of what the API says, in seconds.
 *
 * Thirty days, because that is `GUEST_SESSION_TTL_MS` — the lifetime PR3
 * actually issues. A shorter ceiling here would not make anything safer: the
 * server would still honour the session, and the person would simply be logged
 * out of their own activity early with no way to tell why. The rule that
 * matters is the one below — never past the `expiresAt` the API returned.
 */
const MAX_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export function guestCookieOptions(expiresAt: string | null): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // `/` — and this is the root path, not a narrow one. It is the only common
    // prefix of `/i`, `/compartir` and `/api/circulos`, so a single cookie
    // cannot be scoped tighter without splitting it into three. That is a
    // real trade-off, not a scoping win, and calling it "as narrow as
    // possible" would be dressing it up: the cookie is sent on every
    // same-site request to this origin. Narrowing it belongs to the pilot
    // hardening, with the route layout designed for it.
    path: "/",
    maxAge: lifetimeSeconds(expiresAt),
  };
}

/**
 * The cookie never outlives the session it carries.
 *
 * A cookie that survives its token is not a longer session — it is a browser
 * that keeps presenting a credential the server has already stopped honouring,
 * so every action fails with no way for the person to tell why. Anything
 * unparseable, already past, or beyond the ceiling collapses to the ceiling or
 * to zero rather than to "forever".
 */
export function lifetimeSeconds(expiresAt: string | null): number {
  if (!expiresAt) return MAX_LIFETIME_SECONDS;
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return MAX_LIFETIME_SECONDS;
  const seconds = Math.floor((ms - Date.now()) / 1000);
  if (seconds <= 0) return 0;
  return Math.min(seconds, MAX_LIFETIME_SECONDS);
}

export function readGuestToken(): string | null {
  return cookies().get(GUEST_COOKIE)?.value ?? null;
}
