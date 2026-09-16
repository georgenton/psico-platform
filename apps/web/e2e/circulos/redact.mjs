/**
 * What must not leave a diagnostic, whatever printed it.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * A failing CI run published the tail of the API's log, and the API had just
 * logged an email — because `RESEND_API_KEY` is unset in the harness, so the
 * notifications service prints messages to stdout instead of sending them. The
 * email was a verification message, and it carried a working link with its
 * token in the query string. Everything about the run was synthetic and the
 * environment was torn down minutes later, but the mechanism was not synthetic:
 * the same code path prints the same shape of thing wherever it runs, and a log
 * tail is published to a place that keeps it.
 *
 * The lesson is not "stop printing logs". A bare timeout says only that
 * something did not happen; the service's own log says why, and removing it
 * would trade a leak for a permanent guessing game. So the tail stays and the
 * secrets in it do not.
 *
 * ── Why it is here and not in `@psico/types` ────────────────────────────────
 *
 * The shared Sentry redactor covers a different shape: a structured event, with
 * headers in a known field and URLs in known keys. This is free-form text,
 * printed by processes we do not control the output of. Extending the shared
 * module would not have helped the harness use it either — these are plain
 * `.mjs` scripts that deliberately depend on nothing, and reaching for the
 * package's build output would make the redactor fail to load exactly when the
 * package is broken, which is when logs matter most.
 *
 * What must NOT drift is the list of what counts as a credential, so
 * `diagnostic-redaction.test.ts` asserts every header the shared module
 * protects is protected here too. Two implementations, one list.
 *
 * ── What survives on purpose ───────────────────────────────────────────────
 *
 * Scenario, phase, service, commit, error code, HTTP status, the ROUTE (with
 * its identifying segments replaced) and timings. A diagnostic that redacts
 * itself into silence has the same cost as no diagnostic at all, and the next
 * person pays it by re-running the whole thing to look again.
 */

/** Header names whose VALUE never appears in a diagnostic. Lowercase. */
export const SENSITIVE_HEADER_NAMES = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-circle-guest-session",
  "x-client-attestation",
  "x-api-key",
  "stripe-signature",
];

/**
 * Names that make the thing after them a secret, whatever it looks like.
 *
 * Matched as a whole word so `tokenizer` and `passwordless` are left alone, and
 * matched in JSON, in a query string and in `KEY=value` alike — the harness
 * prints all three.
 */
const SECRET_KEYS = [
  "token",
  "secret",
  "password",
  "passwd",
  "pwd",
  "api[_-]?key",
  "access[_-]?token",
  "refresh[_-]?token",
  "guest[_-]?session",
  "session[_-]?token",
  "idempotency[_-]?key",
  "invitation[_-]?secret",
];

export const REDACTED = "[REDACTED]";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A path segment that names a THING rather than describing a route.
 *
 * Deliberately narrower than the Sentry redactor's version, which calls any
 * long segment identifying. That is right for an error report nobody reads
 * closely and wrong here: `duo-lo-que-me-ayuda` and
 * `eec-c1-cuerpo-antes-que-mente` are nineteen and twenty-nine characters, they
 * are the first thing you want to know about a failing request, and they are
 * not identities.
 *
 * So the test is opacity, not length: an unbroken run of letters and digits
 * (a cuid, a hex digest, a base64url token), a uuid, or a long number. Editorial
 * keys are hyphenated words and survive.
 */
export function looksIdentifying(segment) {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      segment,
    )
  ) {
    return true;
  }
  if (/^\d{6,}$/.test(segment)) return true;
  return segment.length >= 16 && /^[A-Za-z0-9_]+$/.test(segment);
}

/**
 * A URL reduced to origin and route shape.
 *
 * Query and fragment go entirely — that is where the verification token, the
 * recovery token and the invitation secret live, and the fragment is stripped
 * BY HAND first because a parse failure must not leave it in the fallback.
 * Userinfo goes too: `postgres://user:pass@host/db` is a credential wearing a
 * URL's clothes.
 *
 * The origin stays. It is in the config, it is in the runbook, and knowing
 * which service answered is half of reading a log.
 */
export function scrubUrlText(raw) {
  const noFragment = String(raw).split("#")[0] ?? "";
  const noQuery = noFragment.split("?")[0] ?? "";
  try {
    const u = new URL(noQuery);
    const path = u.pathname
      .split("/")
      .map((s) => (looksIdentifying(s) ? ":id" : s))
      .join("/");
    // `u.host` carries the port and never the userinfo.
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return noQuery;
  }
}

/**
 * Every rule, applied to a block of text of any origin.
 *
 * Order matters once: URLs are scrubbed first, so a token in a query string is
 * already gone before the key-name rules run and cannot be half-redacted twice.
 */
export function redactDiagnostics(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  let out = text;

  // 1 · Any URL, wherever it appears — including inside an HTML email body,
  //     which is how this leaked. One rule covers verification links, recovery
  //     links, invitation fragments and connection strings.
  out = out.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]}]+/gi, (m) =>
    scrubUrlText(m),
  );

  // 2 · Header values, whatever the casing and whether printed as `name: value`
  //     or `name=value`.
  for (const name of SENSITIVE_HEADER_NAMES) {
    out = out.replace(
      new RegExp(
        `(${escapeRe(name)}\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;"']+)`,
        "gi",
      ),
      `$1${REDACTED}`,
    );
  }

  // 3 · Anything whose KEY says it is a secret, in JSON, in a query string or
  //     in `KEY=value`. The quote is put back so the line still reads as what
  //     it was.
  out = out.replace(
    new RegExp(
      `\\b(${SECRET_KEYS.join("|")})("?\\s*[:=]\\s*)("?)([^\\s"'&,;}\\]]+)`,
      "gi",
    ),
    (_m, key, sep, quote) => `${key}${sep}${quote}${REDACTED}${quote}`,
  );

  // 4 · A long opaque run on its own, with nothing to name it.
  //
  //     Forty-eight characters, not forty: a git SHA is exactly forty and the
  //     commit under test is the single most useful thing in a diagnostic. The
  //     tokens this harness produces are longer — a 64-character hex digest, a
  //     base64url secret — so the floor separates them cleanly.
  out = out.replace(/\b[A-Za-z0-9_-]{48,}\b/g, REDACTED);

  return out;
}
