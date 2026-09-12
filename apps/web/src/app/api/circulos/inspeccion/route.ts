import { NextResponse } from "next/server";

import {
  inspectInvitation,
  projectInvitationPreview,
  sameOrigin,
} from "@/lib/circulos/bff";

/**
 * Check an invitation WITHOUT spending it.
 *
 * Opening a link is not accepting one. A preview crawler, a link scanner in a
 * messaging app, a prefetch or a second tap must all leave the invitation
 * exactly as they found it, so the page that loads at `/i` reaches this route
 * and only this route. Consuming the invitation is a separate, explicit act
 * behind a button, on `POST /api/circulos/sesion`.
 *
 * The success shape is `{ usable, preview }`, and the preview is exactly four
 * fields: title, summary, estimated minutes, the inviter's first name. It is
 * rebuilt field by field from the upstream body rather than spread, so an id, a
 * roster, an email or a counter added upstream tomorrow has nowhere to land.
 * `preview` is null when the API could not describe the invitation — losing the
 * description is a worse screen, never a dead link.
 *
 * Every REFUSAL is still a constant: never the activity, the circle, the
 * participant, who invited whom, when it expires, or which rule was broken.
 * Upstream answers `CIRCLE_INVITATION_UNUSABLE` for nonexistent, malformed,
 * expired, already-used, declined and revoked alike, and a web layer that
 * distinguished them would be undoing that on the one surface a stranger can
 * reach without any credential at all.
 *
 * The secret travels in the POST body: never a query string, never a path.
 * Those are written to access logs, kept in `Referer` and stored in history.
 */
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

/** One refusal for every reason, with the upstream status preserved. */
function refuse(status: number): NextResponse {
  return noStore(
    NextResponse.json(
      { ok: false, code: "CIRCLE_INVITATION_UNUSABLE" },
      { status },
    ),
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin()) {
    return noStore(
      NextResponse.json(
        { ok: false, code: "CIRCLE_FORBIDDEN" },
        { status: 403 },
      ),
    );
  }

  const body = (await request.json().catch(() => null)) as {
    secret?: unknown;
  } | null;

  const secret = body?.secret;
  if (typeof secret !== "string" || secret.length === 0) {
    // A missing secret is answered exactly like an unusable one. "You did not
    // send a secret" and "that secret is not valid" are the same sentence to
    // anybody who is not holding a real invitation.
    return refuse(404);
  }

  const seen = await inspectInvitation(secret);
  if (!seen.ok) return refuse(seen.status);

  // The preview the API computed, carried through — projected, never spread.
  // This handler used to collapse the whole answer back to `{ usable: true }`,
  // which threw away the one thing that makes the next screen a real decision.
  return noStore(
    NextResponse.json(
      {
        usable: true,
        preview: projectInvitationPreview(seen.data?.preview),
      },
      { status: 200 },
    ),
  );
}
