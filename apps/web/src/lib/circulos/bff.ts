import "server-only";

import { headers } from "next/headers";
import type {
  CircleActivityView,
  CircleInvitationPreview,
  CircleShareConfirmation,
} from "@psico/types";
import { CIRCLE_SHARE_LIMITS } from "@psico/types";

/**
 * The Círculos back-end-for-front-end.
 *
 * This is NOT a proxy. A proxy forwards whatever path the browser names, which
 * would hand a stranger the whole API surface through our own origin and our
 * own cookie. What lives here is a closed list: five commands and two reads,
 * each with its own upstream path written down in this file, so a request for
 * anything else has nowhere to go.
 *
 * Two rules hold everywhere below:
 *
 *  1. **The browser never says who it is.** No `userId`, `participantId`,
 *     `circleId` or role is read from the request — not from the body, not from
 *     a header, not from a query string. Identity comes from the guest cookie
 *     or the session cookie, both `HttpOnly`, and the API resolves the actor
 *     from the credential alone.
 *  2. **Errors stay opaque.** Upstream status and the `CIRCLE_*` code pass
 *     through; nothing else does. "Which rule did I break" is information about
 *     somebody else's Dúo as often as it is about your own request.
 */

const API_ROOT = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const API_BASE = `${API_ROOT.replace(/\/$/, "")}/api`;

export interface BffResult<T> {
  readonly ok: boolean;
  readonly status: number;
  readonly code: string | null;
  readonly data: T | null;
}

/**
 * Every command the web guest flow may issue, and nothing else.
 *
 * Adding a row here is the only way to widen what the browser can reach, which
 * is the point: the allow-list is a literal, it is short, and it is reviewed in
 * a diff. `kind` is matched against these exact strings — an unknown one is not
 * forwarded anywhere, it is refused.
 */
export const CIRCULO_COMMANDS = [
  "share",
  "withdraw",
  "artifact",
  "artifact-confirm",
  "follow-up",
] as const;

export type CirculoCommandKind = (typeof CIRCULO_COMMANDS)[number];

interface CommandRoute {
  readonly method: "POST" | "PUT";
  /** Appended to the actor's activity base. Never taken from the request. */
  readonly path: string;
}

const COMMAND_ROUTES: Record<CirculoCommandKind, CommandRoute> = {
  share: { method: "POST", path: "/share-confirmations" },
  withdraw: { method: "POST", path: "/withdraw" },
  artifact: { method: "PUT", path: "/artifact" },
  "artifact-confirm": { method: "POST", path: "/artifact/confirm" },
  "follow-up": { method: "POST", path: "/follow-up" },
};

export function isCirculoCommand(value: unknown): value is CirculoCommandKind {
  return (
    typeof value === "string" &&
    (CIRCULO_COMMANDS as readonly string[]).includes(value)
  );
}

// ── Origin / CSRF ────────────────────────────────────────────────────────────

/**
 * A state-changing request must come from our own page.
 *
 * `SameSite=Lax` already withholds the guest cookie from cross-site POSTs, so
 * this is the second of two locks rather than the only one. It is here because
 * `Lax` is a browser promise and this is a server check: a browser that gets
 * `SameSite` wrong, or a future handler reached by a method `Lax` does not
 * cover, still meets a rule that runs on our side.
 *
 * A request with no `Origin` at all is refused rather than trusted. Same-origin
 * `fetch` always sends one, so the only callers this turns away are the ones
 * that are not the page.
 */
export function sameOrigin(): boolean {
  const h = headers();
  const origin = h.get("origin");
  if (!origin) return false;
  const host = h.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// ── The upstream call ────────────────────────────────────────────────────────

async function call<T>(
  path: string,
  init: {
    method: "GET" | "POST" | "PUT";
    token?: string | null;
    body?: unknown;
    idempotencyKey?: string;
  },
): Promise<BffResult<T>> {
  const headersOut = new Headers();
  if (init.body !== undefined) {
    headersOut.set("Content-Type", "application/json");
  }
  if (init.token) headersOut.set("Authorization", `Bearer ${init.token}`);
  if (init.idempotencyKey) {
    headersOut.set("Idempotency-Key", init.idempotencyKey);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method,
      headers: headersOut,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    // The network, not the person. No URL, no token, no body in the log.
    return { ok: false, status: 502, code: "CIRCLE_UNAVAILABLE", data: null };
  }

  if (res.status === 204) {
    return { ok: true, status: 204, code: null, data: null };
  }

  const payload = (await res.json().catch(() => null)) as {
    code?: unknown;
  } | null;

  if (!res.ok) {
    const code =
      payload && typeof payload.code === "string" ? payload.code : null;
    return { ok: false, status: res.status, code, data: null };
  }
  return { ok: true, status: res.status, code: null, data: payload as T };
}

// ── Session ──────────────────────────────────────────────────────────────────

export interface GuestScope {
  readonly kind: "GUEST";
  readonly activityId: string;
  readonly participantId: string;
}

/**
 * What `inspect` answers.
 *
 * `preview` is nullable because being DESCRIBABLE is not a condition of being
 * USABLE: an invitation pinned to a template this deployment does not carry is
 * still perfectly acceptable, and the API says so by returning `usable` with a
 * null preview rather than a refusal.
 */
export interface InspectedInvitation {
  readonly usable: true;
  readonly preview: CircleInvitationPreview | null;
}

/**
 * Check a link without spending it.
 *
 * Typed as `{ usable: true }` until now, which silently discarded the preview
 * the API had already computed — so the screen before "Aceptar" stayed generic
 * no matter what the server sent. The type WAS the bug; nothing else in the
 * chain was wrong.
 */
export function inspectInvitation(secret: string) {
  return call<InspectedInvitation>("/circles/invitations/inspect", {
    method: "POST",
    body: { secret },
  });
}

/**
 * Rebuild the preview from an untrusted upstream body, field by field.
 *
 * Explicitly NOT a spread. Spreading would mean anything the API ever added —
 * an id, a roster, a counter, an email — arrives at the browser the day it is
 * added, with no diff here to notice. Four fields are named, four are copied,
 * and everything else has nowhere to go.
 *
 * A malformed or absent preview becomes `null`. The invitation stays usable:
 * losing the description is a worse screen, never a dead link.
 */
export function projectInvitationPreview(
  raw: unknown,
): CircleInvitationPreview | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.title !== "string" ||
    typeof p.summary !== "string" ||
    typeof p.estimatedMinutes !== "number" ||
    !Number.isFinite(p.estimatedMinutes) ||
    typeof p.inviterFirstName !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    title: p.title,
    summary: p.summary,
    estimatedMinutes: p.estimatedMinutes,
    inviterFirstName: p.inviterFirstName,
  });
}

/** Trade the link for a session. The raw token is returned ONCE, to us. */
export function acceptInvitation(secret: string) {
  return call<{ guestSessionToken: string; expiresAt: string }>(
    "/circles/invitations/accept",
    { method: "POST", body: { secret } },
  );
}

/**
 * What this guest session is, as the SERVER resolved it.
 *
 * Load-bearing for more than display: every command handler calls this and
 * compares the resolved `activityId` against the one in the URL, so a guest who
 * edits the path reaches a refusal here rather than a forwarded request.
 */
export function guestScope(token: string) {
  return call<GuestScope>("/circles/guest/session", {
    method: "GET",
    token,
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function readActivityAsGuest(token: string, activityId: string) {
  return call<CircleActivityView>(
    `/circles/guest/activities/${encodeURIComponent(activityId)}`,
    { method: "GET", token },
  );
}

export function readActivityAsMember(token: string, activityId: string) {
  return call<CircleActivityView>(
    `/circles/activities/${encodeURIComponent(activityId)}`,
    { method: "GET", token },
  );
}

// ── Commands ─────────────────────────────────────────────────────────────────

export interface CommandInput {
  readonly kind: CirculoCommandKind;
  readonly activityId: string;
  readonly body?: unknown;
  readonly idempotencyKey: string;
}

/**
 * Issue one command as the guest whose session `resolveActor` already settled.
 *
 * The scope check is NOT repeated here. It used to be, and once the resolver
 * existed that meant two identical lookups per command — the same question
 * asked twice, one of them wasted against a rate-limited endpoint. Whoever
 * calls this has already established that this token owns this activity, and
 * the API enforces the binding again on its own side regardless.
 */
export async function guestCommand(
  token: string,
  input: CommandInput,
): Promise<BffResult<unknown>> {
  const route = COMMAND_ROUTES[input.kind];
  return call(
    `/circles/guest/activities/${encodeURIComponent(input.activityId)}${route.path}`,
    {
      method: route.method,
      token,
      body: input.body ?? {},
      idempotencyKey: input.idempotencyKey,
    },
  );
}

/** The same closed list, for somebody with an account. */
export async function memberCommand(
  accessToken: string,
  input: CommandInput,
): Promise<BffResult<unknown>> {
  const route = COMMAND_ROUTES[input.kind];
  return call(
    `/circles/activities/${encodeURIComponent(input.activityId)}${route.path}`,
    {
      method: route.method,
      token: accessToken,
      body: input.body ?? {},
      idempotencyKey: input.idempotencyKey,
    },
  );
}

export function createDuo(
  accessToken: string,
  body: CreateDuoBody,
  idempotencyKey: string,
) {
  return call<{ circleId: string; activityId: string }>("/circles/duo", {
    method: "POST",
    token: accessToken,
    body,
    idempotencyKey,
  });
}

// ── The two shapes the browser mints ─────────────────────────────────────────

/**
 * 256 bits of entropy, base64url, exactly as `CreateDuoDto` requires.
 *
 * Length alone proves nothing — 43 spaces are 43 characters. The alphabet is
 * the assertion; the length falls out of it.
 */
const BASE64URL_256 = /^[A-Za-z0-9_-]{43}$/;

/** RFC 4122 version 4, variant 1. */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateDuoBody {
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly invitationToken: string;
}

/**
 * Rebuild a Dúo creation request from untrusted input, or refuse.
 *
 * The invitation token is minted by the CALLER, not the server, because a
 * one-shot secret cannot be handed back twice: a replay has to return the same
 * resource, and the server keeps only a hash. The browser supplying it is what
 * makes replay and conflict distinguishable without anything recoverable ever
 * being stored.
 *
 * It is NOT identity and it authorises nothing on its own. The authority to
 * create a Dúo comes from the authenticated cookie and from nowhere else; this
 * token only names the invitation that creation will mint. So it is validated
 * for shape, forwarded once, and never persisted, logged, put in a URL, a
 * metric or an error.
 */
export function parseCreateDuo(raw: unknown): CreateDuoBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const body = raw as Record<string, unknown>;

  // Exact keys: an extra field is refused rather than trimmed, so a caller
  // cannot smuggle a `userId` or a `circleId` past us and hope the API ignores
  // it.
  if (!exact(body, ["templateKey", "templateVersion", "invitationToken"])) {
    return null;
  }
  if (typeof body.templateKey !== "string") return null;
  if (body.templateKey.length === 0 || body.templateKey.length > 128) {
    return null;
  }
  if (typeof body.templateVersion !== "number") return null;
  if (!Number.isInteger(body.templateVersion) || body.templateVersion < 1) {
    return null;
  }
  if (typeof body.invitationToken !== "string") return null;
  if (!BASE64URL_256.test(body.invitationToken)) return null;

  return {
    templateKey: body.templateKey,
    templateVersion: body.templateVersion,
    invitationToken: body.invitationToken,
  };
}

/**
 * The idempotency key the CLIENT minted for this intention.
 *
 * It is not regenerated here. A key minted per request would make every retry
 * a new intention, which is exactly the thing idempotency exists to prevent:
 * a share confirmed once and retried after a timeout would be a second
 * confirmation under a fresh key, and the API would answer
 * `CIRCLE_IDEMPOTENCY_CONFLICT` — or worse, succeed twice — instead of
 * replaying the first. The browser holds one key per logical intention, in
 * memory, and reuses it for as long as the outcome is uncertain.
 *
 * Validated, never trusted for identity: the API is still the authority on
 * what a repeat means.
 */
export function parseIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return UUID_V4.test(raw) ? raw : null;
}

// ── The one body the browser may compose ─────────────────────────────────────

/**
 * Rebuild a share confirmation from untrusted input, or refuse.
 *
 * The API validates this again — it is the authority, and this function is not
 * trying to be a second one. What it does is refuse to FORWARD a shape we can
 * already see is not a confirmation, so a malformed or padded body is dropped
 * at our origin instead of being relayed under our cookie.
 *
 * Exactly three modes, and a body carrying anything the mode does not define is
 * rejected rather than trimmed: `KEEP_PRIVATE` with a `reason` attached is not
 * a stricter refusal to share, it is the explanation the contract deliberately
 * has no room for.
 */
export function parseShareConfirmation(
  raw: unknown,
): CircleShareConfirmation | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const body = raw as Record<string, unknown>;

  if (body.mode === "KEEP_PRIVATE") {
    return exact(body, ["mode"]) ? { mode: "KEEP_PRIVATE" } : null;
  }

  if (body.mode === "EDITED_SUMMARY") {
    if (!exact(body, ["mode", "summary"])) return null;
    if (typeof body.summary !== "string") return null;
    if (body.summary.trim().length === 0) return null;
    if (body.summary.length > CIRCLE_SHARE_LIMITS.maxSummaryLength) return null;
    return { mode: "EDITED_SUMMARY", summary: body.summary };
  }

  if (body.mode === "SELECTED_FIELDS") {
    if (!exact(body, ["mode", "fields"])) return null;
    if (!Array.isArray(body.fields)) return null;
    if (body.fields.length === 0) return null;
    if (body.fields.length > CIRCLE_SHARE_LIMITS.maxFields) return null;
    const seen = new Set<string>();
    const fields: { fieldKey: string; value: string }[] = [];
    for (const item of body.fields) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        return null;
      }
      const f = item as Record<string, unknown>;
      if (!exact(f, ["fieldKey", "value"])) return null;
      if (typeof f.fieldKey !== "string" || typeof f.value !== "string") {
        return null;
      }
      if (f.value.trim().length === 0) return null;
      if (f.value.length > CIRCLE_SHARE_LIMITS.maxFieldLength) return null;
      if (seen.has(f.fieldKey)) return null;
      seen.add(f.fieldKey);
      fields.push({ fieldKey: f.fieldKey, value: f.value });
    }
    return { mode: "SELECTED_FIELDS", fields };
  }

  return null;
}

function exact(obj: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(obj);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}
