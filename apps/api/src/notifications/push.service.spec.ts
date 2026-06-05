import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseWebToken, PushService } from "./push.service";

/**
 * S43 baseline tests still cover the Expo branch. S47 adds the Web Push
 * branch + the dual-platform routing logic.
 *
 * web-push is mocked because the real library hits Mozilla / Google push
 * services; we just want to verify our wiring (correct dispatch, receipt
 * mapping, stale-token flagging).
 */
const webpushMocks = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    sendNotification: webpushMocks.sendNotification,
    setVapidDetails: webpushMocks.setVapidDetails,
  },
}));

function buildConfig(
  env: Partial<{
    VAPID_PUBLIC_KEY: string;
    VAPID_PRIVATE_KEY: string;
    VAPID_SUBJECT: string;
  }> = {},
) {
  return {
    get: vi.fn((key: string) => env[key as keyof typeof env]),
  } as never;
}

function buildSub(label: string) {
  return JSON.stringify({
    endpoint: `https://push.example.com/${label}`,
    keys: {
      p256dh: "AAAA-base64url",
      auth: "BBBB-base64url",
    },
  });
}

describe("PushService.sendToTokens", () => {
  let svc: PushService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new PushService(buildConfig());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Expo branch (S43) ───────────────────────────────────────────────

  it("returns 'error' (without calling fetch) when no tokens are Expo-shaped AND no VAPID configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await svc.sendToTokens([`web:${buildSub("a")}`, "garbage"], {
      title: "x",
      body: "y",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res).toHaveLength(2);
    // First token is web-shaped but VAPID not configured → error.
    // Second token is unknown shape → error.
    expect(res.every((r) => r.status === "error")).toBe(true);
  });

  it("posts to Expo and maps 'ok' receipts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ status: "ok" }, { status: "ok" }],
        }),
        { status: 200 },
      ),
    );

    const res = await svc.sendToTokens(
      ["ExponentPushToken[a]", "ExponentPushToken[b]"],
      { title: "Hola", body: "Tu pregunta del día" },
    );

    expect(res).toEqual([{ status: "ok" }, { status: "ok" }]);
  });

  it("flags DeviceNotRegistered as invalidToken for caller pruning", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "ok" },
            {
              status: "error",
              message: "stale",
              details: { error: "DeviceNotRegistered" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await svc.sendToTokens(
      ["ExponentPushToken[good]", "ExponentPushToken[stale]"],
      { title: "x", body: "y" },
    );

    expect(res[0]?.status).toBe("ok");
    expect(res[1]).toEqual({
      status: "error",
      errorCode: "DeviceNotRegistered",
      invalidToken: "ExponentPushToken[stale]",
    });
  });

  it("propagates transport failures so BullMQ can retry", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      svc.sendToTokens(["ExponentPushToken[a]"], { title: "x", body: "y" }),
    ).rejects.toThrow(/ECONNRESET/);
  });

  it("throws when Expo returns non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("internal", { status: 500 }),
    );
    await expect(
      svc.sendToTokens(["ExponentPushToken[a]"], { title: "x", body: "y" }),
    ).rejects.toThrow(/EXPO_PUSH_500/);
  });

  // ── Web Push branch (S47) ───────────────────────────────────────────

  it("sends Web Push when VAPID configured and reports ok per subscription", async () => {
    svc = new PushService(
      buildConfig({
        VAPID_PUBLIC_KEY: "pub",
        VAPID_PRIVATE_KEY: "priv",
        VAPID_SUBJECT: "mailto:ops@psico.app",
      }),
    );
    webpushMocks.sendNotification.mockResolvedValue(undefined);

    const res = await svc.sendToTokens(
      [`web:${buildSub("a")}`, `web:${buildSub("b")}`],
      { title: "Hola", body: "Tu pregunta del día", url: "/dashboard/diario" },
    );

    expect(webpushMocks.setVapidDetails).toHaveBeenCalledWith(
      "mailto:ops@psico.app",
      "pub",
      "priv",
    );
    expect(webpushMocks.sendNotification).toHaveBeenCalledTimes(2);
    // Payload is serialized once and shared across subs.
    const [, payloadStr] = webpushMocks.sendNotification.mock.calls[0]!;
    const payload = JSON.parse(payloadStr as string);
    expect(payload).toMatchObject({
      title: "Hola",
      body: "Tu pregunta del día",
      url: "/dashboard/diario",
    });

    expect(res).toEqual([{ status: "ok" }, { status: "ok" }]);
  });

  it("flags WebPush 410/404 as invalidToken so the caller prunes the subscription", async () => {
    svc = new PushService(
      buildConfig({
        VAPID_PUBLIC_KEY: "pub",
        VAPID_PRIVATE_KEY: "priv",
        VAPID_SUBJECT: "mailto:ops@psico.app",
      }),
    );
    const stale = `web:${buildSub("stale")}`;
    webpushMocks.sendNotification.mockImplementation(
      (sub: { endpoint: string }) => {
        if (sub.endpoint.endsWith("/stale")) {
          const err = Object.assign(new Error("gone"), { statusCode: 410 });
          throw err;
        }
        return Promise.resolve(undefined);
      },
    );

    const res = await svc.sendToTokens([`web:${buildSub("ok")}`, stale], {
      title: "x",
      body: "y",
    });

    expect(res[0]).toEqual({ status: "ok" });
    expect(res[1]).toEqual({
      status: "error",
      errorCode: "WEBPUSH_410",
      invalidToken: stale,
    });
  });

  it("flags malformed web: tokens as invalidToken without crashing the batch", async () => {
    svc = new PushService(
      buildConfig({
        VAPID_PUBLIC_KEY: "pub",
        VAPID_PRIVATE_KEY: "priv",
        VAPID_SUBJECT: "mailto:ops@psico.app",
      }),
    );
    webpushMocks.sendNotification.mockResolvedValue(undefined);

    const malformed = "web:not-json{";
    const res = await svc.sendToTokens([`web:${buildSub("ok")}`, malformed], {
      title: "x",
      body: "y",
    });

    expect(res[0]).toEqual({ status: "ok" });
    expect(res[1]).toEqual({
      status: "error",
      errorCode: "InvalidSubscription",
      invalidToken: malformed,
    });
    // The malformed sub never reached web-push.
    expect(webpushMocks.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("preserves original index order when mixing Expo + Web tokens", async () => {
    svc = new PushService(
      buildConfig({
        VAPID_PUBLIC_KEY: "pub",
        VAPID_PRIVATE_KEY: "priv",
        VAPID_SUBJECT: "mailto:ops@psico.app",
      }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "ok" }, // for the second token (the only Expo one)
          ],
        }),
        { status: 200 },
      ),
    );
    webpushMocks.sendNotification.mockResolvedValue(undefined);

    // Order: web, expo, web. The receipts must come back in the same order.
    const res = await svc.sendToTokens(
      [`web:${buildSub("a")}`, "ExponentPushToken[b]", `web:${buildSub("c")}`],
      { title: "x", body: "y" },
    );

    expect(res).toHaveLength(3);
    expect(res[0]).toEqual({ status: "ok" }); // web a
    expect(res[1]).toEqual({ status: "ok" }); // expo b
    expect(res[2]).toEqual({ status: "ok" }); // web c
  });
});

describe("parseWebToken", () => {
  it("returns null for non-web prefix", () => {
    expect(parseWebToken("ExponentPushToken[abc]")).toBeNull();
  });

  it("returns null when JSON is malformed", () => {
    expect(parseWebToken("web:not-json{")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(
      parseWebToken(`web:${JSON.stringify({ endpoint: "x" })}`),
    ).toBeNull();
    expect(
      parseWebToken(
        `web:${JSON.stringify({ endpoint: "x", keys: { p256dh: "x" } })}`,
      ),
    ).toBeNull();
  });

  it("parses a valid subscription", () => {
    const json = JSON.stringify({
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "AAAA", auth: "BBBB" },
      expirationTime: null,
    });
    const parsed = parseWebToken(`web:${json}`);
    expect(parsed).toEqual({
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "AAAA", auth: "BBBB" },
    });
  });
});
