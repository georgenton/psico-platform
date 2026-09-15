import { NextResponse } from "next/server";
import {
  CIRCLE_FEEDBACK_MAX_TOPICS,
  CIRCLE_FEEDBACK_TOPIC_KEYS,
  CIRCLE_FEEDBACK_USEFULNESS,
} from "@psico/types";

import { guestFeedback, memberFeedback, sameOrigin } from "@/lib/circulos/bff";
import { resolveActor } from "@/lib/circulos/actor";

/**
 * The optional question, forwarded and nothing else.
 *
 * ── Why it is its own route ────────────────────────────────────────────────
 *
 * `/comando` carries the five things that change an activity, each with an
 * idempotency key. This changes nothing about the activity. Putting it there
 * would have meant widening a closed list and relaxing the rule that every
 * command carries a key — to accommodate the one request that is not a
 * command.
 *
 * ── What is rebuilt, and what is refused ───────────────────────────────────
 *
 * The body is reconstructed field by field. Topics are filtered against the
 * closed list and capped; `usefulness` must be one of three words or absent;
 * the help counters are clamped. A payload carrying an answer, a name, a
 * `participantId` or a `templateKey` does not reach the API, because nothing
 * unnamed here is forwarded — and the API would ignore it anyway, since it
 * resolves the seat from the credential.
 *
 * ── Its failure is its own ─────────────────────────────────────────────────
 *
 * The activity is already over when this is called. Whatever happens here —
 * a rate limit, a collector that is down, a dropped connection — it cannot
 * change what happened in the room, because nothing in the room is waiting on
 * it. The screen says thank you either way.
 */
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

/** Bounded, deduplicated, and only the keys the product published. */
function cleanTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (!CIRCLE_FEEDBACK_TOPIC_KEYS.includes(item)) continue;
    seen.add(item);
    if (seen.size >= CIRCLE_FEEDBACK_MAX_TOPICS) break;
  }
  return [...seen];
}

function cleanHelpOpens(
  raw: unknown,
): { fieldKey: string; piece: "explanation" | "example"; opens: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: {
    fieldKey: string;
    piece: "explanation" | "example";
    opens: number;
  }[] = [];
  for (const item of raw.slice(0, 24)) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const fieldKey = row.fieldKey;
    const piece = row.piece;
    const opens = row.opens;
    if (typeof fieldKey !== "string" || fieldKey.length > 200) continue;
    if (piece !== "explanation" && piece !== "example") continue;
    if (typeof opens !== "number" || !Number.isFinite(opens)) continue;
    // Clamped rather than rejected: a counter that overflowed is still a "yes,
    // they opened it", and an unbounded integer is somewhere to hide a value.
    out.push({
      fieldKey,
      piece,
      opens: Math.min(100, Math.max(1, Math.round(opens))),
    });
  }
  return out;
}

export async function POST(
  request: Request,
  { params }: { params: { activityId: string } },
): Promise<NextResponse> {
  if (!(await sameOrigin())) {
    return noStore(
      NextResponse.json(
        { ok: false, code: "CIRCLE_FORBIDDEN" },
        { status: 403 },
      ),
    );
  }

  const raw = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!raw || typeof raw.noticeVersion !== "string") {
    return noStore(
      NextResponse.json(
        { ok: false, code: "CIRCLE_INVALID_PAYLOAD" },
        { status: 400 },
      ),
    );
  }

  const usefulness =
    typeof raw.usefulness === "string" &&
    (CIRCLE_FEEDBACK_USEFULNESS as readonly string[]).includes(raw.usefulness)
      ? (raw.usefulness as "YES" | "SOME" | "NO")
      : undefined;

  const body = {
    topics: cleanTopics(raw.topics),
    ...(usefulness ? { usefulness } : {}),
    noticeVersion: raw.noticeVersion.slice(0, 40),
    helpOpens: cleanHelpOpens(raw.helpOpens),
  };

  const actor = await resolveActor(params.activityId);
  const result =
    actor.kind === "USER"
      ? await memberFeedback(actor.token, params.activityId, body)
      : actor.kind === "GUEST"
        ? await guestFeedback(actor.token, params.activityId, body)
        : null;

  if (!result) {
    return noStore(
      NextResponse.json(
        { ok: false, code: "CIRCLE_FORBIDDEN" },
        { status: 403 },
      ),
    );
  }

  return noStore(
    NextResponse.json(
      { ok: result.ok },
      { status: result.ok ? 202 : result.status },
    ),
  );
}
