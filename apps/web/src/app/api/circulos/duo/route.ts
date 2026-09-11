import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { createDuo, sameOrigin } from "@/lib/circulos/bff";
import { getAccessToken } from "@/lib/api.server";

/**
 * Create a Dúo and its first activity.
 *
 * Authenticated only, and deliberately so: there is no guest equivalent. A
 * guest has no circle to create one in, and the API has no `POST /guest/duo`
 * for the same reason.
 *
 * The body carries a template pin and nothing else. `circleId` is not accepted:
 * the API decides which circle this becomes, from the caller's own membership.
 */
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
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

  const accessToken = getAccessToken();
  if (!accessToken) {
    return noStore(
      NextResponse.json(
        { ok: false, code: "CIRCLE_FORBIDDEN" },
        { status: 401 },
      ),
    );
  }

  const raw = (await request.json().catch(() => null)) as {
    templateKey?: unknown;
    templateVersion?: unknown;
  } | null;

  if (
    !raw ||
    typeof raw.templateKey !== "string" ||
    raw.templateKey.length === 0 ||
    typeof raw.templateVersion !== "number" ||
    !Number.isInteger(raw.templateVersion)
  ) {
    return noStore(
      NextResponse.json(
        { ok: false, code: "CIRCLE_INVALID_PAYLOAD" },
        { status: 400 },
      ),
    );
  }

  const result = await createDuo(
    accessToken,
    { templateKey: raw.templateKey, templateVersion: raw.templateVersion },
    randomUUID(),
  );

  return noStore(
    NextResponse.json(
      result.ok ? result.data : { ok: false, code: result.code },
      { status: result.status },
    ),
  );
}
