import { NextResponse } from "next/server";

import { logoutAction } from "@/actions/auth";

/**
 * /logout — Route Handler (GET).
 *
 * `logoutAction` clears the auth + diary-wrap cookies. Cookie mutation is only
 * allowed in a Route Handler or a Server Action — NEVER during a page render.
 * The previous `page.tsx` awaited `logoutAction()` at render time, so every GET
 * to /logout threw ("Cookies can only be modified in a Server Action or Route
 * Handler") and returned a 500. That broke the 401 escape hatch: an expired
 * session redirects to /logout (see `lib/api.server.ts`), which then 500'd
 * instead of bouncing the user to a clean /login.
 *
 * A Route Handler is a valid cookie-mutation context, so `logoutAction()` runs
 * cleanly here and ends in `redirect("/login")` (throws NEXT_REDIRECT, which
 * Next turns into a 307). The `<form action={logoutAction}>` in the dashboard
 * shell already worked — it invokes the action in a POST/Server-Action context.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await logoutAction();
  // Unreachable: logoutAction always ends in `redirect("/login")`, whose thrown
  // NEXT_REDIRECT propagates out before this line. Kept so the handler's return
  // type is valid and /logout can never 500 again.
  return NextResponse.redirect(new URL("/login", request.url));
}
