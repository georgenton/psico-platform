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

// A v4 UUID standing in for the key the browser mints per intention.
// Named for what it is rather than `INTENCION`: an idempotency key is not a
// credential, but `INTENCION = "<uuid>"` is indistinguishable from one to a
// secret scanner, and a scanner that cries wolf gets ignored.
const INTENCION = "3f1c2b8a-5d4e-4a7b-9c2d-6e8f0a1b2c3d";
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
        idempotencyKey: INTENCION,
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
          idempotencyKey: INTENCION,
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
        idempotencyKey: INTENCION,
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
        idempotencyKey: INTENCION,
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
        idempotencyKey: INTENCION,
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
      // The resolver's scope read, then the command itself.
      .mockResolvedValueOnce(
        ok({ kind: "GUEST", activityId: "act-1", participantId: "p" }),
      )
      .mockResolvedValueOnce(ok({ ok: true }));

    await comandoPOST(
      req({
        kind: "share",
        payload: { mode: "KEEP_PRIVATE" },
        idempotencyKey: INTENCION,
      }),
      { params: { activityId: "act-1" } },
    );

    const sent = new Headers(
      (fetchSpy.mock.calls[1]![1] as RequestInit).headers,
    );
    // Not a fresh one: the SAME key, so a retry replays instead of conflicting.
    expect(sent.get("Idempotency-Key")).toBe(INTENCION);
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
        idempotencyKey: INTENCION,
      }),
    );

    expect(
      new Headers((fetchSpy.mock.calls[0]![1] as RequestInit).headers).get(
        "Idempotency-Key",
      ),
    ).toBe(INTENCION);
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
    expect(parseIdempotencyKey(INTENCION)).toBe(INTENCION);
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
  it("lets an authorised member through even with a stale guest cookie", async () => {
    // The bug this replaces: ANY guest cookie won unconditionally, so a member
    // who had once opened an invitation on this browser — or who shares a
    // device — was locked out of their own activity by a dead cookie they had
    // no way to see or clear.
    cookieStore.set(GUEST_COOKIE, "stale-guest-token");
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ activityId: "act-1", status: "PREPARING" }));

    const res = await actividadGET(new Request("https://app.test/x"), {
      params: { activityId: "act-1" },
    });

    expect(res.status).toBe(200);
    // The member was tried FIRST and succeeded, so the guest session was never
    // even consulted.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/circles/activities/act-1");
    expect(String(url)).not.toContain("/guest/");
    expect(
      new Headers((init as RequestInit).headers).get("Authorization"),
    ).toBe("Bearer member-jwt");
  });

  it("lets a member through when the guest cookie names another activity", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-for-somebody-else");
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ activityId: "act-1", status: "PREPARING" }));

    const res = await actividadGET(new Request("https://app.test/x"), {
      params: { activityId: "act-1" },
    });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("prefers the member when BOTH credentials would authorise", async () => {
    cookieStore.set(GUEST_COOKIE, "valid-guest-token");
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ activityId: "act-1", status: "PREPARING" }));

    await actividadGET(new Request("https://app.test/x"), {
      params: { activityId: "act-1" },
    });

    // The account is the stronger claim: it survives the cookie expiring and
    // it is the identity the person manages.
    const sent = new Headers(
      (fetchSpy.mock.calls[0]![1] as RequestInit).headers,
    );
    expect(sent.get("Authorization")).toBe("Bearer member-jwt");
  });

  it("lets a signed-in NON-member use a valid guest session", async () => {
    // Somebody with an account who was invited as a guest. An ordinary case,
    // not an edge one.
    cookieStore.set(GUEST_COOKIE, "valid-guest-token");
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // Member read: a definite no.
      .mockResolvedValueOnce(ok({ code: "CIRCLE_FORBIDDEN" }, 403))
      // Guest scope: valid, and for this activity.
      .mockResolvedValueOnce(
        ok({ kind: "GUEST", activityId: "act-1", participantId: "p" }),
      )
      .mockResolvedValueOnce(ok({ activityId: "act-1", status: "PREPARING" }));

    const res = await actividadGET(new Request("https://app.test/x"), {
      params: { activityId: "act-1" },
    });

    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[2]![0])).toContain(
      "/circles/guest/activities/act-1",
    );
  });

  it("refuses a guest cookie scoped to a different activity", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-token");

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
    const [url] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/circles/activities/act-1");
    expect(String(url)).not.toContain("/guest/");
  });
});

describe("a transient failure is not a signal to change actor", () => {
  it.each([429, 500, 502, 503])(
    "does not fall through to guest on %i",
    async (status) => {
      cookieStore.set(GUEST_COOKIE, "valid-guest-token");
      cookieStore.set(TOKEN_NAMES.access, "member-jwt");

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(ok({ code: "RATE_LIMITED" }, status));

      const res = await actividadGET(new Request("https://app.test/x"), {
        params: { activityId: "act-1" },
      });

      // "We do not know" must never be read as "not a member". A rate-limited
      // member silently demoted to the guest path would act as the wrong
      // person on a request that would have succeeded a second later.
      expect(res.status).toBe(status);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
  );

  it("does not fall through when the guest scope lookup is transient", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-token");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ code: "RATE_LIMITED" }, 429));

    const res = await actividadGET(new Request("https://app.test/x"), {
      params: { activityId: "act-1" },
    });

    expect(res.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("the browser never selects its own actor", () => {
  it("ignores an actorKind the caller tries to assert", async () => {
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ activityId: "act-1", status: "PREPARING" }));

    // The route reads nothing from the request but the path. There is no
    // parameter, header or body field that selects a credential.
    const res = await actividadGET(
      new Request("https://app.test/x?actorKind=GUEST&userId=somebody-else"),
      { params: { activityId: "act-1" } },
    );

    expect(res.status).toBe(200);
    const sent = new Headers(
      (fetchSpy.mock.calls[0]![1] as RequestInit).headers,
    );
    expect(sent.get("Authorization")).toBe("Bearer member-jwt");
    expect(String(fetchSpy.mock.calls[0]![0])).not.toContain("somebody-else");
  });

  it("carries no actor selector in the resolver's own source", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../../../lib/circulos/actor.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const forbidden of [
      "actorKind",
      "searchParams",
      "req.body",
      'headers.get("x-actor',
    ]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });
});

describe("every command shape is closed, not merely trimmed", () => {
  const params = { params: { activityId: "act-1" } };

  beforeEach(() => cookieStore.set(GUEST_COOKIE, "guest-token"));

  it("refuses a wrapper carrying an unexpected key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const extra of [
      { userId: "u-1" },
      { role: "ADMIN" },
      { circleId: "c-1" },
      { participantId: "p-1" },
      { actorKind: "USER" },
    ]) {
      const res = await comandoPOST(
        req({
          kind: "withdraw",
          payload: {},
          idempotencyKey: INTENCION,
          ...extra,
        }),
        params,
      );
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    // Silently dropping them would let a caller send them for a long time with
    // nothing saying no — and the day one started being read would be the day
    // it mattered.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["withdraw", { reason: "me sentí mal" }],
    ["artifact", { body: "ok", userId: "u-1" }],
    ["artifact-confirm", { artifactId: "a", version: 1, role: "ADMIN" }],
    ["follow-up", { decision: "KEEP", circleId: "c-1" }],
  ])("refuses an extra key inside a %s payload", async (kind, payload) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await comandoPOST(
      req({ kind, payload, idempotencyKey: INTENCION }),
      params,
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still accepts each command's exact shape", async () => {
    for (const [kind, payload] of [
      ["withdraw", {}],
      ["artifact", { body: "nuestro acuerdo" }],
      ["artifact-confirm", { artifactId: "a", version: 1 }],
      ["follow-up", { decision: "KEEP" }],
      ["share", { mode: "KEEP_PRIVATE" }],
    ] as const) {
      vi.restoreAllMocks();
      cookieStore.set(GUEST_COOKIE, "guest-token");
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          ok({ kind: "GUEST", activityId: "act-1", participantId: "p" }),
        )
        .mockResolvedValueOnce(ok({ ok: true }));

      const res = await comandoPOST(
        req({ kind, payload, idempotencyKey: INTENCION }),
        params,
      );
      expect(res.status, kind).toBe(200);
    }
  });

  it("refuses an extra key in the creation wrapper", async () => {
    cookieStore.clear();
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await duoPOST(
      req({
        payload: {
          templateKey: "t",
          templateVersion: 1,
          invitationToken: TOKEN,
        },
        idempotencyKey: INTENCION,
        circleId: "c-somebody-elses",
      }),
    );

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
