import { HttpException, HttpStatus } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth";
import { GuideController } from "./guide.controller";
import { GUIDE_DISCOVERY_PARAMS_INVALID } from "./guide-discovery-params";
import { GuideLifecycleError } from "./guide-errors";

/**
 * GR-4 — the discovery route's HTTP translation.
 *
 * Three outcomes must stay distinguishable at the boundary, because the client
 * acts differently on each:
 *
 *   - a syntactically impossible parameter → 400 with the parser's own code;
 *   - a real answer (positive or negative) → 200 with the closed union;
 *   - an infrastructure failure → a SANITIZED 5xx, so the caller retries
 *     instead of caching a negative the server never asserted.
 *
 * What never appears in any of them: the slug, the order, an internal id, or
 * an upstream Prisma/driver message.
 */

const USER: AuthenticatedUser = {
  userId: "u-1",
  email: "reader@example.test",
  plan: "FREE",
  role: "USER",
};

/** Values that must never surface in an error, whatever went wrong. */
const NEVER_ON_THE_WIRE = [
  "parejas-que-perduran",
  "pqp-c1-contacto-sostenido",
  "unit-1",
  "ed-1",
  "rev-1",
  "prisma",
  "Prisma",
  "SELECT",
  USER.userId,
  USER.email,
];

function makeController(discover: () => Promise<unknown>) {
  const discovery = { discover: vi.fn(discover) };
  const controller = new GuideController(
    {} as never,
    { isAvailable: vi.fn(() => true) } as never,
    discovery as never,
  );
  return { controller, discovery };
}

/** Run and return whatever was thrown; fails loudly if nothing was. */
async function capture(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected the call to throw, but it resolved");
}

/** Everything the client could read off the failure. */
function wireOf(err: unknown): string {
  if (!(err instanceof HttpException)) return String(err);
  return JSON.stringify({
    status: err.getStatus(),
    body: err.getResponse(),
    message: err.message,
  });
}

describe("GuideController · discovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the parsed context through and returns the service's answer", async () => {
    const { controller, discovery } = makeController(async () => ({
      available: true,
      guideKey: "pqp-c1-contacto-sostenido",
      guideVersion: 1,
    }));

    const res = await controller.getGuideDiscovery(
      USER,
      "parejas-que-perduran",
      "2",
    );

    expect(res).toEqual({
      available: true,
      guideKey: "pqp-c1-contacto-sostenido",
      guideVersion: 1,
    });
    // The actor travels as the authenticated object, never restated field by
    // field, and the context is the PARSED pair (order as a number).
    expect(discovery.discover).toHaveBeenCalledWith(USER, {
      bookSlug: "parejas-que-perduran",
      chapterOrder: 2,
    });
  });

  it("returns the negative arm untouched — a false is a real answer", async () => {
    const { controller } = makeController(async () => ({ available: false }));
    await expect(
      controller.getGuideDiscovery(USER, "parejas-que-perduran", "1"),
    ).resolves.toEqual({ available: false });
  });

  it.each([
    ["order zero", "un-libro", "0"],
    ["a fractional order", "un-libro", "1.5"],
    ["a non-numeric order", "un-libro", "abc"],
    ["a slug with spaces", "con espacios", "1"],
  ])(
    "rejects %s with a 400 and never calls the service",
    async (_why, slug, order) => {
      const { controller, discovery } = makeController(async () => ({
        available: false,
      }));

      const err = await capture(() =>
        controller.getGuideDiscovery(USER, slug, order),
      );
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((err as HttpException).getResponse()).toEqual({
        code: GUIDE_DISCOVERY_PARAMS_INVALID,
        message: GUIDE_DISCOVERY_PARAMS_INVALID,
      });
      // A 400 is NOT the same claim as `available:false`, so the read never
      // happens: the caller asked something that is not a place to stand.
      expect(discovery.discover).not.toHaveBeenCalled();
    },
  );

  it("turns a storage failure into a sanitized 500, not a false", async () => {
    const { controller } = makeController(async () => {
      throw new GuideLifecycleError("GUIDE_STORAGE_FAILURE");
    });

    const err = await capture(() =>
      controller.getGuideDiscovery(USER, "parejas-que-perduran", "2"),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect((err as HttpException).getResponse()).toEqual({
      code: "GUIDE_STORAGE_FAILURE",
      message: "GUIDE_STORAGE_FAILURE",
    });
  });

  it("never leaks a value or a driver message on any failure", async () => {
    const failures: unknown[] = [
      new GuideLifecycleError("GUIDE_STORAGE_FAILURE"),
      // Not a lifecycle error: re-thrown untouched for the global filter, which
      // answers the generic 500. Either way the CLIENT sees no value.
      new Error(
        "Invalid `prisma.contentUnit.findUnique()` invocation: unit-1 in ed-1",
      ),
    ];

    for (const failure of failures) {
      const { controller } = makeController(async () => {
        throw failure;
      });
      const e = await capture(() =>
        controller.getGuideDiscovery(USER, "parejas-que-perduran", "2"),
      );

      if (e instanceof HttpException) {
        const wire = wireOf(e);
        for (const value of NEVER_ON_THE_WIRE) {
          expect(wire, `${value} on the wire`).not.toContain(value);
        }
      } else {
        // A non-HttpException is re-thrown untouched and the global filter
        // answers the generic 500, replacing the message wholesale — the raw
        // text never reaches the client. What matters here is that it was NOT
        // dressed up as an editorial verdict on the way out.
        expect(e).toBeInstanceOf(Error);
        expect(e).not.toBeInstanceOf(HttpException);
      }
    }
  });
});
