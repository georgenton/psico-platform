import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ThrottlerGuard, ThrottlerException } from "@nestjs/throttler";
import type { ThrottlerRequest } from "@nestjs/throttler";

import {
  CLIENT_ATTESTATION_HEADER,
  verifyClientAttestation,
} from "./client-attestation";

/**
 * The global rate limiter, bucketed by the real NETWORK CLIENT when a trusted
 * front end can name one.
 *
 * ── What it changes ────────────────────────────────────────────────────────
 *
 * The default tracker is `req.ip`, which is right for a browser talking to the
 * API and wrong for anything proxied through our own Web app. Those calls all
 * arrive from the BFF's egress address, so every visitor shares one bucket and
 * the first to hit a limit closes that route for everybody else. The Círculos
 * guest surface is entirely of this shape.
 *
 * With a valid attestation the bucket is the client identity the BFF observed.
 * Without one, it is `req.ip` — exactly as before. A direct caller therefore
 * keeps the protection it always had and cannot obtain a better bucket by
 * asking for one, because asking requires a signature it does not have.
 *
 * ── "Client", not "person" ─────────────────────────────────────────────────
 *
 * An address is not a person: a household behind one NAT shares a bucket and
 * somebody on a train changes buckets. The vocabulary stays `client` so nobody
 * reads a stronger promise into it than the input supports.
 *
 * ── An unavailable store closes, and cleanly ───────────────────────────────
 *
 * If the storage cannot answer, it throws. Letting that escape is a 500 with a
 * stack — closed, but noisy and leaky. This turns it into a plain 503 with a
 * stable code, and logs a COUNTER: never the key, the address, or the
 * attestation itself.
 */
@Injectable()
export class AttestedClientThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(AttestedClientThrottlerGuard.name);

  /**
   * `ip:<address>` or `client:<hash>` — namespaced so the two can never
   * collide, and so a bucket key in Redis is not itself an address.
   */
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, unknown>;
    const presented = headers[CLIENT_ATTESTATION_HEADER];

    const result = verifyClientAttestation(
      typeof presented === "string" ? presented : null,
      process.env.CLIENT_ATTESTATION_SECRET,
    );

    if (result.rejected !== null) {
      // Counted by REASON — never the value, which is the part worth stealing.
      this.logger.warn(`client attestation rejected: ${result.rejected}`);
    }

    if (result.clientId) return `client:${result.clientId}`;
    return `ip:${String(req.ip ?? "unknown")}`;
  }

  protected async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(props);
    } catch (err) {
      // The limit being hit IS the guard working; its exception passes through.
      if (err instanceof ThrottlerException) throw err;
      this.logger.error("rate-limit store unavailable — refusing");
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "RATE_LIMIT_UNAVAILABLE",
        message: "RATE_LIMIT_UNAVAILABLE",
      });
    }
  }
}
