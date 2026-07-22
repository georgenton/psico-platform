/**
 * CC-7.4D — the ONE sanitized path used by every error surface.
 *
 * `request.url` carries whatever the client sent: real ids, real catalog keys
 * and the query string. That value must never reach a log line, a Sentry
 * context or the error envelope — a 404 for someone else's session would
 * otherwise print that session's id, and an aggregated log would fan out into
 * one bucket per id instead of one per route.
 *
 * For a RESOLVED route Express knows the template it matched, so the sanitized
 * value is exactly that template:
 *
 *   /api/guide/sessions/:sessionId/cancel
 *   /api/guide/sessions/:sessionId/steps/:stepKey/complete
 *
 * For an UNRESOLVED route (a genuine 404 from the router) there is no template.
 * The query string is dropped and every segment that looks like an identifier
 * is redacted, so the value stays useful for ops without echoing input back.
 *
 * Pure: no IO, no logging, never mutates the request.
 */

/** The minimal Express surface this needs — keeps the helper testable. */
export interface SanitizablePathRequest {
  url?: string;
  originalUrl?: string;
  path?: string;
  baseUrl?: string;
  route?: { path?: unknown } | null;
}

/** Placeholder for a segment that could carry a real value. */
const REDACTED = ":redacted";

/**
 * A segment that must never be echoed: UUIDs, cuids, and anything long or
 * mixed-case enough to be an id rather than a fixed route word. Fixed route
 * words in this API are short, lowercase and hyphenated.
 */
function looksLikeIdentifier(segment: string): boolean {
  if (segment.length === 0) return false;
  if (segment.length > 24) return true;
  if (/\d/.test(segment) && /[a-z]/i.test(segment)) return true;
  if (/[^a-z0-9-]/.test(segment)) return true;
  return false;
}

/** Drop the query string — it is client input in its entirety. */
function withoutQuery(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

export function safeRequestPath(request: SanitizablePathRequest): string {
  const template = request.route?.path;
  if (typeof template === "string" && template.length > 0) {
    // Express reports the template relative to the mounting point; `baseUrl`
    // is the prefix it was mounted under (empty in this app, but honoured so
    // the value stays correct if that ever changes).
    const base = typeof request.baseUrl === "string" ? request.baseUrl : "";
    const joined = `${base}${template}`;
    return joined.startsWith("/") ? joined : `/${joined}`;
  }

  const raw =
    (typeof request.path === "string" && request.path) ||
    (typeof request.originalUrl === "string" && request.originalUrl) ||
    (typeof request.url === "string" && request.url) ||
    "";
  if (raw === "") return "/";

  return withoutQuery(raw)
    .split("/")
    .map((segment) => (looksLikeIdentifier(segment) ? REDACTED : segment))
    .join("/");
}
