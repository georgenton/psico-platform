import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import {
  DailyVideoProvider,
  nameFromUrl,
  roomNameFor,
} from "./daily-video.provider";

function makeConfig(
  overrides: Partial<{ DAILY_API_KEY: string; DAILY_DOMAIN: string }> = {},
): ConfigService {
  const defaults = {
    DAILY_API_KEY: "test-key",
    DAILY_DOMAIN: "psico.daily.co",
    ...overrides,
  };
  return {
    get: (k: string) =>
      defaults[k as keyof typeof defaults] as string | undefined,
  } as unknown as ConfigService;
}

function mockFetch(
  responses: Array<{ status: number; body?: unknown }>,
): ReturnType<typeof vi.fn> {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++] ?? { status: 500 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      async json() {
        return r.body ?? {};
      },
      async text() {
        return JSON.stringify(r.body ?? {});
      },
    } as unknown as Response;
  });
}

describe("DailyVideoProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reports isConfigured=false when env is missing", () => {
    const provider = new DailyVideoProvider(makeConfig({ DAILY_API_KEY: "" }));
    expect(provider.isConfigured()).toBe(false);
  });

  it("reports isConfigured=true when both env vars present", () => {
    const provider = new DailyVideoProvider(makeConfig());
    expect(provider.isConfigured()).toBe(true);
  });

  it("createRoom posts to /v1/rooms with expected body and returns url", async () => {
    const provider = new DailyVideoProvider(makeConfig());
    const fetchMock = mockFetch([
      { status: 200, body: { url: "https://psico.daily.co/session-abc" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const res = await provider.createRoom({
      sessionId: "abc",
      expiresInSec: 7200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.daily.co/v1/rooms");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("session-abc");
    expect(body.privacy).toBe("private");
    expect(body.properties.enable_recording).toBe(false);
    expect(body.properties.max_participants).toBe(2);
    expect(typeof body.properties.exp).toBe("number");
    expect(res.roomUrl).toBe("https://psico.daily.co/session-abc");
  });

  it("createRoom returns existing room URL on 409 conflict", async () => {
    const provider = new DailyVideoProvider(makeConfig());
    const fetchMock = mockFetch([
      { status: 409, body: { error: "room name already exists" } },
      { status: 200, body: { url: "https://psico.daily.co/session-abc" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const res = await provider.createRoom({
      sessionId: "abc",
      expiresInSec: 7200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.daily.co/v1/rooms/session-abc",
    );
    expect(res.roomUrl).toBe("https://psico.daily.co/session-abc");
  });

  it("createRoom throws on non-409 error", async () => {
    const provider = new DailyVideoProvider(makeConfig());
    const fetchMock = mockFetch([{ status: 500, body: { error: "boom" } }]);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      provider.createRoom({ sessionId: "abc", expiresInSec: 7200 }),
    ).rejects.toThrow(/DAILY_CREATE_ROOM_FAILED:500/);
  });

  it("createJoinToken posts to /meeting-tokens with owner/user_name", async () => {
    const provider = new DailyVideoProvider(makeConfig());
    const fetchMock = mockFetch([
      { status: 200, body: { token: "jwt-abc" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const res = await provider.createJoinToken({
      roomUrl: "https://psico.daily.co/session-abc",
      userName: "Jorge",
      isOwner: false,
      expiresInSec: 3600,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.daily.co/v1/meeting-tokens");
    const body = JSON.parse(init.body as string);
    expect(body.properties.room_name).toBe("session-abc");
    expect(body.properties.user_name).toBe("Jorge");
    expect(body.properties.is_owner).toBe(false);
    expect(typeof body.properties.exp).toBe("number");
    expect(res.joinToken).toBe("jwt-abc");
  });

  it("destroyRoom DELETEs by room name", async () => {
    const provider = new DailyVideoProvider(makeConfig());
    const fetchMock = mockFetch([{ status: 200 }]);
    vi.stubGlobal("fetch", fetchMock);

    await provider.destroyRoom("https://psico.daily.co/session-abc");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.daily.co/v1/rooms/session-abc");
    expect(init.method).toBe("DELETE");
  });

  it("destroyRoom swallows 404 (already gone) as success", async () => {
    const provider = new DailyVideoProvider(makeConfig());
    const fetchMock = mockFetch([{ status: 404 }]);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      provider.destroyRoom("https://psico.daily.co/session-abc"),
    ).resolves.toBeUndefined();
  });

  it("throws DAILY_NOT_CONFIGURED when key missing and createRoom called", async () => {
    const provider = new DailyVideoProvider(
      makeConfig({ DAILY_API_KEY: "" }),
    );
    await expect(
      provider.createRoom({ sessionId: "abc", expiresInSec: 7200 }),
    ).rejects.toThrow(/DAILY_NOT_CONFIGURED/);
  });
});

describe("roomNameFor", () => {
  it("prefixes session- and strips unsafe characters", () => {
    expect(roomNameFor("clxyz1234")).toBe("session-clxyz1234");
    expect(roomNameFor("ab cd/ef")).toBe("session-abcdef");
  });

  it("trims to a safe length", () => {
    const long = "a".repeat(200);
    const name = roomNameFor(long);
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.startsWith("session-")).toBe(true);
  });
});

describe("nameFromUrl", () => {
  it("extracts last path segment from a Daily room URL", () => {
    expect(nameFromUrl("https://psico.daily.co/session-abc")).toBe(
      "session-abc",
    );
    expect(nameFromUrl("https://psico.daily.co/session-abc/")).toBe(
      "session-abc",
    );
  });

  it("returns null on malformed input", () => {
    expect(nameFromUrl("not a url")).toBe(null);
  });
});
