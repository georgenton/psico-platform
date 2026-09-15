/**
 * The last thing that touches an error before it leaves the process.
 *
 * ── Why this is shared, and not four copies ────────────────────────────────
 *
 * The API had a redactor; the Web's three Sentry runtimes had none at all.
 * That asymmetry is the bug: the Web is where the invitation link is opened,
 * so it is the runtime whose URLs carry a one-shot token in the fragment and
 * an activity id in the path. A list of secret header names that lives in one
 * file and is remembered in three others is a list that drifts, and the drift
 * is silent — nothing fails, a header simply stops being redacted.
 *
 * So there is one list and one function, imported by the API, the Next server
 * runtime, the Edge runtime and the browser. It depends on nothing.
 *
 * ── What it removes, and why each one ──────────────────────────────────────
 *
 *   · `authorization`, `cookie`, `set-cookie` — sessions, in both directions.
 *     Sentry scrubs `authorization` by default and does NOT scrub the
 *     response's `set-cookie`, which is the one that carries a freshly minted
 *     guest session.
 *   · `x-circle-guest-session` — the guest's whole credential. A guest has no
 *     account, so this header IS the identity: leaked, it is a working key to
 *     somebody else's room until it expires.
 *   · `x-client-attestation` — the secret shared between the BFF and the API.
 *     One of these in a breadcrumb is enough to forge the boundary that keeps
 *     the invitation routes reachable only through our own server.
 *   · `x-api-key`, `stripe-signature` — pre-existing, kept.
 *
 * Matching is case-insensitive because header casing is not stable across
 * runtimes: Node lowercases, `fetch` preserves, Edge does its own thing, and a
 * set keyed on exact strings quietly misses `X-Circle-Guest-Session`.
 *
 * ── And the URLs ───────────────────────────────────────────────────────────
 *
 * A URL is not a header, and dropping headers while keeping the URL redacts
 * the lock and prints the key. `/i#<token>` is the invitation; `/compartir/<id>`
 * names a room. So every URL that passes through here is reduced to a path
 * with its identifying segments replaced — no origin, no query, no fragment —
 * which is the only part anybody triaging an error actually reads.
 */

/** Header names whose VALUE never leaves the process. Lowercase. */
export const SENSITIVE_HEADERS: readonly string[] = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-circle-guest-session",
  "x-client-attestation",
  "x-api-key",
  "stripe-signature",
];

const SENSITIVE = new Set(SENSITIVE_HEADERS);

export const REDACTED = "[REDACTED]";

/** A structural subset of a Sentry event. Kept local so this imports nothing. */
export interface RedactableEvent {
  request?: {
    headers?: Record<string, unknown>;
    url?: unknown;
    query_string?: unknown;
    data?: unknown;
    cookies?: unknown;
  };
  breadcrumbs?: RedactableBreadcrumb[];
  [key: string]: unknown;
}

export interface RedactableBreadcrumb {
  data?: Record<string, unknown>;
  message?: unknown;
  [key: string]: unknown;
}

/**
 * Segments that look like an identity rather than a route.
 *
 * Deliberately generous: a cuid, a uuid, a hex digest, a base64url token, a
 * long opaque string. A false positive costs a `:id` in a path nobody was
 * going to read closely; a false negative is an activity id in an error
 * report.
 */
function looksIdentifying(segment: string): boolean {
  if (segment.length >= 16) return true;
  if (/^\d+$/.test(segment) && segment.length >= 6) return true;
  return false;
}

/**
 * A URL reduced to the shape of its route.
 *
 * Origin, query and fragment go entirely. What comes back is a path whose
 * identifying segments read `:id` — enough to say "this happened on the room
 * page", never enough to say which room.
 */
export function scrubUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  // Strip the fragment FIRST and by hand: `new URL` keeps it in `.hash`, and
  // a parse failure on a relative URL must not leave the token in the string
  // we fall back to.
  const noFragment = raw.split("#")[0] ?? "";
  const noQuery = noFragment.split("?")[0] ?? "";
  let path = noQuery;
  try {
    path = new URL(noQuery).pathname;
  } catch {
    // A relative path, which is already what we want.
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return path
    .split("/")
    .map((segment) => (looksIdentifying(segment) ? ":id" : segment))
    .join("/");
}

/** Redact sensitive header values in place, whatever their casing. */
export function redactHeaders(headers: Record<string, unknown>): void {
  for (const key of Object.keys(headers)) {
    if (SENSITIVE.has(key.toLowerCase())) headers[key] = REDACTED;
  }
}

/**
 * One breadcrumb, cleaned.
 *
 * Breadcrumbs are the quiet leak: `fetch` and `xhr` crumbs carry the request
 * URL, navigation crumbs carry `from` and `to`, and none of them go through
 * the `request` sanitising above. In the browser those URLs are the ones with
 * the invitation fragment in them.
 */
export function sanitizeBreadcrumb<B extends RedactableBreadcrumb>(
  crumb: B,
): B {
  const data = crumb.data;
  if (data) {
    for (const key of ["url", "to", "from"]) {
      if (typeof data[key] === "string") {
        data[key] = scrubUrl(data[key]) ?? REDACTED;
      }
    }
    if (data.headers && typeof data.headers === "object") {
      redactHeaders(data.headers as Record<string, unknown>);
    }
    // Request and response bodies have no triage value and every kind of
    // content in them.
    delete data.body;
    delete data.input;
  }
  return crumb;
}

/**
 * The whole event.
 *
 * Pure in the sense that matters — it returns the event it was handed — and
 * deliberately mutating: a Sentry `beforeSend` runs on the hot path of an
 * error, and deep-cloning an event to avoid touching it would be ceremony.
 */
export function sanitizeSentryEvent<E extends RedactableEvent>(event: E): E {
  const request = event.request;
  if (request) {
    if (request.headers) redactHeaders(request.headers);
    // Client-controlled, unsanitized, and redundant with the route template
    // the exception filter already attaches.
    delete request.url;
    delete request.query_string;
    delete request.data;
    delete request.cookies;
  }

  if (Array.isArray(event.breadcrumbs)) {
    for (const crumb of event.breadcrumbs) sanitizeBreadcrumb(crumb);
  }

  // `transaction` is usually a route pattern, but "usually" is not a
  // guarantee: several integrations fall back to the raw path. The index
  // access goes through the `[key: string]: unknown` member deliberately —
  // narrowing `E` to declare it would tie this module to the SDK's type.
  const loose = event as Record<string, unknown>;
  if (typeof loose.transaction === "string") {
    loose.transaction = scrubUrl(loose.transaction) ?? loose.transaction;
  }

  return event;
}
