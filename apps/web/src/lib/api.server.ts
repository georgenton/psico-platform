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
// In Server Components (read-only context) this throws — that is expected
// because the redirect() below will catch the authorisation failure anyway.
function setTokens(accessToken: string, refreshToken: string) {
  const store = cookies();
  store.set(TOKEN_NAMES.access, accessToken, cookieOptions.access);
  store.set(TOKEN_NAMES.refresh, refreshToken, cookieOptions.refresh);
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

// Attempts a token refresh.  Returns the new access token or null on failure.
async function attemptRefresh(refreshToken: string): Promise<string | null> {
  try {
    const refreshed = await authApi.refresh(refreshToken);
    setTokens(refreshed.accessToken, refreshed.refreshToken);
    return refreshed.accessToken;
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
      // Propagate non-auth errors immediately
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
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

    // Refresh failed — clean up and force re-login
    clearTokens();
  }

  // No usable token
  redirect("/login");
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
