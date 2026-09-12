import { describe, expect, it, vi, beforeEach } from "vitest";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (k: string) =>
      ({ origin: "https://app.test", host: "app.test" })[k] ?? null,
  }),
  cookies: () => ({
    get: (k: string) =>
      cookieStore.has(k) ? { value: cookieStore.get(k) } : undefined,
    delete: (k: string) => cookieStore.delete(k),
  }),
}));
vi.mock("server-only", () => ({}));

// The room itself is a client component with polling and timers. What is under
// test here is the SERVER render's decision, so the child is replaced by a
// stand-in and the page's returned ELEMENT is inspected — JSX builds an
// element, it does not call the component, so the props are read off the
// element rather than from a call.
// `vi.hoisted` because `vi.mock` factories are hoisted above every const in
// the file — referencing a plain one from inside the factory throws at collect
// time and the whole suite silently reports "no tests".
const { SalaDuoStub } = vi.hoisted(() => ({ SalaDuoStub: () => null }));
vi.mock("@/components/circulos/SalaDuo", () => ({ SalaDuo: SalaDuoStub }));

import SalaPage from "./[activityId]/page";
import { GUEST_COOKIE } from "@/lib/circulos/guest-cookie";
import { TOKEN_NAMES } from "@/lib/cookies";

const VIEW = {
  activityId: "act-1",
  status: "PREPARING",
  templateKey: "fixture-duo",
  templateVersion: 1,
  title: "Una conversación",
  summary: "resumen",
  conversationTurns: [],
  outcomeKind: "AGREEMENT",
  requiredParticipants: 2,
  readyCount: 0,
  revealedAt: null,
  followUpDueAt: null,
  you: {
    status: "ACCEPTED",
    sharingMode: null,
    confirmed: null,
    followUpDecision: null,
  },
  counterpart: { status: "ACCEPTED" },
  revealed: null,
  artifact: null,
};

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The props the page handed to `SalaDuo`, or null when it refused. */
async function renderRoom(activityId = "act-1") {
  const out = (await SalaPage({ params: { activityId } })) as unknown as {
    type?: unknown;
    props?: Record<string, unknown>;
  };
  return out?.type === SalaDuoStub ? (out.props ?? null) : null;
}

beforeEach(() => {
  cookieStore.clear();
  vi.restoreAllMocks();
});

/**
 * The FIRST render is where this mattered most.
 *
 * The page carried its own copy of the authority rule, and the copy was the old
 * wrong one: guest cookie first, refuse if it is dead or foreign, never try the
 * member. So a member with a stale cookie hit the refusal screen on their own
 * activity — the polling read would have let them in, but they never saw the
 * room long enough to poll.
 */

describe("a broken guest cookie does not block the member on the first render", () => {
  it("renders the member's view when the guest cookie is stale", async () => {
    cookieStore.set(GUEST_COOKIE, "stale-guest-token");
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok(VIEW));

    const props = await renderRoom();

    expect(
      props,
      "the room was rendered, not the refusal screen",
    ).not.toBeNull();
    expect(props!.initialView).toEqual(VIEW);
    expect(props!.initialError).toBeNull();
    expect(props!.isGuest).toBe(false);
    // The member was tried first and succeeded, so the dead cookie was never
    // even consulted.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/circles/activities/act-1",
    );
  });

  it("renders the member's view when the guest cookie names another activity", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-for-somebody-else");
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok(VIEW));

    const props = await renderRoom();

    expect(props).not.toBeNull();
    expect(props!.initialView).toEqual(VIEW);
    expect(props!.isGuest).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("when both credentials authorise, the member wins", () => {
  it("never consults the guest scope", async () => {
    cookieStore.set(GUEST_COOKIE, "perfectly-valid-guest-token");
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok(VIEW));

    const props = await renderRoom();

    expect(props!.isGuest).toBe(false);
    expect(
      fetchSpy.mock.calls.some(([u]) => String(u).includes("/guest/session")),
      "the guest scope was consulted even though the member authorised",
    ).toBe(false);
    const sent = new Headers(
      (fetchSpy.mock.calls[0]![1] as RequestInit).headers,
    );
    expect(sent.get("Authorization")).toBe("Bearer member-jwt");
  });
});

describe("a signed-in non-member can still be a guest", () => {
  it("renders as guest when the account is not authorised here", async () => {
    cookieStore.set(GUEST_COOKIE, "valid-guest-token");
    cookieStore.set(TOKEN_NAMES.access, "member-jwt");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // Member read: a definite no.
      .mockResolvedValueOnce(ok({ code: "CIRCLE_FORBIDDEN" }, 403))
      // Guest scope: valid, and for exactly this activity.
      .mockResolvedValueOnce(
        ok({ kind: "GUEST", activityId: "act-1", participantId: "p" }),
      )
      .mockResolvedValueOnce(ok(VIEW));

    const props = await renderRoom();

    expect(props).not.toBeNull();
    expect(props!.isGuest).toBe(true);
    expect(props!.initialView).toEqual(VIEW);
    expect(String(fetchSpy.mock.calls[2]![0])).toContain(
      "/circles/guest/activities/act-1",
    );
  });
});

describe("a transient failure is not a demotion", () => {
  it.each([429, 500, 502, 503])(
    "does not fall through to guest on %i",
    async (status) => {
      cookieStore.set(GUEST_COOKIE, "valid-guest-token");
      cookieStore.set(TOKEN_NAMES.access, "member-jwt");

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(ok({ code: "RATE_LIMITED" }, status));

      const props = await renderRoom();

      // "We do not know" is never read as "not a member". Rendering the room as
      // a guest here would act as the wrong person on a request that would have
      // succeeded a second later.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      if (props) {
        expect(props.isGuest).toBe(false);
        expect(props.initialView).toBeNull();
      }
    },
  );
});

describe("a guest whose session names another activity is refused", () => {
  it("shows the opaque screen rather than another person's room", async () => {
    cookieStore.set(GUEST_COOKIE, "guest-token");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ok({ kind: "GUEST", activityId: "act-MINE", participantId: "p" }),
    );

    const props = await renderRoom("act-OTHER");
    // The refusal screen, not the room.
    expect(props).toBeNull();
  });
});

describe("the page holds no second copy of the authority rule", () => {
  it("reads no cookie and calls no per-actor fetcher of its own", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "[activityId]/page.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    // Two implementations of one authority rule is one implementation and one
    // liability — and the copy here was the stale one.
    for (const forbidden of [
      "GUEST_COOKIE",
      "guestScope",
      "readActivityAsGuest",
      "readActivityAsMember",
      "getAccessToken",
      "cookies()",
    ]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
    expect(src).toContain("resolveActor");
    expect(src).toContain("readActivityAs");
  });
});
