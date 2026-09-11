import { describe, expect, it, vi, beforeEach } from "vitest";

const headerStore: Record<string, string | undefined> = {
  origin: "https://app.test",
  host: "app.test",
};
const cookieStore = new Map<string, string>();
const deleted: string[] = [];

vi.mock("next/headers", () => ({
  headers: () => ({ get: (k: string) => headerStore[k] ?? null }),
  cookies: () => ({
    get: (k: string) =>
      cookieStore.has(k) ? { value: cookieStore.get(k) } : undefined,
    delete: (k: string) => {
      deleted.push(k);
      cookieStore.delete(k);
    },
  }),
}));
vi.mock("server-only", () => ({}));

import { POST as sesionPOST, DELETE as sesionDELETE } from "./sesion/route";
import { POST as comandoPOST } from "./actividad/[activityId]/comando/route";
import { GUEST_COOKIE } from "@/lib/circulos/guest-cookie";

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
  deleted.length = 0;
  vi.restoreAllMocks();
});

describe("the exchange hands the browser a cookie, never a token", () => {
  it("sets an HttpOnly cookie and returns no token in the body", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ usable: true }))
      .mockResolvedValueOnce(
        ok(
          {
            guestSessionToken: "RAW-GUEST-TOKEN",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
          201,
        ),
      );

    const res = await sesionPOST(req({ secret: "s3cr3t" }));
    expect(res.status).toBe(201);

    const payload = await res.clone().json();
    expect(JSON.stringify(payload)).not.toContain("RAW-GUEST-TOKEN");
    expect(payload).toEqual({ ok: true });

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${GUEST_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("inspects before it accepts, so a scanner does not spend the link", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ usable: true }))
      .mockResolvedValueOnce(
        ok(
          {
            guestSessionToken: "t",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
          201,
        ),
      );

    await sesionPOST(req({ secret: "s3cr3t" }));

    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/circles/invitations/inspect",
    );
    expect(String(fetchSpy.mock.calls[1]![0])).toContain(
      "/circles/invitations/accept",
    );
  });

  it("refuses an already-expired session rather than setting a dead cookie", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ usable: true }))
      .mockResolvedValueOnce(
        ok(
          {
            guestSessionToken: "t",
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
          201,
        ),
      );

    const res = await sesionPOST(req({ secret: "s" }));
    expect(res.status).toBe(404);
  });

  it("refuses a cross-site POST before touching the secret", async () => {
    headerStore.origin = "https://evil.test";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await sesionPOST(req({ secret: "s3cr3t" }));

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clears the cookie on leave", async () => {
    const res = await sesionDELETE();
    expect(res.status).toBe(200);
    expect(deleted).toContain(GUEST_COOKIE);
    expect(res.headers.get("set-cookie") ?? "").toMatch(/Max-Age=0/i);
  });
});

describe("the command handler forwards only what is on the list", () => {
  const params = { params: { activityId: "act-1" } };

  it.each(["duo", "invitations/accept", "../../../users/me", "read", "delete"])(
    "refuses %o without calling upstream",
    async (kind) => {
      cookieStore.set(GUEST_COOKIE, "guest-token");
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const res = await comandoPOST(req({ kind, payload: {} }), params);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        ok: false,
        code: "CIRCLE_INVALID_PAYLOAD",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("refuses a cross-site command", async () => {
    headerStore.origin = "https://evil.test";
    cookieStore.set(GUEST_COOKIE, "guest-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await comandoPOST(
      req({ kind: "withdraw", payload: {} }),
      params,
    );

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a malformed share instead of relaying it under our cookie", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await comandoPOST(
      req({ kind: "share", payload: { mode: "KEEP_PRIVATE", reason: "x" } }),
      params,
    );

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a follow-up decision outside the three words", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-token");
    const res = await comandoPOST(
      req({ kind: "follow-up", payload: { decision: "MAYBE" } }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it("sends no reason with a withdrawal", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-token");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        ok({ kind: "GUEST", activityId: "act-1", participantId: "p" }),
      )
      .mockResolvedValueOnce(ok({ ok: true }));

    await comandoPOST(
      req({ kind: "withdraw", payload: { reason: "me sentí mal" } }),
      params,
    );

    const body = String((fetchSpy.mock.calls[1]![1] as RequestInit).body);
    expect(body).toBe("{}");
    expect(body).not.toContain("me sentí mal");
  });

  it("refuses a command aimed at another activity", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-token");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        ok({ kind: "GUEST", activityId: "act-MINE", participantId: "p" }),
      );

    const res = await comandoPOST(req({ kind: "withdraw", payload: {} }), {
      params: { activityId: "act-OTHER" },
    });

    expect(res.status).toBe(403);
    // Only the scope lookup happened; the command was never forwarded.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
