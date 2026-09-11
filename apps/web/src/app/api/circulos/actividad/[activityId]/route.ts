import { NextResponse } from "next/server";

import {
  guestScope,
  readActivityAsGuest,
  readActivityAsMember,
} from "@/lib/circulos/bff";
import { readGuestToken } from "@/lib/circulos/guest-cookie";
import { getAccessToken } from "@/lib/api.server";

/**
 * The activity, as the API filtered it for whoever is asking.
 *
 * This is the read the room polls. It returns the API's `CircleActivityView`
 * unchanged and adds nothing: the filtering that keeps the other person's
 * content out of the payload before the reveal happens server-side, in the
 * projection, and a web layer that "helpfully" merged in anything else would be
 * undoing it.
 *
 * Which credential is used is decided here, not by the caller. A guest cookie
 * makes it a guest read; otherwise the session cookie makes it a member read.
 * There is no parameter that selects a role.
 */
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export async function GET(
  _request: Request,
  { params }: { params: { activityId: string } },
): Promise<NextResponse> {
  const activityId = params.activityId;

  const guestToken = readGuestToken();
  if (guestToken) {
    const scope = await guestScope(guestToken);
    if (!scope.ok || !scope.data) {
      return noStore(
        NextResponse.json(
          { ok: false, code: scope.code ?? "CIRCLE_FORBIDDEN" },
          { status: scope.status },
        ),
      );
    }
    if (scope.data.activityId !== activityId) {
      // The guest holds a session for a different activity. Refuse with the
      // same shape as "no such activity" — a distinguishable answer would let
      // somebody enumerate which ids exist.
      return noStore(
        NextResponse.json(
          { ok: false, code: "CIRCLE_FORBIDDEN" },
          { status: 403 },
        ),
      );
    }
    const view = await readActivityAsGuest(guestToken, activityId);
    return noStore(
      NextResponse.json(view.ok ? view.data : { ok: false, code: view.code }, {
        status: view.status,
      }),
    );
  }

  const accessToken = getAccessToken();
  if (!accessToken) {
    return noStore(
      NextResponse.json(
        { ok: false, code: "CIRCLE_FORBIDDEN" },
        { status: 401 },
      ),
    );
  }
  const view = await readActivityAsMember(accessToken, activityId);
  return noStore(
    NextResponse.json(view.ok ? view.data : { ok: false, code: view.code }, {
      status: view.status,
    }),
  );
}
