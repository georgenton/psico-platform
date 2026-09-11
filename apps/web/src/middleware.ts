import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { TOKEN_NAMES, cookieOptions } from "@/lib/cookies";

const PROTECTED_PREFIXES = ["/dashboard"];
const AUTH_PREFIXES = ["/login", "/register"];

// The authenticated, server-rendered areas whose Server Components call
// `serverFetch`. `serverFetch` no longer rotates the token pair itself — it
// cannot persist cookies during a render — so the renewal happens HERE, before
// the render, in the one place that CAN write cookies onto the response.
const SESSION_PREFIXES = ["/dashboard", "/onboarding", "/autor"];

const API_ROOT = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Refresh a little before the real expiry so a token that dies mid-request is
// never handed to the render.
const CLOCK_SKEW_MS = 10_000;

/**
 * Read the `exp` claim WITHOUT verifying the signature. Middleware runs on the
 * Edge and must not hold the signing secret; all it needs is a clock decision
 * about whether to attempt a refresh. A token we cannot parse is treated as
 * expired — the worst case is one extra refresh, which is safe.
 */
function isAccessExpired(token: string | null): boolean {
  if (!token) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return true;
  try {
    const seg = parts[1]!;
    const b64 = seg
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(seg.length / 4) * 4, "=");
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    if (typeof payload.exp !== "number") return true;
    return payload.exp * 1000 <= Date.now() + CLOCK_SKEW_MS;
  } catch {
    return true;
  }
}

interface RotatedPair {
  accessToken: string;
  refreshToken: string;
}

/** Thrown so the caller can branch on the refresh endpoint's status. */
class RefreshFailed extends Error {
  constructor(readonly status: number) {
    super(`refresh failed: ${status}`);
  }
}

async function callRefresh(refreshToken: string): Promise<RotatedPair> {
  const res = await fetch(`${API_ROOT.replace(/\/$/, "")}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The refresh token travels ONLY in the JSON body over TLS — never a query
    // string, never a log. The rotated pair likewise never leaves this module
    // except as HttpOnly cookies.
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new RefreshFailed(res.status);
  const data = (await res.json()) as Partial<RotatedPair>;
  if (!data.accessToken || !data.refreshToken) {
    // A 200 without a usable pair is as unusable as a 5xx — treat it as a
    // transient failure, never as a revocation.
    throw new RefreshFailed(502);
  }
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

/**
 * A safe, non-looping temporary failure. The refresh endpoint is down or
 * throttled but the session is probably fine, so we do NOT touch cookies and we
 * do NOT render the dashboard (which would 401 the still-expired access token
 * and bounce the user through /logout). The browser shows this once; the next
 * navigation retries the handoff.
 */
function temporaryUnavailable(): NextResponse {
  return new NextResponse(
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Un momento</title></head><body style="font-family:system-ui;' +
      "max-width:32rem;margin:20vh auto;padding:0 1.5rem;text-align:center;" +
      'color:#3f3b36">' +
      '<h1 style="font-size:1.25rem">Estamos reconectando tu sesión</h1>' +
      '<p style="color:#6b655d;line-height:1.6">No pudimos renovar tu sesión ' +
      "en este momento. Vuelve a intentarlo en unos segundos.</p></body></html>",
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * The writable refresh boundary. Runs BEFORE the render, rotates the pair, and
 * persists it on both the request (so this render's `cookies()` sees the new
 * access token) and the response (so the browser stores the rotated pair). At
 * most one refresh call per navigation.
 */
async function refreshHandoff(
  request: NextRequest,
  refreshToken: string,
): Promise<NextResponse> {
  let pair: RotatedPair;
  try {
    pair = await callRefresh(refreshToken);
  } catch (err) {
    const status = err instanceof RefreshFailed ? err.status : 0;
    // 401/403/410 = the refresh token itself is invalid or revoked. Only then
    // do we end the session, via the existing logout convention (a writable
    // Route Handler that clears the cookies and lands on /login).
    if (status === 401 || status === 403 || status === 410) {
      return NextResponse.redirect(new URL("/logout", request.url));
    }
    // Everything else (429, 5xx, network) is transient: no cookie change, no
    // logout, no loop.
    return temporaryUnavailable();
  }

  // Forward the rotated access token to THIS render: set it on the request
  // cookie jar, then snapshot the (now-updated) request headers for the
  // downstream Server Components.
  request.cookies.set(TOKEN_NAMES.access, pair.accessToken);
  request.cookies.set(TOKEN_NAMES.refresh, pair.refreshToken);
  const response = NextResponse.next({
    request: { headers: new Headers(request.headers) },
  });
  // Persist the rotated pair to the browser.
  response.cookies.set(
    TOKEN_NAMES.access,
    pair.accessToken,
    cookieOptions.access,
  );
  response.cookies.set(
    TOKEN_NAMES.refresh,
    pair.refreshToken,
    cookieOptions.refresh,
  );
  return response;
}

// ── Círculos: a strict CSP that Next.js can still hydrate under ─────────────
//
// The guest flow loads nothing from a third party, so it can afford the
// strictest policy in the app — but `script-src 'self'` alone is NOT it. Next
// emits inline bootstrap scripts on every App Router page, and a policy without
// a nonce blocks them: the page renders its server HTML, never hydrates, and
// every client effect silently fails to run. On `/i` that means the fragment is
// never read and never erased from the address bar — the page would look fine
// and do the one thing it exists to prevent.
//
// So the nonce is per request, which is why this lives in middleware rather
// than in `next.config.js` (static headers cannot carry one). `strict-dynamic`
// lets the nonce'd bootstrap load the chunks it needs without naming each.
//
// `'unsafe-eval'` is DEVELOPMENT ONLY: the dev runtime evaluates strings for
// hot reload. Production gets no eval.
const CIRCULOS_CSP_PREFIXES = ["/i", "/compartir", "/api/circulos"];

export function isCirculosPath(pathname: string): boolean {
  // `pathname === p` or a real segment boundary — so `/index` and `/imagenes`
  // are NOT `/i`.
  return CIRCULOS_CSP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** The policy for a path, or `null` when the path is not one of ours. */
export function circulosCspFor(
  pathname: string,
  nonce: string,
  env: string | undefined = process.env.NODE_ENV,
): string | null {
  if (!isCirculosPath(pathname)) return null;

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    env === "development" ? "'unsafe-eval'" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The path check comes first: this middleware runs on every request in the
  // app, and only these three prefixes need a nonce.
  if (isCirculosPath(pathname)) {
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const policy = circulosCspFor(pathname, nonce)!;

    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    // The policy goes on the REQUEST headers as well, and this is the part
    // that makes the nonce real rather than decorative. Next reads the incoming
    // `Content-Security-Policy`, finds the nonce in it, and stamps that same
    // value onto every inline script it emits. Setting it only on the response
    // produces a header whose nonce matches nothing on the page — the scripts
    // are still unnonced, still blocked, and the page still fails to hydrate,
    // while the header reads as if it were working.
    headers.set("Content-Security-Policy", policy);

    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", policy);
    return response;
  }

  const accessToken = request.cookies.get(TOKEN_NAMES.access)?.value ?? null;
  const refreshToken = request.cookies.get(TOKEN_NAMES.refresh)?.value ?? null;
  // A session exists if EITHER token is present. The access token may be
  // expired; the refresh handoff below renews it before the render.
  const hasSession = Boolean(accessToken || refreshToken);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PREFIXES.some((p) => pathname.startsWith(p));
  const needsSession = SESSION_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Renew the pair in the one writable place before the render, but only when a
  // renewal is actually needed: an authenticated area, a refresh token to
  // spend, and an access token that is missing or expired.
  if (needsSession && refreshToken && isAccessExpired(accessToken)) {
    return refreshHandoff(request, refreshToken);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
