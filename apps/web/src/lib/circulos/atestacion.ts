import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

/**
 * The BFF's signed claim about WHICH network client it is forwarding.
 *
 * ── The problem ────────────────────────────────────────────────────────────
 *
 * The guest surface is browser → Web → API. The API trusts exactly one proxy
 * hop, so what it sees is this server's egress address: every guest on the
 * planet lands in one rate-limit bucket and the first to hit the limit closes
 * inspection and acceptance for everybody.
 *
 * Forwarding `X-Forwarded-For` would not fix it. Nothing stops somebody
 * calling the API directly with any value they like, which would turn the rate
 * limit into a way to spend another client's budget. So the claim is SIGNED
 * with a secret only these two servers hold: the browser never sees it, a
 * direct caller cannot forge one, and a captured one expires in a minute.
 *
 * ── What the identity is, and is not ───────────────────────────────────────
 *
 * It is the address the PLATFORM reports for the incoming request, hashed. Not
 * a person: a household behind one NAT shares it, and a phone changes it on
 * the move. Everything here says `client` for that reason.
 *
 * The raw address never leaves this function — what travels is a hash, because
 * the API needs a stable bucket key and an address in a header is an address
 * in a log.
 */

const TTL_MS = 60_000;
export const CLIENT_ATTESTATION_HEADER = "x-client-attestation";

/**
 * The address the platform observed, or `null`.
 *
 * Read from the headers the PLATFORM sets on the incoming request.
 *
 * On Vercel the edge replaces them, and that is measured rather than assumed:
 * `hosted-limits.mjs` sends `x-forwarded-for`, `x-real-ip`,
 * `x-vercel-forwarded-for`, `true-client-ip`, `cf-connecting-ip` and
 * `forwarded` at the deployed Web with addresses of their own, and the identity
 * does not budge — every one of them keeps landing in the caller's own bucket.
 *
 * The dependency is worth naming, though: behind a bare Node server Next fills
 * `x-forwarded-for` from the socket only when it is ABSENT (`??=`), so a client
 * that sends its own is believed. What makes this trustworthy is the proxy in
 * front, not this function. A deployment of this app without one would need a
 * different source for the address.
 */
function observedClient(): string | null {
  const h = headers();
  // `x-forwarded-for` is a list; the client is the FIRST entry, the rest are
  // proxies. `x-real-ip` is the single-value form some platforms set.
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = h.get("x-real-ip");
  return real && real.trim().length > 0 ? real.trim() : null;
}

/**
 * A stable, non-reversible bucket key for an address.
 *
 * Keyed HMAC rather than a bare hash: an unkeyed digest of an IPv4 address is
 * trivially reversible by enumerating the whole space, so it would be the
 * address wearing a costume.
 */
function clientIdOf(address: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`client:${address}`)
    .digest("base64url")
    .slice(0, 32);
}

/**
 * The header value, or `null` when this deployment has no secret configured or
 * the platform reported no address.
 *
 * `null` is a safe outcome, not a failure: the API falls back to bucketing by
 * this server's address, which is exactly what it does today.
 */
export function clientAttestation(now: number = Date.now()): string | null {
  const secret = process.env.CLIENT_ATTESTATION_SECRET;
  if (!secret) return null;

  const address = observedClient();
  if (!address) return null;

  const clientId = clientIdOf(address, secret);
  const expiresAt = now + TTL_MS;
  const payload = `${clientId}.${expiresAt}`;
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}
