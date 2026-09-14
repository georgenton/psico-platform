import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";

import {
  CLIENT_ATTESTATION_HEADER,
  mintClientAttestation,
  verifyClientAttestation,
} from "./client-attestation";
import { AttestedClientThrottlerGuard } from "./attested-client-throttler.guard";

/**
 * The rate limit behind the BFF.
 *
 * The property under test is NOT "a limit exists" — one already did. It is that
 * two different visitors arriving through the same proxy get different buckets,
 * and that nobody can choose which bucket they land in.
 */

const SECRET = "test-attestation-secret-value";

/** A guard with the protected members reachable, which is all a test needs. */
class TestGuard extends AttestedClientThrottlerGuard {
  tracker(req: Record<string, unknown>) {
    return this.getTracker(req);
  }
  request(props: unknown) {
    return this.handleRequest(props as never);
  }
}

function guard(): TestGuard {
  return new TestGuard({ throttlers: [] } as never, {} as never, {} as never);
}

const reqWith = (
  headers: Record<string, string>,
  ip = "203.0.113.9",
): Record<string, unknown> => ({ headers, ip });

beforeEach(() => {
  process.env.CLIENT_ATTESTATION_SECRET = SECRET;
  vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.CLIENT_ATTESTATION_SECRET;
  vi.restoreAllMocks();
});

describe("two clients behind one BFF do not share a bucket", () => {
  it("gives distinct trackers to distinct attested clients", async () => {
    const g = guard();
    const a = await g.tracker(
      reqWith({
        [CLIENT_ATTESTATION_HEADER]: mintClientAttestation(
          "clientAAAA000000",
          SECRET,
        ),
      }),
    );
    const b = await g.tracker(
      reqWith({
        [CLIENT_ATTESTATION_HEADER]: mintClientAttestation(
          "clientBBBB111111",
          SECRET,
        ),
      }),
    );

    expect(a).not.toBe(b);
    expect(a).toMatch(/^client:/);
    expect(b).toMatch(/^client:/);
    // And neither is the BFF's own address, which is the bucket they used to
    // share.
    expect(a).not.toContain("203.0.113.9");
  });

  it("falls back to the caller's address when there is no attestation", async () => {
    const tracker = await guard().tracker(reqWith({}, "198.51.100.4"));
    expect(tracker).toBe("ip:198.51.100.4");
  });

  it("namespaces the two so a client id can never collide with an address", async () => {
    const g = guard();
    const attested = await g.tracker(
      reqWith({
        [CLIENT_ATTESTATION_HEADER]: mintClientAttestation(
          "aaaaaaaaaaaaaaaa",
          SECRET,
        ),
      }),
    );
    const direct = await g.tracker(reqWith({}, "aaaaaaaaaaaaaaaa"));
    expect(attested).not.toBe(direct);
  });
});

describe("the client does not get to choose its own bucket", () => {
  it("ignores an arbitrary attestation header the browser invented", async () => {
    const tracker = await guard().tracker(
      reqWith(
        {
          [CLIENT_ATTESTATION_HEADER]: "victim-bucket.99999999999999.deadbeef",
        },
        "198.51.100.7",
      ),
    );
    // Unsigned claim → refused, and the caller keeps its own address.
    expect(tracker).toBe("ip:198.51.100.7");
  });

  it("ignores one signed with the wrong secret", async () => {
    const forged = mintClientAttestation("victimclient0001", "not-our-secret");
    const tracker = await guard().tracker(
      reqWith({ [CLIENT_ATTESTATION_HEADER]: forged }, "198.51.100.8"),
    );
    expect(tracker).toBe("ip:198.51.100.8");
  });

  it("ignores an expired one, so a captured header stops working", async () => {
    const old = mintClientAttestation(
      "clientAAAA000000",
      SECRET,
      Date.now() - 10 * 60_000,
    );
    const tracker = await guard().tracker(
      reqWith({ [CLIENT_ATTESTATION_HEADER]: old }, "198.51.100.9"),
    );
    expect(tracker).toBe("ip:198.51.100.9");
  });

  it("does NOT read X-Forwarded-For or X-Real-IP itself", async () => {
    // `req.ip` is what Express computed under `trust proxy = 1`. The guard must
    // not second-guess it from raw headers, which is exactly how a caller would
    // spend somebody else's budget.
    const tracker = await guard().tracker(
      reqWith(
        {
          "x-forwarded-for": "9.9.9.9, 8.8.8.8",
          "x-real-ip": "9.9.9.9",
        },
        "198.51.100.10",
      ),
    );
    expect(tracker).toBe("ip:198.51.100.10");
    expect(tracker).not.toContain("9.9.9.9");
  });

  it("refuses a claim when this deployment has no secret to check it with", async () => {
    delete process.env.CLIENT_ATTESTATION_SECRET;
    const tracker = await guard().tracker(
      reqWith(
        {
          [CLIENT_ATTESTATION_HEADER]: mintClientAttestation(
            "x".repeat(20),
            SECRET,
          ),
        },
        "198.51.100.11",
      ),
    );
    expect(tracker).toBe("ip:198.51.100.11");
  });
});

describe("an unavailable store closes the door, controllably", () => {
  it("turns a storage failure into 503 RATE_LIMIT_UNAVAILABLE", async () => {
    const g = guard();
    vi.spyOn(
      Object.getPrototypeOf(AttestedClientThrottlerGuard.prototype) as {
        handleRequest: () => Promise<boolean>;
      },
      "handleRequest",
    ).mockRejectedValue(new Error("Redis connection refused"));

    await expect(g.request({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    try {
      await g.request({});
    } catch (err) {
      const body = (err as ServiceUnavailableException).getResponse() as {
        code: string;
      };
      expect(body.code).toBe("RATE_LIMIT_UNAVAILABLE");
      // No host, no key, no attestation in what the caller is told.
      expect(JSON.stringify(body)).not.toMatch(/redis|Redis|connection/);
    }
  });

  it("lets the limiter's OWN refusal through untouched", async () => {
    const g = guard();
    const thrown = new ThrottlerException("Too Many Requests");
    vi.spyOn(
      Object.getPrototypeOf(AttestedClientThrottlerGuard.prototype) as {
        handleRequest: () => Promise<boolean>;
      },
      "handleRequest",
    ).mockRejectedValue(thrown);

    await expect(g.request({})).rejects.toBe(thrown);
  });
});

describe("what the attestation itself admits", () => {
  it("round-trips a fresh claim", () => {
    const value = mintClientAttestation("clientAAAA000000", SECRET);
    expect(verifyClientAttestation(value, SECRET)).toEqual({
      clientId: "clientAAAA000000",
      rejected: null,
    });
  });

  it("names the refusal internally without telling the caller", () => {
    expect(verifyClientAttestation("a.b", SECRET).rejected).toBe("malformed");
    expect(verifyClientAttestation("", SECRET).rejected).toBeNull();
    expect(
      verifyClientAttestation(
        mintClientAttestation("clientAAAA000000", "other"),
        SECRET,
      ).rejected,
    ).toBe("bad-signature");
    expect(
      verifyClientAttestation(
        mintClientAttestation("clientAAAA000000", SECRET, Date.now() - 120_000),
        SECRET,
      ).rejected,
    ).toBe("expired");
  });

  it("checks the signature BEFORE the expiry", () => {
    // Otherwise the difference between "expired" and "forged" tells an attacker
    // whether they guessed the secret.
    const forgedAndExpired = mintClientAttestation(
      "clientAAAA000000",
      "wrong-secret",
      Date.now() - 120_000,
    );
    expect(verifyClientAttestation(forgedAndExpired, SECRET).rejected).toBe(
      "bad-signature",
    );
  });

  it("never carries a raw address", () => {
    // The BFF hashes before signing; this is the grammar that enforces it.
    expect(
      verifyClientAttestation("203.0.113.9.99999999999999.sig", SECRET),
    ).toEqual({ clientId: null, rejected: "malformed" });
  });
});

describe("nothing sensitive reaches the logs", () => {
  it("logs the REASON for a rejected claim, never the value", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn");
    const forged = mintClientAttestation("victimclient0001", "not-our-secret");

    await guard().tracker(
      reqWith({ [CLIENT_ATTESTATION_HEADER]: forged }, "198.51.100.12"),
    );

    expect(warn).toHaveBeenCalled();
    const line = String(warn.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("bad-signature");
    expect(line).not.toContain(forged);
    expect(line).not.toContain("victimclient0001");
    expect(line).not.toContain("198.51.100.12");
  });
});
