import { describe, expect, it, vi, beforeEach } from "vitest";

const headerStore: Record<string, string | undefined> = {
  origin: "https://app.test",
  host: "app.test",
};
const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: () => ({ get: (k: string) => headerStore[k] ?? null }),
  cookies: () => ({
    get: (k: string) =>
      cookieStore.has(k) ? { value: cookieStore.get(k) } : undefined,
    delete: (k: string) => cookieStore.delete(k),
  }),
}));
vi.mock("server-only", () => ({}));

import { POST as inspeccionPOST } from "./inspeccion/route";
import { POST as duoPOST } from "./duo/route";
import { POST as comandoPOST } from "./actividad/[activityId]/comando/route";
import { GET as actividadGET } from "./actividad/[activityId]/route";
import { GUEST_COOKIE } from "@/lib/circulos/guest-cookie";
import { TOKEN_NAMES } from "@/lib/cookies";
import { parseCreateDuo, parseIdempotencyKey } from "@/lib/circulos/bff";

const KEY = "3f1c2b8a-5d4e-4a7b-9c2d-6e8f0a1b2c3d";
const TOKEN = "A".repeat(43);

function req(body: unknown): Request {
  return new Request("https://app.test/api/circulos/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  headerStore.origin = "https://app.test";
  headerStore.host = "app.test";
  cookieStore.clear();
  vi.restoreAllMocks();
});

describe("inspection never consumes and never discloses", () => {
  it("calls inspect and only inspect", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ usable: true }));

    const res = await inspeccionPOST(req({ secret: "s3cr3t" }));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/circles/invitations/inspect",
    );
    // The route that spends the invitation must never be reachable from here.
    expect(
      fetchSpy.mock.calls.some(([u]) => String(u).includes("accept")),
    ).toBe(false);
  });

  it("answers a constant, with no activity, participant or cause", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ok({ usable: true, activityId: "act-1", participantId: "p-1" }),
    );

    const res = await inspeccionPOST(req({ secret: "s3cr3t" }));
    const body = await res.json();

    // Even when upstream volunteers more, the answer stays a constant.
    expect(body).toEqual({ usable: true });
    expect(JSON.stringify(body)).not.toContain("act-1");
    expect(JSON.stringify(body)).not.toContain("p-1");
  });

  it("gives the same opaque refusal whatever the upstream status", async () => {
    for (const status of [404, 410, 429, 503]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        ok({ code: "SOMETHING_SPECIFIC" }, status),
      );
      const res = await inspeccionPOST(req({ secret: "s" }));
      expect(await res.json()).toEqual({
        ok: false,
        code: "CIRCLE_INVITATION_UNUSABLE",
      });
      vi.restoreAllMocks();
    }
  });

  it("never echoes the secret back", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(ok({ usable: true }));
    const res = await inspeccionPOST(req({ secret: "SUPER-SECRET-VALUE" }));
    expect(JSON.stringify(await res.json())).not.toContain(
      "SUPER-SECRET-VALUE",
    );
  });

  it("carries no-store, noindex and no-referrer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(ok({ usable: true }));
    const res = await inspeccionPOST(req({ secret: "s" }));
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("refuses a cross-site inspection before touching the secret", async () => {
    headerStore.origin = "https://evil.test";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await inspeccionPOST(req({ secret: "s" }));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("creating a Dúo forwards the invitation token", () => {
  it("sends exactly the three fields CreateDuoDto requires", async () => {
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ circleId: "c1", activityId: "a1" }, 201));

    const res = await duoPOST(
      req({
        payload: {
          templateKey: "t",
          templateVersion: 1,
          invitationToken: TOKEN,
        },
        idempotencyKey: KEY,
      }),
    );

    expect(res.status).toBe(201);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/circles/duo");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      templateKey: "t",
      templateVersion: 1,
      invitationToken: TOKEN,
    });
    // Authority is the cookie, never the token.
    expect(
      new Headers((init as RequestInit).headers).get("Authorization"),
    ).toBe("Bearer member-jwt");
  });

  it("refuses a token that is not 256 bits of base64url", async () => {
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    for (const bad of [
      " ".repeat(43), // 43 characters, zero entropy
      "A".repeat(42),
      "A".repeat(44),
      `${"A".repeat(42)}+`, // base64, not base64url
      `${"A".repeat(42)}/`,
      "",
    ]) {
      const res = await duoPOST(
        req({
          payload: {
            templateKey: "t",
            templateVersion: 1,
            invitationToken: bad,
          },
          idempotencyKey: KEY,
        }),
      );
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a creation with no token at all", async () => {
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await duoPOST(
      req({
        payload: { templateKey: "t", templateVersion: 1 },
        idempotencyKey: KEY,
      }),
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated creation, token or no token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await duoPOST(
      req({
        payload: {
          templateKey: "t",
          templateVersion: 1,
          invitationToken: TOKEN,
        },
        idempotencyKey: KEY,
      }),
    );
    // The token is not identity and authorises nothing on its own.
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a body carrying an extra field", async () => {
    expect(
      parseCreateDuo({
        templateKey: "t",
        templateVersion: 1,
        invitationToken: TOKEN,
        circleId: "c-somebody-elses",
      }),
    ).toBeNull();
  });

  it("never echoes the token back", async () => {
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ok({ circleId: "c1", activityId: "a1" }, 201),
    );
    const res = await duoPOST(
      req({
        payload: {
          templateKey: "t",
          templateVersion: 1,
          invitationToken: TOKEN,
        },
        idempotencyKey: KEY,
      }),
    );
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN);
  });
});

describe("the idempotency key comes from the client and is forwarded", () => {
  it("forwards the caller's key unchanged on a command", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-token");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        ok({ kind: "GUEST", activityId: "act-1", participantId: "p" }),
      )
      .mockResolvedValueOnce(ok({ ok: true }));

    await comandoPOST(
      req({
        kind: "share",
        payload: { mode: "KEEP_PRIVATE" },
        idempotencyKey: KEY,
      }),
      { params: { activityId: "act-1" } },
    );

    const sent = new Headers(
      (fetchSpy.mock.calls[1]![1] as RequestInit).headers,
    );
    // Not a fresh one: the SAME key, so a retry replays instead of conflicting.
    expect(sent.get("Idempotency-Key")).toBe(KEY);
  });

  it("forwards the caller's key unchanged on a creation", async () => {
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ circleId: "c", activityId: "a" }, 201));

    await duoPOST(
      req({
        payload: {
          templateKey: "t",
          templateVersion: 1,
          invitationToken: TOKEN,
        },
        idempotencyKey: KEY,
      }),
    );

    expect(
      new Headers((fetchSpy.mock.calls[0]![1] as RequestInit).headers).get(
        "Idempotency-Key",
      ),
    ).toBe(KEY);
  });

  it("refuses anything that is not a v4 UUID", async () => {
    for (const bad of [
      "not-a-uuid",
      "",
      "3f1c2b8a5d4e4a7b9c2d6e8f0a1b2c3d",
      // v1, not v4 — the version nibble is the point.
      "3f1c2b8a-5d4e-1a7b-9c2d-6e8f0a1b2c3d",
      // variant nibble out of range
      "3f1c2b8a-5d4e-4a7b-1c2d-6e8f0a1b2c3d",
    ]) {
      expect(parseIdempotencyKey(bad), bad).toBeNull();
    }
    expect(parseIdempotencyKey(KEY)).toBe(KEY);
  });

  it("refuses a command with no key rather than minting one", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await comandoPOST(req({ kind: "withdraw", payload: {} }), {
      params: { activityId: "act-1" },
    });
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("a broken guest cookie does not break a member's session", () => {
  it("does not fall back to the member credential when a guest cookie is present", async () => {
    // Both cookies present — a shared device, or a member who once opened an
    // invitation. The guest cookie decides, and when it is invalid the answer
    // is a refusal, NOT a silent promotion to the member's own authority.
    cookieStore.set(GUEST_COOKIE, "stale-guest-token");
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ code: "CIRCLE_GUEST_SESSION_INVALID" }, 401));

    const res = await actividadGET(new Request("https://app.test/x"), {
      params: { activityId: "act-1" },
    });

    expect(res.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // The member token was never sent anywhere.
    const sent = new Headers(
      (fetchSpy.mock.calls[0]![1] as RequestInit).headers,
    );
    expect(sent.get("Authorization")).toBe("Bearer stale-guest-token");
  });

  it("refuses a guest cookie scoped to a different activity", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-token");
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        ok({ kind: "GUEST", activityId: "act-MINE", participantId: "p" }),
      );

    const res = await actividadGET(new Request("https://app.test/x"), {
      params: { activityId: "act-OTHER" },
    });

    expect(res.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("uses the member credential when there is no guest cookie", async () => {
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ activityId: "act-1", status: "PREPARING" }));

    const res = await actividadGET(new Request("https://app.test/x"), {
      params: { activityId: "act-1" },
    });

    expect(res.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0]!;
    // The member route, not the guest one.
    expect(String(url)).toContain("/circles/activities/act-1");
    expect(String(url)).not.toContain("/guest/");
    expect(
      new Headers((init as RequestInit).headers).get("Authorization"),
    ).toBe("Bearer member-jwt");
  });
});
