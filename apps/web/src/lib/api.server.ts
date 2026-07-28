import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserPlan, UserRole } from "@psico/types";

import { apiFetch, ApiError } from "./api";
import { TOKEN_NAMES } from "./cookies";

// ── Session user (decoded from JWT, no extra API call) ─────────────────────

export interface SessionUser {
  userId: string;
  email: string;
  role: UserRole;
  plan: UserPlan;
}

export function getSessionUser(): SessionUser | null {
  const token = getAccessToken();
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payloadJson = Buffer.from(parts[1]!, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadJson) as {
      sub?: string;
      email?: string;
      role?: string;
      plan?: string;
    };

    if (!payload.sub || !payload.email || !payload.role || !payload.plan) {
      return null;
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
      plan: payload.plan as UserPlan,
    };
  } catch {
    return null;
  }
}

// ── Server-side fetch wrapper ──────────────────────────────────────────────
//
// Usage:  const books = await serverFetch<BookListResponse>('/books')
//
// Automatic behaviour:
//   1. Attaches the stored access token to every request.
//   2. On 401, redirects to /logout (the writable boundary that clears the
//      cookies and lands on /login).
//
// It deliberately does NOT refresh the token pair. Refresh-token rotation
// revokes the old refresh and issues a new one, and a Server Component render
// cannot persist that new pair (`cookies().set()` throws here). Rotating during
// render therefore burned the session: the API revoked the old refresh while
// the browser kept holding it, so the NEXT navigation's refresh failed and the
// user was force-logged-out. The renewal now happens in the middleware, the one
// context that can write cookies — see ADR-less note in `middleware.ts`.

// ── Helper: detect Next.js redirect/notFound throws ────────────────────────
//
// `redirect()` and `notFound()` from `next/navigation` work by THROWING a
// special internal error that Next.js' framework code catches and turns
// into an HTTP redirect / 404. Any `try { ... } catch {}` block in user
// code that wraps a call to those functions (directly or transitively,
// e.g. via `serverFetch` which calls `redirect('/login')` on auth failure)
// will SWALLOW the redirect — and the page will render with stale/null
// data instead of bouncing the user to /login.
//
// This helper detects that internal throw so callers can re-throw it from
// their catch block and let Next.js do its thing.
export function isNextThrow(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

export async function serverFetch<T>(
  path: string,
  init: Omit<Parameters<typeof apiFetch>[1], "token"> = {},
): Promise<T> {
  // During a Server Component render the middleware may have just rotated the
  // pair and written the fresh access token onto the REQUEST cookies (see
  // `middleware.ts` → `refreshHandoff`), so this reflects the renewed token.
  const accessToken = getAccessToken();

  // ── The one attempt ───────────────────────────────────────────────────────
  if (accessToken) {
    try {
      return await apiFetch<T>(path, { ...init, token: accessToken });
    } catch (err) {
      // Propagate non-auth errors immediately. Log first so 5xx /
      // network failures show up in Vercel logs instead of silently
      // turning into "Failed to load" placeholders downstream.
      if (!(err instanceof ApiError) || err.status !== 401) {
        if (err instanceof ApiError) {
          console.error(`[serverFetch] ${path} → ${err.status} ${err.message}`);
        } else {
          console.error(
            `[serverFetch] ${path} network error:`,
            err instanceof Error ? err.message : err,
          );
        }
        throw err;
      }
      // A 401 falls through to /logout below. There is NO refresh here — the
      // middleware already renews an expired token before the render, so a 401
      // that still reaches this point means the token is genuinely rejected
      // (revoked or absent), not merely expired.
    }
  }

  // No usable token. Redirect to /logout — NOT /login.
  //
  // /logout runs `logoutAction`, a Route Handler where cookie writes ARE
  // allowed, so it actually clears the session and then lands on /login with
  // no loop. Redirecting straight to /login would leave the cookies in place,
  // the middleware would still see a "session", and it would bounce
  // /login → /dashboard → 401 → /login forever (ERR_TOO_MANY_REDIRECTS).
  redirect("/logout");
}

// ── Convenience: read session without making an API call ──────────────────

export function getAccessToken(): string | null {
  return cookies().get(TOKEN_NAMES.access)?.value ?? null;
}

export function getRefreshToken(): string | null {
  return cookies().get(TOKEN_NAMES.refresh)?.value ?? null;
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null || getRefreshToken() !== null;
}
