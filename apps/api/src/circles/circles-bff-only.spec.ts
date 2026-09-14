import type { ExecutionContext } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CirclesBffOnlyGuard } from "./circles-bff-only.guard";
import {
  CLIENT_ATTESTATION_HEADER,
  mintClientAttestation,
} from "../shared/throttler/client-attestation";

/**
 * The invitation routes belong to the Web.
 *
 * Every refusal asserts the SAME code. A guard whose failures are
 * distinguishable tells a prober whether they had the grammar right, the key
 * right, or merely the clock wrong — which is three quarters of a forgery.
 */

const ctx = (headers: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

const codeOf = (err: unknown): string => {
  expect(err).toBeInstanceOf(HttpException);
  const body = (err as HttpException).getResponse() as { code?: string };
  return body.code ?? "";
};

const SECRET = "the-two-servers-share-this";
const CLIENT = "aaaaaaaaaaaaaaaaaaaaaa";

let guard: CirclesBffOnlyGuard;
const original = process.env.CLIENT_ATTESTATION_SECRET;

beforeEach(() => {
  guard = new CirclesBffOnlyGuard();
  process.env.CLIENT_ATTESTATION_SECRET = SECRET;
});
afterEach(() => {
  if (original === undefined) delete process.env.CLIENT_ATTESTATION_SECRET;
  else process.env.CLIENT_ATTESTATION_SECRET = original;
});

describe("only the Web may ask about an invitation", () => {
  it("lets the Web's own signed request through", () => {
    const header = mintClientAttestation(CLIENT, SECRET);
    expect(
      guard.canActivate(ctx({ [CLIENT_ATTESTATION_HEADER]: header })),
    ).toBe(true);
  });

  it("refuses a request with no attestation at all", () => {
    let thrown: unknown;
    try {
      guard.canActivate(ctx({}));
    } catch (err) {
      thrown = err;
    }
    expect(codeOf(thrown)).toBe("CIRCLE_FORBIDDEN");
  });

  it("refuses a forged one with the same answer", () => {
    const forged = mintClientAttestation(CLIENT, "not-the-shared-secret");
    let thrown: unknown;
    try {
      guard.canActivate(ctx({ [CLIENT_ATTESTATION_HEADER]: forged }));
    } catch (err) {
      thrown = err;
    }
    expect(codeOf(thrown)).toBe("CIRCLE_FORBIDDEN");
  });

  it("refuses an expired one with the same answer", () => {
    // Minted two minutes ago; the TTL is one.
    const stale = mintClientAttestation(CLIENT, SECRET, Date.now() - 120_000);
    let thrown: unknown;
    try {
      guard.canActivate(ctx({ [CLIENT_ATTESTATION_HEADER]: stale }));
    } catch (err) {
      thrown = err;
    }
    expect(codeOf(thrown)).toBe("CIRCLE_FORBIDDEN");
  });

  it("refuses a malformed one with the same answer", () => {
    let thrown: unknown;
    try {
      guard.canActivate(ctx({ [CLIENT_ATTESTATION_HEADER]: "not-a-header" }));
    } catch (err) {
      thrown = err;
    }
    expect(codeOf(thrown)).toBe("CIRCLE_FORBIDDEN");
  });
});

describe("a deployment that cannot verify does not require", () => {
  it("allows everything when no secret is configured", () => {
    // Otherwise a missing environment variable becomes a silent outage of the
    // entire guest surface, with nothing a caller could send to satisfy it.
    delete process.env.CLIENT_ATTESTATION_SECRET;
    expect(guard.canActivate(ctx({}))).toBe(true);
  });

  it("and is not opened by anything the caller sends", () => {
    // The only value that opens this door is server-side. A caller cannot
    // unset it, and while it is set no header substitutes for the signature.
    process.env.CLIENT_ATTESTATION_SECRET = SECRET;
    for (const header of [
      "x-forwarded-for",
      "x-real-ip",
      "x-client-attestation-bypass",
      "authorization",
    ]) {
      let thrown: unknown;
      try {
        guard.canActivate(ctx({ [header]: "203.0.113.7" }));
      } catch (err) {
        thrown = err;
      }
      expect(codeOf(thrown)).toBe("CIRCLE_FORBIDDEN");
    }
  });
});
