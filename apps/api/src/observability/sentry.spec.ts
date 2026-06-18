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
