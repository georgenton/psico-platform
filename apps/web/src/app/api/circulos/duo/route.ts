import { NextResponse } from "next/server";

import {
  createDuo,
  parseCreateDuo,
  parseIdempotencyKey,
  sameOrigin,
} from "@/lib/circulos/bff";
import { getAccessToken } from "@/lib/api.server";

/**
 * Create a Dúo and its first activity.
 *
 * Authenticated only, and deliberately so: there is no guest equivalent. A
 * guest has no circle to create one in, and the API has no `POST /guest/duo`
 * for the same reason.
 *
 * The body carries a template pin and the invitation token the browser minted.
 * `circleId` is not accepted — the API decides which circle this becomes, from
 * the caller's own membership — and neither is any other field: `parseCreateDuo`
 * requires exactly the three keys `CreateDuoDto` declares.
 *
 * The invitation token is a secret the organiser will later put in a `/i#token`
 * link. It passes through this handler once and is never persisted, logged,
 * echoed back, or put in a URL, a metric or an error.
 */
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

function refuse(status: number, code: string): NextResponse {
  return noStore(NextResponse.json({ ok: false, code }, { status }));
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin()) return refuse(403, "CIRCLE_FORBIDDEN");

  const accessToken = getAccessToken();
  if (!accessToken) return refuse(401, "CIRCLE_FORBIDDEN");

  const raw = (await request.json().catch(() => null)) as {
    payload?: unknown;
    idempotencyKey?: unknown;
  } | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return refuse(400, "CIRCLE_INVALID_PAYLOAD");
  }
  // Exactly two keys. The wrapper is as closed as the payload it carries.
  const wrapper = Object.keys(raw);
  if (
    wrapper.length !== 2 ||
    !wrapper.includes("payload") ||
    !wrapper.includes("idempotencyKey")
  ) {
    return refuse(400, "CIRCLE_INVALID_PAYLOAD");
  }

  const body = parseCreateDuo(raw.payload);
  if (!body) return refuse(400, "CIRCLE_INVALID_PAYLOAD");

  // The client's key, not a fresh one. Retrying the same creation must reach
  // the API under the same key so a replay replays instead of conflicting.
  const idempotencyKey = parseIdempotencyKey(raw.idempotencyKey);
  if (!idempotencyKey) return refuse(400, "CIRCLE_INVALID_PAYLOAD");

  const result = await createDuo(accessToken, body, idempotencyKey);

  return noStore(
    NextResponse.json(
      result.ok ? result.data : { ok: false, code: result.code },
      { status: result.status },
    ),
  );
}
