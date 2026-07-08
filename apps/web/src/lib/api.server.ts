import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserPlan, UserRole } from "@psico/types";

import { apiFetch, ApiError, authApi } from "./api";
import { TOKEN_NAMES, cookieOptions } from "./cookies";

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

// ── Token helpers ──────────────────────────────────────────────────────────

function getTokens() {
  const store = cookies();
  return {
    accessToken: store.get(TOKEN_NAMES.access)?.value ?? null,
    refreshToken: store.get(TOKEN_NAMES.refresh)?.value ?? null,
  };
}

// Sets new tokens after a successful refresh.
// In Server Components (read-only context) `cookies().set()` throws. We
// swallow that here — attemptRefresh still resolves with the new token so
// the in-flight request can retry; the cookie itself rotates on the next
// Server Action or Route Handler (middleware bumps it).
function setTokens(accessToken: string, refreshToken: string) {
  try {
    const store = cookies();
    store.set(TOKEN_NAMES.access, accessToken, cookieOptions.access);
    store.set(TOKEN_NAMES.refresh, refreshToken, cookieOptions.refresh);
  } catch {
    // Server Component context — cookies are read-only. Documented above.
  }
}

function clearTokens() {
  try {
    const store = cookies();
    store.delete(TOKEN_NAMES.access);
    store.delete(TOKEN_NAMES.refresh);
  } catch {
    // In Server Component context, cookie writes are not allowed.
    // Middleware will clean up on the next request.
  }
}

// Attempts a token refresh.  Returns the new access token, or null on a
// genuine auth failure (invalid/expired refresh token → the caller logs the
// user out).
//
// Transient failures — a rate limit (429) or a server error (5xx) — are NOT
// auth failures: the session is probably still valid, the backend is just
// busy. We RE-THROW those so the caller surfaces the error instead of
// bouncing the user through /logout on a temporary hiccup (which is what
// caused the ERR_TOO_MANY_REDIRECTS loop when the refresh endpoint got
// throttled).
async function attemptRefresh(refreshToken: string): Promise<string | null> {
  try {
    const refreshed = await authApi.refresh(refreshToken);
    setTokens(refreshed.accessToken, refreshed.refreshToken);
    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 429 || err.status >= 500)) {
      throw err;
    }
    return null;
  }
}

// ── Server-side fetch wrapper ──────────────────────────────────────────────
//
// Usage:  const books = await serverFetch<BookListResponse>('/books')
//
// Automatic behaviour:
//   1. Attaches the stored access token to every request.
//   2. On 401, attempts a silent token refresh.
//   3. If refresh also fails (or no tokens exist), redirects to /login.

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
  const { accessToken, refreshToken } = getTokens();

  // ── First attempt ────────────────────────────────────────────────────────
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
      // Fall through to refresh
    }
  }

  // ── Refresh attempt ──────────────────────────────────────────────────────
  if (refreshToken) {
    const newToken = await attemptRefresh(refreshToken);

    if (newToken) {
      // Retry the original request with the fresh token
      return apiFetch<T>(path, { ...init, token: newToken });
    }

    // Refresh failed with a genuine auth error — clean up and force re-login.
    clearTokens();
  }

  // No usable token. Redirect to /logout — NOT /login.
  //
  // Clearing cookies here (clearTokens above) is a no-op during a Server
  // Component render: `cookies().delete()` throws and we swallow it. So the
  // cookies survive, the middleware still sees a "session", and it bounces
  // /login → /dashboard → serverFetch fails again → /login … forever
  // (ERR_TOO_MANY_REDIRECTS). /logout runs `logoutAction`, a Server Action
  // where cookie writes ARE allowed, so it actually clears the session and
  // then lands on /login with no loop.
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
