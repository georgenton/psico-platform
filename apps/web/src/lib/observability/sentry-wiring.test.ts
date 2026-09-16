import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SENSITIVE_HEADERS, sanitizeSentryEvent, scrubUrl } from "@psico/types";

/**
 * The Web's three Sentry runtimes, and what they are allowed to send.
 *
 * The API had a redactor and the Web had none, which is exactly backwards:
 * `/i#<token>` and `/compartir/<id>` are opened in a BROWSER. The invitation is
 * in the fragment, the room is in the path, and both travel in `request.url`,
 * in fetch breadcrumbs and in navigation breadcrumbs — none of which
 * `sendDefaultPii: false` touches, because that setting governs what Sentry
 * ADDS, not what its integrations already collected.
 *
 * Initialising the real SDK in three runtimes to assert this would test the
 * SDK. What matters is narrower and checkable: that each config installs the
 * shared hooks, and that the shared function does its job. The second half is
 * exercised against real values below rather than trusted.
 */

const WEB = resolve(__dirname, "../../..");
const CONFIGS = [
  "sentry.server.config.ts",
  "sentry.edge.config.ts",
  "sentry.client.config.ts",
];

describe("every Sentry runtime in the Web installs the shared redactor", () => {
  for (const file of CONFIGS) {
    it(`${file} wires beforeSend, beforeSendTransaction and beforeBreadcrumb`, () => {
      const src = readFileSync(join(WEB, file), "utf8");
      expect(src).toContain('from "@psico/types"');
      expect(src).toContain("beforeSend: sanitizeSentryEvent");
      expect(src).toContain("beforeSendTransaction: sanitizeSentryEvent");
      expect(src).toContain("beforeBreadcrumb: sanitizeBreadcrumb");
      // A second, local list would be the drift this file exists to stop.
      expect(src).not.toContain("REDACTED_HEADERS");
    });
  }

  it("uses ONE list of sensitive headers, and it names the Círculos ones", () => {
    expect(SENSITIVE_HEADERS).toContain("x-circle-guest-session");
    expect(SENSITIVE_HEADERS).toContain("x-client-attestation");
    expect(SENSITIVE_HEADERS).toContain("set-cookie");
    expect(SENSITIVE_HEADERS).toContain("cookie");
    expect(SENSITIVE_HEADERS).toContain("authorization");
  });
});

describe("what a browser would have sent about an invitation", () => {
  const TOKEN = "browserDECOYtoken00000000001";
  const ACTIVITY = "cmuDECOYbrowseractivity00002";

  it("keeps neither the fragment nor the room id", () => {
    const out = sanitizeSentryEvent({
      transaction: `/compartir/${ACTIVITY}`,
      request: { url: `https://feelverse.test/i#${TOKEN}` },
      breadcrumbs: [
        {
          category: "navigation",
          data: { from: `/i#${TOKEN}`, to: `/compartir/${ACTIVITY}` },
        },
      ],
    } as never);

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(ACTIVITY);
  });

  it("scrubs a fragment even when the URL does not parse", () => {
    // A relative URL throws in `new URL`. The fallback must already have the
    // fragment gone, or the catch hands back the token.
    expect(scrubUrl(`/i#${TOKEN}`)).toBe("/i");
    expect(scrubUrl(`/compartir/${ACTIVITY}?ref=x`)).toBe("/compartir/:id");
  });
});
