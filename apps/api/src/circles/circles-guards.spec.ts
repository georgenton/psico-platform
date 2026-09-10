import type { ExecutionContext } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CircleGuestSessionRepository } from "./circle-guest-session.repository";
import { CirclesGuestGuard } from "./circles-guest.guard";
import { CirclesGuestSurfaceGuard } from "./circles-guest-surface.guard";
import { CirclesRolloutGuard } from "./circles-rollout.guard";
import { CirclesRolloutService } from "./circles-rollout.service";
import { resolveCirclesRolloutConfig } from "./circles-rollout";
import { hashSecret } from "./circles-secrets";
import type { CircleActorRequest } from "./circles-actor";

/**
 * The two guards, which together are the whole answer to "who is asking".
 *
 * Every negative case asserts the SAME code, not merely "it threw": a guard
 * whose failures are distinguishable is a guard that tells an attacker which
 * of their guesses was closer.
 */

const ctx = (request: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const codeOf = (err: unknown): string => {
  expect(err).toBeInstanceOf(HttpException);
  const body = (err as HttpException).getResponse() as { code?: string };
  return body.code ?? "";
};

const statusOf = (err: unknown): number => (err as HttpException).getStatus();

/**
 * Await a rejection and hand back the error. Written by hand rather than with
 * `rejects.toSatisfy` so the assertions below inspect the code and the status
 * explicitly — "it threw something" is not the property being tested.
 */
const rejectionOf = async (p: Promise<unknown>): Promise<unknown> => {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected a rejection, got a resolution");
};

/** The same for a synchronous guard. */
const throwOf = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected a throw, got a return");
};

const rollout = (mode?: string, allowlist?: string) =>
  new CirclesRolloutService(
    resolveCirclesRolloutConfig({
      CIRCLES_ROLLOUT_MODE: mode,
      CIRCLES_PILOT_USER_IDS: allowlist,
    }),
  );

// ── The authenticated gate ───────────────────────────────────────────────────

describe("CirclesRolloutGuard", () => {
  it("denies when the surface is off, even to a real user", async () => {
    const guard = new CirclesRolloutGuard(rollout("off"));
    const request = { user: { userId: "u1" } } as CircleActorRequest & {
      user: { userId: string };
    };
    const err = throwOf(() => guard.canActivate(ctx(request)));
    expect(codeOf(err)).toBe("CIRCLES_UNAVAILABLE");
    expect(statusOf(err)).toBe(503);
    expect(request.circleActor).toBeUndefined();
  });

  it("denies an unauthenticated request with the same opaque answer", async () => {
    // Not a 401. A request that arrives without the auth guard having run gets
    // exactly what a denied one gets, so "is Círculos enabled" cannot be probed
    // by dropping the token.
    const guard = new CirclesRolloutGuard(rollout("on"));
    const err = throwOf(() => guard.canActivate(ctx({})));
    expect(codeOf(err)).toBe("CIRCLES_UNAVAILABLE");
  });

  it("gives the same answer to an off surface and a non-pilot user", () => {
    const off = new CirclesRolloutGuard(rollout("off"));
    const pilot = new CirclesRolloutGuard(rollout("pilot", "someone_else"));
    const request = () =>
      ({ user: { userId: "u1" } }) as CircleActorRequest & {
        user: { userId: string };
      };

    const describeThrow = (guard: CirclesRolloutGuard) => {
      const err = throwOf(() => guard.canActivate(ctx(request())));
      return { code: codeOf(err), status: statusOf(err) };
    };
    expect(describeThrow(off)).toEqual(describeThrow(pilot));
  });

  it("builds the USER actor from the verified subject", () => {
    const guard = new CirclesRolloutGuard(rollout("pilot", "u1"));
    const request = {
      user: { userId: "u1" },
      // A body claiming to be somebody else. Nothing reads it.
      body: { userId: "u2", role: "ORGANIZER", participantId: "p9" },
    } as unknown as CircleActorRequest;

    expect(guard.canActivate(ctx(request))).toBe(true);
    expect(request.circleActor).toEqual({ kind: "USER", userId: "u1" });
  });
});

// ── The pre-session gate ─────────────────────────────────────────────────────

describe("CirclesGuestSurfaceGuard", () => {
  it("refuses under off", () => {
    const guard = new CirclesGuestSurfaceGuard(rollout("off"));
    const err = throwOf(() => guard.canActivate());
    expect(codeOf(err)).toBe("CIRCLES_UNAVAILABLE");
  });

  it("allows under pilot and on", () => {
    expect(
      new CirclesGuestSurfaceGuard(rollout("pilot", "u1")).canActivate(),
    ).toBe(true);
    expect(new CirclesGuestSurfaceGuard(rollout("on")).canActivate()).toBe(
      true,
    );
  });
});

// ── The guest gate ───────────────────────────────────────────────────────────

describe("CirclesGuestGuard", () => {
  const RAW = "a-guest-session-secret";
  const live = () => ({
    id: "gs1",
    activityId: "act1",
    participantId: "p1",
    tokenHash: hashSecret(RAW),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null as Date | null,
  });

  let repo: {
    findByTokenHash: ReturnType<typeof vi.fn>;
    touch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repo = {
      findByTokenHash: vi.fn(),
      touch: vi.fn().mockResolvedValue(void 0),
    };
  });

  const guardWith = (mode = "on") =>
    new CirclesGuestGuard(
      repo as unknown as CircleGuestSessionRepository,
      rollout(mode),
    );

  const requestWith = (headers: Record<string, unknown>, body?: unknown) =>
    ({ headers, body }) as unknown as CircleActorRequest;

  it("refuses under off WITHOUT touching the secret", async () => {
    const guard = guardWith("off");
    const err = await rejectionOf(
      guard.canActivate(ctx(requestWith({ [CirclesGuestGuard.HEADER]: RAW }))),
    );
    expect(codeOf(err)).toBe("CIRCLES_UNAVAILABLE");
    // The lookup never happened: a closed surface does not query on a guest's
    // behalf, so it cannot be used as a timing oracle either.
    expect(repo.findByTokenHash).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing header", {}],
    ["an empty header", { [CirclesGuestGuard.HEADER]: "" }],
    ["a repeated header", { [CirclesGuestGuard.HEADER]: ["a", "b"] }],
    ["an oversized value", { [CirclesGuestGuard.HEADER]: "x".repeat(513) }],
  ])("rejects %s with the one guest answer", async (_label, headers) => {
    repo.findByTokenHash.mockResolvedValue(null);
    const err = await rejectionOf(
      guardWith().canActivate(ctx(requestWith(headers))),
    );
    expect(codeOf(err)).toBe("CIRCLE_GUEST_SESSION_INVALID");
    expect(statusOf(err)).toBe(401);
  });

  it.each([
    ["unknown", () => null],
    ["expired", () => ({ ...live(), expiresAt: new Date(Date.now() - 1) })],
    ["revoked", () => ({ ...live(), revokedAt: new Date(Date.now() - 1) })],
  ])("rejects a %s session with the identical answer", async (_l, row) => {
    repo.findByTokenHash.mockResolvedValue(row());
    const request = requestWith({ [CirclesGuestGuard.HEADER]: RAW });
    const err = await rejectionOf(guardWith().canActivate(ctx(request)));
    expect(codeOf(err)).toBe("CIRCLE_GUEST_SESSION_INVALID");
    expect(statusOf(err)).toBe(401);
    expect(request.circleActor).toBeUndefined();
  });

  it("revocation takes effect on the very next request", async () => {
    // No cache, no signed scope: the row is read every time, so the window
    // between revoking and the revocation biting is one request, not one TTL.
    const guard = guardWith();
    const request = () => requestWith({ [CirclesGuestGuard.HEADER]: RAW });

    repo.findByTokenHash.mockResolvedValueOnce(live());
    const first = request();
    await expect(guard.canActivate(ctx(first))).resolves.toBe(true);
    expect(first.circleActor).toBeDefined();

    repo.findByTokenHash.mockResolvedValueOnce({
      ...live(),
      revokedAt: new Date(),
    });
    const second = request();
    const err = await rejectionOf(guard.canActivate(ctx(second)));
    expect(codeOf(err)).toBe("CIRCLE_GUEST_SESSION_INVALID");
    expect(second.circleActor).toBeUndefined();
  });

  it("builds the actor from the ROW and ignores anything the client sent", async () => {
    repo.findByTokenHash.mockResolvedValue(live());
    const request = requestWith(
      { [CirclesGuestGuard.HEADER]: RAW },
      // A body asserting a different activity, a different seat and a role.
      {
        activityId: "act-somebody-elses",
        participantId: "p-999",
        role: "ADMIN",
      },
    );

    await expect(guardWith().canActivate(ctx(request))).resolves.toBe(true);
    expect(request.circleActor).toEqual({
      kind: "GUEST",
      guestSessionId: "gs1",
      activityId: "act1",
      participantId: "p1",
    });
  });

  it("hashes what it was given rather than trusting a hash from the client", async () => {
    repo.findByTokenHash.mockResolvedValue(null);
    await guardWith()
      .canActivate(ctx(requestWith({ [CirclesGuestGuard.HEADER]: RAW })))
      .catch(() => undefined);
    expect(repo.findByTokenHash).toHaveBeenCalledWith(hashSecret(RAW));
    // And a caller presenting the HASH itself gets nowhere: it would be hashed
    // again, so knowing the stored value is not the same as holding the secret.
    expect(hashSecret(hashSecret(RAW))).not.toBe(hashSecret(RAW));
  });

  it("still authorizes when marking liveness fails", async () => {
    // A failure to record that somebody was seen must never become a failure
    // to let them in — and the reverse must not happen either.
    repo.findByTokenHash.mockResolvedValue(live());
    repo.touch.mockRejectedValue(new Error("nope"));
    const request = requestWith({ [CirclesGuestGuard.HEADER]: RAW });
    await expect(guardWith().canActivate(ctx(request))).resolves.toBe(true);
  });
});
