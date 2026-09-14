import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";

import {
  CLIENT_ATTESTATION_HEADER,
  verifyClientAttestation,
} from "../shared/throttler/client-attestation";
import { circlesException } from "./circles-http-errors";

/**
 * The invitation routes are the Web's, and only the Web's.
 *
 * ── What this closes ───────────────────────────────────────────────────────
 *
 * `AttestedClientThrottlerGuard` decides which BUCKET a request is counted in:
 * the attested client identity when there is one, `req.ip` otherwise. That is
 * the right fallback for the API at large, and it was the wrong one here.
 *
 * Measured against the deployment: one caller spent ten calls through the Web
 * and then ten to twenty more by going straight at the same route, because the
 * two paths are different buckets by construction. Neither is forgeable — six
 * client headers were tried against both and none was honoured — but the sums
 * add up, so the effective budget was two to three times the number written on
 * the route.
 *
 * These two routes have exactly one consumer: `apps/web/src/lib/circulos/bff.ts`.
 * There is no mobile client and nothing else calls them. So the honest fix is
 * not a bigger bucket or a cleverer key — it is to say that a caller who cannot
 * present the Web's signature is not talking to a surface that exists for them.
 * With the direct path closed, the budget is one per attested client, which is
 * the number the route claims.
 *
 * ── Why it is conditional, and why that is not a hole ──────────────────────
 *
 * With no `CLIENT_ATTESTATION_SECRET` this guard lets everything through. A
 * deployment that cannot VERIFY an attestation cannot REQUIRE one: enforcing
 * would refuse every guest with no way for anyone to satisfy it, turning a
 * missing variable into a silent outage of the whole guest surface. Production
 * has no secret today and is unaffected.
 *
 * It is not a hole because the value that opens the door is an environment
 * variable on the server. A caller cannot unset it, and when it IS set, nothing
 * they send substitutes for the signature.
 *
 * ── The operational cost, stated ───────────────────────────────────────────
 *
 * If the Web's copy of the secret and the API's ever drift apart, this refuses
 * every guest instead of degrading to a shared bucket. That is a real failure
 * mode and it belongs in the runbook, not in a comment only — it is the price
 * of the route meaning what it says.
 */
@Injectable()
export class CirclesBffOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.CLIENT_ATTESTATION_SECRET;
    if (!secret) return true;

    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, unknown>;
    }>();
    const presented = request?.headers?.[CLIENT_ATTESTATION_HEADER];

    const { clientId } = verifyClientAttestation(
      typeof presented === "string" ? presented : null,
      secret,
    );
    // Absent, malformed, expired and forged are one answer. Saying which would
    // tell a prober whether they had the grammar right, the key right, or
    // merely the clock wrong.
    if (!clientId) throw circlesException("CIRCLE_FORBIDDEN");
    return true;
  }
}
