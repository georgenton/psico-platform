import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushService } from "./push.service";

describe("PushService.sendToTokens", () => {
  let svc: PushService;

  beforeEach(() => {
    svc = new PushService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'error' (without calling fetch) when no tokens are Expo-shaped", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await svc.sendToTokens(["web:abc", "garbage"], {
      title: "x",
      body: "y",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res).toHaveLength(2);
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
});
