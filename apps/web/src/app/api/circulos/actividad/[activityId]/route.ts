import { NextResponse } from "next/server";

import { readActivityAs, resolveActor } from "@/lib/circulos/actor";

/**
 * The activity, as the API filtered it for whoever is asking.
 *
 * This is the read the room polls. It returns the API's `CircleActivityView`
 * unchanged and adds nothing: the filtering that keeps the other person's
 * content out of the payload before the reveal happens server-side, in the
 * projection, and a web layer that "helpfully" merged in anything else would be
 * undoing it.
 *
 * Which credential is used is decided by `resolveActor` — the same resolver the
 * room's first render and every command use — never by the caller. There is no
 * parameter that selects a role.
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
  const actor = await resolveActor(params.activityId);
  const read = await readActivityAs(actor, params.activityId);

  return noStore(
    NextResponse.json(
      read.view ?? { ok: false, code: read.code ?? "CIRCLE_FORBIDDEN" },
      { status: read.view ? 200 : read.status },
    ),
  );
}
