import { NextResponse } from "next/server";

import { guestScope } from "@/lib/circulos/bff";
import { readGuestToken } from "@/lib/circulos/guest-cookie";

/**
 * Which activity the current guest cookie is for.
 *
 * The entry page needs somewhere to send the person after the exchange, and
 * this is how it finds out — by asking the server, not by being told. The
 * exchange response deliberately carries no id, so there is never a moment
 * where the browser holds an `activityId` that did not come from the session
 * the server itself resolved.
 *
 * `participantId` is NOT returned. The room never needs it, and an internal
 * participant id in a JSON body is an id somebody can probe.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const token = readGuestToken();
  if (!token) {
    return json({ ok: false, code: "CIRCLE_FORBIDDEN" }, 401);
  }
  const scope = await guestScope(token);
  if (!scope.ok || !scope.data) {
    return json(
      { ok: false, code: scope.code ?? "CIRCLE_FORBIDDEN" },
      scope.status,
    );
  }
  return json({ activityId: scope.data.activityId }, 200);
}

function json(body: unknown, status: number): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
