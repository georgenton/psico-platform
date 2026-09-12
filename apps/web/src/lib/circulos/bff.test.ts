import { describe, expect, it, vi, beforeEach } from "vitest";

const headerStore = { origin: "https://app.test", host: "app.test" };
const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: () => ({ get: (k: string) => headerStore[k as "origin"] ?? null }),
  cookies: () => ({
    get: (k: string) =>
      cookieStore.has(k) ? { value: cookieStore.get(k) } : undefined,
  }),
}));
vi.mock("server-only", () => ({}));

import {
  CIRCULO_COMMANDS,
  guestCommand,
  isCirculoCommand,
  parseShareConfirmation,
  sameOrigin,
} from "./bff";
import { GUEST_COOKIE } from "./guest-cookie";

describe("BFF · the allow-list is closed", () => {
  it("names exactly the five commands the guest flow needs", () => {
    // A literal, so widening it is a diff somebody reviews rather than a
    // behaviour that drifts.
    expect([...CIRCULO_COMMANDS]).toEqual([
      "share",
      "withdraw",
      "artifact",
      "artifact-confirm",
      "follow-up",
    ]);
  });

  it.each([
    "duo",
    "delete",
    "invitations/accept",
    "../../users/me",
    "GET /circles",
    "",
    "SHARE",
  ])("refuses %o as a command", (kind) => {
    expect(isCirculoCommand(kind)).toBe(false);
  });

  it("refuses a non-string command", () => {
    for (const bad of [null, undefined, 1, {}, [], true]) {
      expect(isCirculoCommand(bad)).toBe(false);
    }
  });
});

describe("BFF · a state-changing call must come from our own page", () => {
  beforeEach(() => {
    headerStore.origin = "https://app.test";
    headerStore.host = "app.test";
  });

  it("accepts a same-origin request", () => {
    expect(sameOrigin()).toBe(true);
  });

  it("refuses a cross-site origin", () => {
    headerStore.origin = "https://evil.test";
    expect(sameOrigin()).toBe(false);
  });

  it("refuses a request with no Origin at all", () => {
    // Same-origin `fetch` always sends one, so the only callers turned away
    // here are the ones that are not the page.
    headerStore.origin = undefined as unknown as string;
    expect(sameOrigin()).toBe(false);
  });
});

describe("BFF · a guest command goes exactly where it was told", () => {
  beforeEach(() => {
    cookieStore.clear();
    vi.restoreAllMocks();
  });

  it("forwards to the resolved activity, with the resolved token", async () => {
    // The scope check that used to live here now lives in `resolveActor`, and
    // is exercised in `correcciones.test.ts`. Asking the same question twice
    // per command meant two lookups against a rate-limited endpoint, one of
    // them wasted.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await guestCommand("guest-token", {
      kind: "share",
      activityId: "act-1",
      body: { mode: "KEEP_PRIVATE" },
      idempotencyKey: "key-1",
    });

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      "http://localhost:3001/api/circles/guest/activities/act-1/share-confirmations",
    );
    const sent = new Headers((init as RequestInit).headers);
    expect(sent.get("Authorization")).toBe("Bearer guest-token");
    expect(sent.get("Idempotency-Key")).toBe("key-1");
  });
});

describe("BFF · the browser never says who it is", () => {
  it("forwards no identity field even when the body carries one", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    // `parseShareConfirmation` is what the handler runs first; anything with an
    // extra key is refused outright rather than trimmed and forwarded.
    expect(
      parseShareConfirmation({
        mode: "KEEP_PRIVATE",
        userId: "u-other",
        participantId: "p-other",
      }),
    ).toBeNull();

    await guestCommand("guest-token", {
      kind: "share",
      activityId: "act-1",
      body: { mode: "KEEP_PRIVATE" },
      idempotencyKey: "k",
    });

    const body = String((fetchSpy.mock.calls[0]![1] as RequestInit).body);
    for (const claimed of [
      "userId",
      "participantId",
      "circleId",
      "memberId",
      "role",
    ]) {
      expect(body).not.toContain(claimed);
    }
  });
});

describe("BFF · the one body the browser may compose", () => {
  it("accepts the three modes and nothing else", () => {
    expect(parseShareConfirmation({ mode: "KEEP_PRIVATE" })).toEqual({
      mode: "KEEP_PRIVATE",
    });
    expect(
      parseShareConfirmation({ mode: "EDITED_SUMMARY", summary: "hola" }),
    ).toEqual({ mode: "EDITED_SUMMARY", summary: "hola" });
    expect(
      parseShareConfirmation({
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "a", value: "x" }],
      }),
    ).toEqual({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "a", value: "x" }],
    });

    // WITHDRAW is a separate command, never a confirmation mode.
    expect(parseShareConfirmation({ mode: "WITHDRAW" })).toBeNull();
  });

  it("refuses a KEEP_PRIVATE that smuggles a reason", () => {
    // The contract has no field for why somebody did not share, so a body that
    // invents one is not a stricter refusal — it is a different thing.
    expect(
      parseShareConfirmation({ mode: "KEEP_PRIVATE", reason: "no quiero" }),
    ).toBeNull();
  });

  it("refuses empties, duplicates and over-long values", () => {
    expect(
      parseShareConfirmation({ mode: "EDITED_SUMMARY", summary: "   " }),
    ).toBeNull();
    expect(
      parseShareConfirmation({
        mode: "SELECTED_FIELDS",
        fields: [
          { fieldKey: "a", value: "x" },
          { fieldKey: "a", value: "y" },
        ],
      }),
    ).toBeNull();
    expect(
      parseShareConfirmation({
        mode: "EDITED_SUMMARY",
        summary: "x".repeat(4001),
      }),
    ).toBeNull();
    expect(
      parseShareConfirmation({ mode: "SELECTED_FIELDS", fields: [] }),
    ).toBeNull();
  });
});
