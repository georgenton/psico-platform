import { NextResponse } from "next/server";

import {
  guestCommand,
  isCirculoCommand,
  memberCommand,
  parseIdempotencyKey,
  parseShareConfirmation,
  sameOrigin,
} from "@/lib/circulos/bff";
import { resolveActor } from "@/lib/circulos/actor";

/**
 * The five commands, and nothing else.
 *
 * `kind` is matched against a literal list before anything is forwarded, so a
 * request naming an operation that is not on it does not reach the API at all.
 * That is the difference between this and a proxy, and it is the property the
 * negative control exercises: widen the list to "anything the caller names" and
 * a test fails.
 *
 * What the browser may put in the body is equally closed. `share` carries a
 * confirmation rebuilt field by field; `artifact` carries one bounded string;
 * `follow-up` carries one of three words. `withdraw` and `artifact-confirm`
 * carry only ids the server already knows. Nowhere is a `userId`,
 * `participantId`, `circleId` or role read from the request — those come from
 * the cookie, and the API resolves the actor from the credential alone.
 */
export const dynamic = "force-dynamic";

const FOLLOW_UP = ["KEEP", "ADJUST", "CLOSE"] as const;
const MAX_ARTIFACT_BODY = 4000;

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

function refuse(status: number, code: string): NextResponse {
  return noStore(NextResponse.json({ ok: false, code }, { status }));
}

export async function POST(
  request: Request,
  { params }: { params: { activityId: string } },
): Promise<NextResponse> {
  if (!sameOrigin()) return refuse(403, "CIRCLE_FORBIDDEN");

  const raw = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!raw || typeof raw !== "object") {
    return refuse(400, "CIRCLE_INVALID_PAYLOAD");
  }

  const kind = raw.kind;
  if (!isCirculoCommand(kind)) return refuse(400, "CIRCLE_INVALID_PAYLOAD");

  // The WRAPPER is closed too, not just the payload inside it. An unexpected
  // key here is refused rather than ignored: silently dropping `userId` or
  // `role` would mean a caller could send them for a long time without anything
  // saying no, and the day one of them started being read would be the day it
  // mattered.
  if (!exactKeys(raw, ["kind", "idempotencyKey", "payload"])) {
    return refuse(400, "CIRCLE_INVALID_PAYLOAD");
  }

  const payload = buildPayload(kind, raw.payload);
  if (payload === INVALID) return refuse(400, "CIRCLE_INVALID_PAYLOAD");

  // The key the CLIENT minted for this intention, validated but not replaced.
  //
  // Minting one here looked safer and was the opposite: it made every retry a
  // new intention. A share confirmed just before a timeout, retried by the
  // person, would arrive under a fresh key — and the API, which treats the same
  // key as a replay and a different key on a settled seat as a conflict, would
  // answer `CIRCLE_IDEMPOTENCY_CONFLICT` to somebody who had simply pressed the
  // button twice on a bad connection. The browser holds one key per intention
  // for as long as the outcome is uncertain, and a new one only when the
  // command or its payload actually changes.
  const idempotencyKey = parseIdempotencyKey(raw.idempotencyKey);
  if (!idempotencyKey) return refuse(400, "CIRCLE_INVALID_PAYLOAD");

  const activityId = params.activityId;

  // Resolved from credentials BEFORE the command is sent, using reads only.
  // The command is then issued exactly once, as that actor: there is no path
  // on which a withdrawal or a share is attempted as one actor and repeated as
  // another.
  const actor = await resolveActor(activityId);
  if (actor.kind === "NONE") return refuse(actor.status, actor.code);

  const result =
    actor.kind === "GUEST"
      ? await guestCommand(actor.token, {
          kind,
          activityId,
          body: payload,
          idempotencyKey,
        })
      : await memberCommand(actor.token, {
          kind,
          activityId,
          body: payload,
          idempotencyKey,
        });

  return noStore(
    NextResponse.json(
      result.ok ? { ok: true } : { ok: false, code: result.code },
      { status: result.status },
    ),
  );
}

/** Sentinel so `undefined` (a legitimately empty body) stays distinguishable. */
const INVALID = Symbol("invalid");

function buildPayload(
  kind: ReturnType<typeof String> extends never ? never : string,
  raw: unknown,
): unknown | typeof INVALID {
  switch (kind) {
    case "share": {
      const confirmation = parseShareConfirmation(raw);
      return confirmation ?? INVALID;
    }

    case "withdraw":
      // No reason is accepted. Leaving does not owe an explanation, so there is
      // no field one could be written into — and a body that tries is refused
      // rather than emptied, so nobody builds a UI around one.
      if (raw === undefined || raw === null) return {};
      if (typeof raw !== "object" || Array.isArray(raw)) return INVALID;
      return exactKeys(raw as Record<string, unknown>, []) ? {} : INVALID;

    case "artifact": {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return INVALID;
      }
      if (!exactKeys(raw as Record<string, unknown>, ["body"])) return INVALID;
      const body = (raw as { body?: unknown }).body;
      if (typeof body !== "string") return INVALID;
      if (body.trim().length === 0) return INVALID;
      if (body.length > MAX_ARTIFACT_BODY) return INVALID;
      return { body };
    }

    case "artifact-confirm": {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return INVALID;
      }
      if (
        !exactKeys(raw as Record<string, unknown>, ["artifactId", "version"])
      ) {
        return INVALID;
      }
      const { artifactId, version } = raw as {
        artifactId?: unknown;
        version?: unknown;
      };
      if (typeof artifactId !== "string" || artifactId.length === 0) {
        return INVALID;
      }
      if (typeof version !== "number" || !Number.isInteger(version)) {
        return INVALID;
      }
      // The artifact and version are the two things the API binds the
      // confirmation key to. They identify WHAT is being agreed, never WHO is
      // agreeing — that stays with the cookie.
      return { artifactId, version };
    }

    case "follow-up": {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return INVALID;
      }
      if (!exactKeys(raw as Record<string, unknown>, ["decision"])) {
        return INVALID;
      }
      const decision = (raw as { decision?: unknown }).decision;
      if (typeof decision !== "string") return INVALID;
      if (!(FOLLOW_UP as readonly string[]).includes(decision)) return INVALID;
      return { decision };
    }

    default:
      return INVALID;
  }
}

/** The object has these keys and no others. Order-independent. */
function exactKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(obj);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}
