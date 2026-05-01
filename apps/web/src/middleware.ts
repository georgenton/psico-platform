import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { TOKEN_NAMES } from "@/lib/cookies";

const PROTECTED_PREFIXES = ["/dashboard"];
const AUTH_PREFIXES = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasAccessToken = Boolean(
    request.cookies.get(TOKEN_NAMES.access)?.value,
  );
  const hasRefreshToken = Boolean(
    request.cookies.get(TOKEN_NAMES.refresh)?.value,
  );
  // Consider the user authenticated if either token is present.
  // The access token may be expired; serverFetch will handle the silent
  // refresh when the first API call fires.
  const hasSession = hasAccessToken || hasRefreshToken;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PREFIXES.some((p) => pathname.startsWith(p));

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

  return NextResponse.next();
}

export const config = {
  // Run on all paths except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
