import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { acceptInvitation, sameOrigin } from "@/lib/circulos/bff";
import { GUEST_COOKIE, guestCookieOptions } from "@/lib/circulos/guest-cookie";

/**
 * Trade an invitation secret for a guest session cookie.
 *
 * This is the one place the secret exists on our side, and it exists for the
 * duration of one request. It arrives in a POST body — never a query string,
 * never a path — because query strings are written to access logs, kept in
 * `Referer`, and stored in browser history, and a link that survives in any of
 * those is a link somebody else can follow.
 *
 * Nothing about the secret is echoed back. The response is a bare
 * `{ ok, activityId }`, and even `activityId` comes from the API's answer
 * rather than from anything the caller said.
 */
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

/** One refusal for every reason. See `CIRCLE_INVITATION_UNUSABLE` upstream. */
function refuse(status: number, code: string): NextResponse {
  return noStore(NextResponse.json({ ok: false, code }, { status }));
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin()) return refuse(403, "CIRCLE_FORBIDDEN");

  const body = (await request.json().catch(() => null)) as {
    secret?: unknown;
  } | null;

  const secret = body?.secret;
  if (typeof secret !== "string" || secret.length === 0) {
    return refuse(404, "CIRCLE_INVITATION_UNUSABLE");
  }

  // Straight to `accept`. This route is reached only from the explicit
  // "Aceptar invitación" button, and inspection already happened on its own
  // route when the page loaded.
  //
  // Calling `inspect` again here would be worse than redundant: `accept`
  // revalidates authoritatively inside its own transaction — it is the only
  // check that can be trusted, because anything learned before the transaction
  // can be stale by the time it opens — and a second call would spend two of
  // the ten invitation attempts the throttler allows per fifteen minutes,
  // halving how many times somebody can legitimately retry a flaky network.
  const session = await acceptInvitation(secret);
  if (!session.ok || !session.data) {
    return refuse(session.status, session.code ?? "CIRCLE_INVITATION_UNUSABLE");
  }

  const options = guestCookieOptions(session.data.expiresAt);
  if (options.maxAge <= 0) {
    // An already-expired session is not a session. Better to say "unusable"
    // than to set a cookie that fails on the next click with no explanation.
    return refuse(404, "CIRCLE_INVITATION_UNUSABLE");
  }

  const res = NextResponse.json({ ok: true }, { status: 201 });
  res.cookies.set(GUEST_COOKIE, session.data.guestSessionToken, options);
  return noStore(res);
}

/**
 * Leave.
 *
 * Clearing the cookie is the whole job: the API keeps its own record of the
 * session, and withdrawing from the activity is a separate, explicit command.
 * Nobody has to explain why they are leaving, so nothing is read from the body.
 */
export async function DELETE(): Promise<NextResponse> {
  if (!sameOrigin()) return refuse(403, "CIRCLE_FORBIDDEN");
  cookies().delete(GUEST_COOKIE);
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(GUEST_COOKIE, "", {
    ...guestCookieOptions(null),
    maxAge: 0,
  });
  return noStore(res);
}
