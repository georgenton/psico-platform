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
 * For an UNRESOLVED route (a genuine 404 from the router) there is no template
 * and no way to tell a fixed route word from a value: `/api/x/alice` is
 * indistinguishable from `/api/x/12345` without the route table that just
 * failed to match. Guessing per segment is a heuristic, and a heuristic on a
 * privacy boundary fails open. So the result is a CONSTANT that contains no
 * input at all — only whether the request was aimed at the API prefix.
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

/** The two possible fail-closed values. Neither derives from client input. */
export const UNMATCHED_API_PATH = "/api/:unmatched";
export const UNMATCHED_PATH = "/:unmatched";

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

  // The ONLY thing read out of the raw value is whether it targets the API
  // prefix — a single bit, useful for splitting app errors from anything else,
  // and incapable of carrying a session id, a key or a token.
  return raw === "/api" || raw.startsWith("/api/") || raw.startsWith("/api?")
    ? UNMATCHED_API_PATH
    : UNMATCHED_PATH;
}
