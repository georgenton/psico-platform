import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SENSITIVE_HEADERS } from "@psico/types";

// Plain ESM with no dependencies, like `ownership.mjs`: harness tooling rather
// than shipped source, which is why it lives under `e2e/` and is imported here
// by relative path.
import {
  REDACTED,
  SENSITIVE_HEADER_NAMES,
  looksIdentifying,
  redactDiagnostics,
  scrubUrlText,
} from "../../../e2e/circulos/redact.mjs";

/**
 * What a published diagnostic may say, and what it may not.
 *
 * A failing CI run printed the tail of the API's log, and the API had logged an
 * email: `RESEND_API_KEY` is unset in the harness, so the notifications service
 * prints messages instead of sending them, and a verification email carries a
 * working link with its token in the query string.
 *
 * The values below are synthetic and chosen to be unmistakable — if one of them
 * survives, the assertion says exactly which rule let it through. The other
 * half of every test is the part that is easy to forget: that what remains is
 * still worth reading.
 */

const TOKEN =
  "deadbeefcafef00dfeedfacebadc0ffee0ddf00dba5eba11beefcafed00dfeed";
const SHA = "a2358244e0eb6b57a72c8ad852fea51cbf61e992";

describe("a verification email cannot be published by printing a log tail", () => {
  it("drops the token from both places the email puts it", () => {
    const email = `
      <a href="http://127.0.0.1:55592/verify-email?token=${TOKEN}"
         style="display:inline-block; padding:14px 28px;">
        Confirmar correo
      </a>
      <span style="word-break:break-all;">http://127.0.0.1:55592/verify-email?token=${TOKEN}</span>
    `;

    const safe = redactDiagnostics(email);

    expect(safe).not.toContain(TOKEN);
    // The route survives, so "which email was this" is still answerable.
    expect(safe).toContain("http://127.0.0.1:55592/verify-email");
  });

  it("drops a recovery token the same way", () => {
    const line = `reset link: https://circulos-test-web.vercel.app/reset-password?token=${TOKEN}&from=email`;
    const safe = redactDiagnostics(line);

    expect(safe).not.toContain(TOKEN);
    expect(safe).toContain(
      "https://circulos-test-web.vercel.app/reset-password",
    );
  });

  it("drops an invitation secret, which lives in the fragment", () => {
    // The fragment never reaches a server, which is the point of putting it
    // there — and exactly why a redactor that only looked at query strings
    // would have published it.
    const line = `page.goto: Timeout 30000ms exceeded.\n  navigating to "https://circulos-test-web.vercel.app/i#${TOKEN}"`;
    const safe = redactDiagnostics(line);

    expect(safe).not.toContain(TOKEN);
    expect(safe).toContain("https://circulos-test-web.vercel.app/i");
    // And the failure is still legible.
    expect(safe).toContain("Timeout 30000ms exceeded");
  });
});

describe("credentials never appear, whatever carries them", () => {
  it("redacts every sensitive header value and keeps the header name", () => {
    const headers = SENSITIVE_HEADER_NAMES.map(
      (name: string) => `${name}: Bearer-${TOKEN}`,
    ).join("\n");

    const safe = redactDiagnostics(headers);

    expect(safe).not.toContain(TOKEN);
    for (const name of SENSITIVE_HEADER_NAMES) {
      expect(safe).toContain(`${name}: ${REDACTED}`);
    }
  });

  it("matches a header whatever its casing", () => {
    const safe = redactDiagnostics(`X-Circle-Guest-Session: ${TOKEN}`);
    expect(safe).not.toContain(TOKEN);
    expect(safe).toContain(REDACTED);
  });

  it("redacts a value by the name in front of it", () => {
    const body = `{"secret":"${TOKEN}","noticeVersion":"2026-09-15.1"}`;
    const safe = redactDiagnostics(body);

    expect(safe).not.toContain(TOKEN);
    // The field that is NOT a credential survives — this is the line that tells
    // you which version of the notice somebody agreed to.
    expect(safe).toContain('"noticeVersion":"2026-09-15.1"');
  });

  it("strips the credentials out of a connection string", () => {
    const line = `DATABASE_URL=postgresql://postgres:hunter2@postgres-test.railway.internal:5432/railway`;
    const safe = redactDiagnostics(line);

    expect(safe).not.toContain("hunter2");
    // Which database it was is the useful half, and it is not a secret.
    expect(safe).toContain("postgres-test.railway.internal:5432/railway");
  });

  it("catches a long opaque value with nothing to name it", () => {
    const safe = redactDiagnostics(`unexpected value ${TOKEN} in the response`);
    expect(safe).not.toContain(TOKEN);
    expect(safe).toContain("unexpected value");
  });
});

describe("the diagnostic is still a diagnostic", () => {
  it("keeps the commit, the status, the code and the route", () => {
    const line =
      `[walk] scenario=BROWSER_CLOSING_PATHS phase=follow-up service=api ` +
      `commit=${SHA} ` +
      `POST /api/circulos/actividad/cmu2zxq6v0069ot42o312tfmx/comando → 200 ` +
      `code=CIRCLE_FORBIDDEN in 1240ms`;

    const safe = redactDiagnostics(line);

    // A git SHA is forty characters and the single most useful thing here, so
    // the opaque-run floor sits above it deliberately.
    expect(safe).toContain(SHA);
    expect(safe).toContain("scenario=BROWSER_CLOSING_PATHS");
    expect(safe).toContain("service=api");
    expect(safe).toContain("→ 200");
    expect(safe).toContain("code=CIRCLE_FORBIDDEN");
    expect(safe).toContain("1240ms");
  });

  it("keeps an editorial key in a path, and replaces an identity", () => {
    const safe = scrubUrlText(
      "https://circulos-test-web.vercel.app/actividades/duo-lo-que-me-ayuda?v=2",
    );
    // Hyphenated words are not identities, and losing them would throw away the
    // first thing you want to know about a failing request.
    expect(safe).toBe(
      "https://circulos-test-web.vercel.app/actividades/duo-lo-que-me-ayuda",
    );

    expect(
      scrubUrlText(
        "https://circulos-test-web.vercel.app/compartir/cmu2zxq6v0069ot42o312tfmx",
      ),
    ).toBe("https://circulos-test-web.vercel.app/compartir/:id");
  });

  it("knows an identity from a word", () => {
    expect(looksIdentifying("cmu2zxq6v0069ot42o312tfmx")).toBe(true);
    expect(looksIdentifying("4283213c-9369-4c5c-928e-b2a1d58f3a44")).toBe(true);
    expect(looksIdentifying("123456789")).toBe(true);
    expect(looksIdentifying("duo-lo-que-me-ayuda")).toBe(false);
    expect(looksIdentifying("eec-c1-cuerpo-antes-que-mente")).toBe(false);
    expect(looksIdentifying("verify-email")).toBe(false);
  });

  it("returns short and empty input unchanged rather than erroring", () => {
    expect(redactDiagnostics("")).toBe("");
    expect(redactDiagnostics("ok")).toBe("ok");
  });
});

describe("one list of what counts as a credential", () => {
  it("covers every header the shared Sentry redactor protects", () => {
    // Two implementations — a structured event, and free-form text — but the
    // list of what must never be printed is one thing, and a name added to the
    // shared module has to be added here too.
    for (const name of SENSITIVE_HEADERS) {
      expect(SENSITIVE_HEADER_NAMES).toContain(name);
    }
  });
});

/**
 * The failure branches themselves.
 *
 * Every test above proves the redactor works on a string. These prove the
 * strings that actually get published go through it — which is the part that
 * was missing, not the redacting.
 */
describe("the paths that publish a diagnostic go through the redactor", () => {
  const E2E = resolve(__dirname, "../../../e2e/circulos");
  const read = (f: string) => readFileSync(join(E2E, f), "utf8");

  it("the stack redacts a service log tail at its only choke point", () => {
    const src = read("stack.mjs");
    expect(src).toMatch(/function serviceLog[\s\S]{0,900}?redactDiagnostics\(/);
  });

  it("the stack redacts its own fatal message", () => {
    expect(read("stack.mjs")).toContain(
      "console.error(`\\n✖ ${redactDiagnostics(err.message)}`)",
    );
  });

  it("the walk redacts every check label and every thrown message", () => {
    const src = read("duo.walk.mjs");
    expect(src).toMatch(/function check\([\s\S]{0,900}?redactDiagnostics\(/);
    expect(src).toMatch(/catch \(err\) \{[\s\S]{0,900}?redactDiagnostics\(/);
  });

  it("the negative-control runner redacts before it writes to disk", () => {
    // These files outlive the run on purpose. Something written unredacted is
    // already published to whatever backs that disk up.
    const src = readFileSync(
      resolve(__dirname, "../../../../api/src/circles/negative-controls.mjs"),
      "utf8",
    );
    expect(src).toMatch(/function keep\([\s\S]{0,900}?redactDiagnostics\(/);
  });
});
