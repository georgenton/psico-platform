import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CloudflareStreamAccessService,
  STREAM_TOKEN_TTL_SEC,
  normalizeCustomerCode,
  readToken,
} from "./cloudflare-stream-access.service";

/**
 * GR-2 — Stream access ratchet.
 *
 * `fetch` is mocked in every test: CI never talks to Cloudflare, and the tests
 * assert what we SEND (the exact endpoint, the server-side auth header, a short
 * expiry) and what we NEVER LEAK (the token, the account id, the video UID, the
 * raw response, the signed URL).
 */

const ACCOUNT = "acc-1234567890";
const TOKEN = "cf-api-token-value";
const CUSTOMER = "abcxyz";

function makeConfig(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  } as unknown as ConstructorParameters<
    typeof CloudflareStreamAccessService
  >[0];
}

function configured() {
  return makeConfig({
    CLOUDFLARE_STREAM_ACCOUNT_ID: ACCOUNT,
    CLOUDFLARE_STREAM_API_TOKEN: TOKEN,
    CLOUDFLARE_STREAM_CUSTOMER_CODE: CUSTOMER,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function okResponse(token = "signed.jwt.value") {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, errors: [], result: { token } }),
  } as unknown as Response;
}

describe("readToken — exact success envelope", () => {
  it("reads the token from the provider's success shape", () => {
    expect(readToken({ success: true, result: { token: "abc" } })).toBe("abc");
  });

  it("returns null for anything else", () => {
    expect(readToken(null)).toBeNull();
    expect(readToken({ success: false, result: { token: "abc" } })).toBeNull();
    expect(readToken({ success: true })).toBeNull();
    expect(readToken({ success: true, result: { token: 7 } })).toBeNull();
    expect(readToken({ success: true, result: { token: "" } })).toBeNull();
  });
});

describe("CloudflareStreamAccessService", () => {
  it("reports whether the trio is present", () => {
    expect(new CloudflareStreamAccessService(configured()).isConfigured()).toBe(
      true,
    );
    expect(
      new CloudflareStreamAccessService(makeConfig({})).isConfigured(),
    ).toBe(false);
  });

  it("refuses to sign without configuration, without calling out", async () => {
    const service = new CloudflareStreamAccessService(makeConfig({}));
    await expect(
      service.createAccess({ videoUid: "uid1", captionLanguage: "es" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the official /token endpoint with a short expiry", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const service = new CloudflareStreamAccessService(configured());

    const before = Math.floor(Date.now() / 1000);
    await service.createAccess({
      videoUid: "abcdef0123456789",
      captionLanguage: "es",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream/abcdef0123456789/token`,
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);

    const body = JSON.parse(init.body as string) as { exp: number };
    // ~15 minutes, and never open-ended.
    expect(body.exp).toBeGreaterThan(before);
    expect(body.exp).toBeLessThanOrEqual(before + STREAM_TOKEN_TTL_SEC + 2);
    expect(STREAM_TOKEN_TTL_SEC).toBe(900);
  });

  it("builds a managed-player URL that never enables autoplay", async () => {
    fetchMock.mockResolvedValue(okResponse("signed.token.here"));
    const service = new CloudflareStreamAccessService(configured());

    const access = await service.createAccess({
      videoUid: "abcdef0123456789",
      captionLanguage: "es",
    });

    expect(access.embedUrl).toBe(
      `https://customer-${CUSTOMER}.cloudflarestream.com/signed.token.here/iframe?controls=true&defaultTextTrack=es`,
    );
    expect(access.embedUrl).not.toContain("autoplay");
    expect(access.defaultTextTrack).toBe("es");
    // The video UID is replaced by the signed token — it never reaches a client.
    expect(access.embedUrl).not.toContain("abcdef0123456789");
    expect(Date.parse(access.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("omits the text track when the master has no captions", async () => {
    fetchMock.mockResolvedValue(okResponse("t"));
    const service = new CloudflareStreamAccessService(configured());

    const access = await service.createAccess({
      videoUid: "abcdef0123456789",
      captionLanguage: null,
    });

    expect(access.embedUrl).not.toContain("defaultTextTrack");
    expect(access.defaultTextTrack).toBeNull();
  });

  it.each([
    [
      "a non-2xx status",
      () =>
        fetchMock.mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({ errors: [{ message: "Invalid API token" }] }),
        } as unknown as Response),
    ],
    [
      "an unparseable body",
      () =>
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("not json");
          },
        } as unknown as Response),
    ],
    [
      "an unexpected body",
      () =>
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ success: false }),
        } as unknown as Response),
    ],
    [
      "a network failure",
      () => fetchMock.mockRejectedValue(new Error(`connect ECONNREFUSED`)),
    ],
  ])("maps %s to one value-free error", async (_label, arrange) => {
    arrange();
    const service = new CloudflareStreamAccessService(configured());

    await expect(
      service.createAccess({
        videoUid: "abcdef0123456789",
        captionLanguage: "es",
      }),
    ).rejects.toMatchObject({ message: "MEDIA_PROVIDER_UNAVAILABLE" });
  });

  it("leaks no provider value through the thrown error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ errors: [{ message: `token ${TOKEN} rejected` }] }),
    } as unknown as Response);
    const service = new CloudflareStreamAccessService(configured());

    const error = await service
      .createAccess({ videoUid: "abcdef0123456789", captionLanguage: "es" })
      .catch((err: unknown) => err as Error & { cause?: unknown });

    const serialized = `${error.message}${JSON.stringify(
      error,
      Object.getOwnPropertyNames(error),
    )}`;
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(ACCOUNT);
    expect(serialized).not.toContain(CUSTOMER);
    expect(serialized).not.toContain("abcdef0123456789");
    expect(error.cause).toBeUndefined();
  });
});

describe("normalizeCustomerCode", () => {
  it("accepts the bare code", () => {
    expect(normalizeCustomerCode("a1b2c3d4e5f6g7h8")).toBe("a1b2c3d4e5f6g7h8");
  });

  it("accepts the shapes Cloudflare actually shows an operator", () => {
    // The same fact, copied from four different places in the dashboard.
    expect(normalizeCustomerCode("customer-a1b2c3d4e5f6g7h8")).toBe(
      "a1b2c3d4e5f6g7h8",
    );
    expect(
      normalizeCustomerCode("customer-a1b2c3d4e5f6g7h8.cloudflarestream.com"),
    ).toBe("a1b2c3d4e5f6g7h8");
    expect(
      normalizeCustomerCode(
        "https://customer-a1b2c3d4e5f6g7h8.cloudflarestream.com/abc/iframe",
      ),
    ).toBe("a1b2c3d4e5f6g7h8");
  });

  it("rejects a value that cannot be a hostname, instead of repairing it", () => {
    // Uppercase and underscores are not a formatting variation of the code —
    // they mean a different value landed in the variable. Lowercasing it would
    // point playback at whatever account that string happens to name.
    expect(normalizeCustomerCode("Some_Other_Value")).toBeNull();
    expect(normalizeCustomerCode("has spaces")).toBeNull();
    expect(normalizeCustomerCode("")).toBeNull();
  });
});
