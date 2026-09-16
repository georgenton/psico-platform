import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the Sentry init wrapper.
 *
 * Goals:
 *   - When SENTRY_DSN is unset, the SDK's `init` is NOT called and the
 *     module reports `isSentryInitialised() === true` (we still "complete"
 *     init, just as a no-op).
 *   - When SENTRY_DSN is set, `init` is called once with the DSN and the
 *     environment/release fields populated from env.
 *   - `captureException` is a no-op until init runs.
 *   - The `beforeSend` hook scrubs known auth-bearing headers.
 *
 * We mock `@sentry/node` entirely so the suite stays hermetic — no
 * outbound HTTP, no global SDK state across tests.
 */

const sentryMock = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  withScope: vi.fn((cb: (scope: { setContext: typeof vi.fn }) => void) => {
    cb({ setContext: vi.fn() });
  }),
}));

vi.mock("@sentry/node", () => sentryMock);

async function loadModule() {
  // Re-import so the module-level `initialised` flag resets per test.
  vi.resetModules();
  return import("./sentry");
}

describe("initSentry", () => {
  beforeEach(() => {
    sentryMock.init.mockClear();
    sentryMock.captureException.mockClear();
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_RELEASE;
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_RELEASE;
  });

  it("is a no-op when SENTRY_DSN is not set", async () => {
    const { initSentry, isSentryInitialised } = await loadModule();
    initSentry();
    expect(sentryMock.init).not.toHaveBeenCalled();
    expect(isSentryInitialised()).toBe(true);
  });

  it("calls Sentry.init when SENTRY_DSN is set", async () => {
    process.env.SENTRY_DSN = "https://example@o1.ingest.sentry.io/123";
    process.env.SENTRY_RELEASE = "psico-api@1.2.3";
    const { initSentry } = await loadModule();
    initSentry();
    expect(sentryMock.init).toHaveBeenCalledTimes(1);
    const args = sentryMock.init.mock.calls[0]![0]!;
    expect(args.dsn).toBe("https://example@o1.ingest.sentry.io/123");
    expect(args.release).toBe("psico-api@1.2.3");
    expect(args.sendDefaultPii).toBe(false);
  });

  it("is idempotent — second call doesn't re-init", async () => {
    process.env.SENTRY_DSN = "https://example@o1.ingest.sentry.io/123";
    const { initSentry } = await loadModule();
    initSentry();
    initSentry();
    expect(sentryMock.init).toHaveBeenCalledTimes(1);
  });

  it("scrubs known auth-bearing headers in beforeSend", async () => {
    process.env.SENTRY_DSN = "https://example@o1.ingest.sentry.io/123";
    const { initSentry } = await loadModule();
    initSentry();
    const config = sentryMock.init.mock.calls[0]![0]!;
    const event = {
      request: {
        headers: {
          authorization: "Bearer real-token",
          cookie: "session=abc",
          "stripe-signature": "v1,t=123",
          "x-api-key": "k_real",
          "user-agent": "Mozilla/5.0",
        },
      },
    };
    const out = config.beforeSend(event);
    expect(out.request.headers.authorization).toBe("[REDACTED]");
    expect(out.request.headers.cookie).toBe("[REDACTED]");
    expect(out.request.headers["stripe-signature"]).toBe("[REDACTED]");
    expect(out.request.headers["x-api-key"]).toBe("[REDACTED]");
    // Non-secret headers pass through.
    expect(out.request.headers["user-agent"]).toBe("Mozilla/5.0");
  });
});

describe("captureException", () => {
  beforeEach(() => {
    sentryMock.init.mockClear();
    sentryMock.captureException.mockClear();
    delete process.env.SENTRY_DSN;
  });

  it("forwards to Sentry.captureException once init has run with DSN", async () => {
    process.env.SENTRY_DSN = "https://example@o1.ingest.sentry.io/123";
    const { initSentry, captureException } = await loadModule();
    initSentry();
    const err = new Error("boom");
    captureException(err);
    expect(sentryMock.captureException).toHaveBeenCalledWith(err);
  });

  it("wraps with withScope when given context", async () => {
    process.env.SENTRY_DSN = "https://example@o1.ingest.sentry.io/123";
    const { initSentry, captureException } = await loadModule();
    initSentry();
    captureException(new Error("ctx"), { method: "POST", path: "/x" });
    expect(sentryMock.withScope).toHaveBeenCalled();
    expect(sentryMock.captureException).toHaveBeenCalled();
  });

  it("is a no-op when init never ran (e.g. no DSN)", async () => {
    const { captureException, initSentry } = await loadModule();
    initSentry(); // No DSN → no-op init.
    captureException(new Error("silent"));
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });
});

/**
 * The LAST privacy boundary: whatever survives here is what leaves the
 * process. These test the transform itself, not a mocked `captureException` —
 * the leak we care about is the raw request Sentry's own instrumentation
 * attaches, which no call-site context could ever undo.
 */
describe("sanitizeSentryEvent", () => {
  const SESSION = "cmb0realsession123";
  const STEP = "explorar-cuerpo-antes-que-mente";
  const TOKEN = "supersecrettoken";
  const SAFE_PATH = "/api/guide/sessions/:sessionId/steps/:stepKey/complete";

  const makeEvent = () => ({
    request: {
      url: `https://api.example.test/api/guide/sessions/${SESSION}/steps/${STEP}/complete?token=${TOKEN}`,
      query_string: `token=${TOKEN}`,
      data: { idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        cookie: "session=abc",
        "stripe-signature": "v1,t=123",
        "x-api-key": "k_real",
        "user-agent": "Mozilla/5.0",
      },
    },
    contexts: {
      custom: { method: "POST", path: SAFE_PATH, statusCode: 500 },
    },
  });

  it("drops the raw url, query string and body, and keeps the safe path", async () => {
    const { sanitizeSentryEvent } = await loadModule();
    const out = sanitizeSentryEvent(makeEvent() as never) as unknown as {
      request: Record<string, unknown>;
      contexts: { custom: { path: string } };
    };

    // SENTRY_EVENT_REQUEST_URL_PRESENT=false
    expect("url" in out.request).toBe(false);
    // SENTRY_EVENT_QUERY_STRING_PRESENT=false
    expect("query_string" in out.request).toBe(false);
    // SENTRY_EVENT_REQUEST_DATA_PRESENT=false
    expect("data" in out.request).toBe(false);
    // SENTRY_CUSTOM_SAFE_PATH_PRESERVED=true
    expect(out.contexts.custom.path).toBe(SAFE_PATH);
    // The method is still useful for triage and carries no user value.
    expect(out.request.method).toBe("POST");
  });

  it("leaves no session id, step key or token anywhere in the event", async () => {
    const { sanitizeSentryEvent } = await loadModule();
    const serialized = JSON.stringify(
      sanitizeSentryEvent(makeEvent() as never),
    );
    expect(serialized).not.toContain(SESSION);
    expect(serialized).not.toContain(STEP);
    expect(serialized).not.toContain(TOKEN);
    // …while the template that ops actually triages by survives.
    expect(serialized).toContain(SAFE_PATH);
  });

  it("still redacts the auth-bearing headers", async () => {
    const { sanitizeSentryEvent } = await loadModule();
    const out = sanitizeSentryEvent(makeEvent() as never) as unknown as {
      request: { headers: Record<string, string> };
    };
    // SENTRY_SENSITIVE_HEADERS_REDACTED=true
    expect(out.request.headers.authorization).toBe("[REDACTED]");
    expect(out.request.headers.cookie).toBe("[REDACTED]");
    expect(out.request.headers["stripe-signature"]).toBe("[REDACTED]");
    expect(out.request.headers["x-api-key"]).toBe("[REDACTED]");
    expect(out.request.headers["user-agent"]).toBe("Mozilla/5.0");
  });

  it("passes through an event with no request section", async () => {
    const { sanitizeSentryEvent } = await loadModule();
    const event = { message: "worker job failed" };
    expect(sanitizeSentryEvent(event as never)).toBe(event);
  });

  it("is the function wired as beforeSend — not a parallel implementation", async () => {
    sentryMock.init.mockClear();
    process.env.SENTRY_DSN = "https://example@o1.ingest.sentry.io/123";
    const { initSentry, sanitizeSentryEvent } = await loadModule();
    initSentry();
    const config = sentryMock.init.mock.calls[0]![0]!;
    expect(config.beforeSend).toBe(sanitizeSentryEvent);
    delete process.env.SENTRY_DSN;
  });
});

/**
 * Decoys, not assertions about intent.
 *
 * Each secret below is a distinctive string planted in every shape Sentry can
 * carry one — request headers in three casings, the URL's fragment and query,
 * a fetch breadcrumb, a navigation breadcrumb, the transaction name. The test
 * then serialises the WHOLE event and looks for any of them.
 *
 * That is the only form of this test worth having: `sendDefaultPii: false` is
 * a setting, not a proof, and asserting field by field would only check the
 * fields somebody remembered.
 */
describe("Círculos credentials never leave the process", () => {
  const GUEST = "gstsessionDECOY0000000000000001";
  const ATTEST = "attestDECOY0000000000000000002";
  const INVITE = "inviteTokenDECOY000000000000003";
  const ACTIVITY = "cmuDECOYactivity00000000000004";
  const BEARER = "bearerDECOY0000000000000000005";
  const SETCOOKIE = "psico_circulos_guest=cookieDECOY6; HttpOnly";

  const plantedEvent = () => ({
    transaction: `/compartir/${ACTIVITY}`,
    request: {
      // Three casings on purpose: Node lowercases, fetch preserves, Edge does
      // neither reliably. A Set keyed on exact strings misses two of these.
      headers: {
        "X-Circle-Guest-Session": GUEST,
        "x-client-attestation": ATTEST,
        Authorization: `Bearer ${BEARER}`,
        "Set-Cookie": SETCOOKIE,
        "user-agent": "Mozilla/5.0",
      },
      url: `https://feelverse.test/i#${INVITE}`,
      query_string: `secret=${INVITE}`,
      data: { secret: INVITE },
      cookies: { psico_circulos_guest: GUEST },
    },
    breadcrumbs: [
      {
        category: "fetch",
        data: {
          url: `https://feelverse.test/api/circulos/actividad/${ACTIVITY}`,
          headers: { "X-Circle-Guest-Session": GUEST },
          body: { secret: INVITE },
        },
      },
      {
        category: "navigation",
        data: { from: `/i#${INVITE}`, to: `/compartir/${ACTIVITY}` },
      },
    ],
  });

  const DECOYS = [GUEST, ATTEST, INVITE, ACTIVITY, BEARER, "cookieDECOY6"];

  it("finds none of them anywhere in the serialized event", async () => {
    const { sanitizeSentryEvent } = await loadModule();
    const serialized = JSON.stringify(
      sanitizeSentryEvent(plantedEvent() as never),
    );
    for (const decoy of DECOYS) {
      expect(serialized, decoy).not.toContain(decoy);
    }
  });

  it("keeps the shape of the route, so triage still works", async () => {
    const { sanitizeSentryEvent } = await loadModule();
    const out = sanitizeSentryEvent(plantedEvent() as never) as unknown as {
      transaction: string;
      request: { headers: Record<string, string> };
      breadcrumbs: { data: Record<string, string> }[];
    };
    expect(out.transaction).toBe("/compartir/:id");
    expect(out.breadcrumbs[0]!.data.url).toBe("/api/circulos/actividad/:id");
    expect(out.breadcrumbs[1]!.data.from).toBe("/i");
    expect(out.breadcrumbs[1]!.data.to).toBe("/compartir/:id");
    // The one header worth keeping is kept.
    expect(out.request.headers["user-agent"]).toBe("Mozilla/5.0");
  });

  it("redacts the guest credential whatever case it arrives in", async () => {
    const { sanitizeSentryEvent } = await loadModule();
    for (const name of [
      "x-circle-guest-session",
      "X-Circle-Guest-Session",
      "X-CIRCLE-GUEST-SESSION",
    ]) {
      const out = sanitizeSentryEvent({
        request: { headers: { [name]: GUEST } },
      } as never) as unknown as {
        request: { headers: Record<string, string> };
      };
      expect(out.request.headers[name], name).toBe("[REDACTED]");
    }
  });
});
