import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_KEY = "idempotent";

export interface IdempotencyOptions {
  /** Cache TTL in seconds. Default 24h. */
  ttlSeconds?: number;
}

/**
 * Marks a handler as idempotent for the purpose of de-duplicating POSTs.
 *
 * When a client retries the same request (network glitch, double-tap on
 * mobile), it sends the same `Idempotency-Key` header (UUID v7 generated
 * client-side). The IdempotencyInterceptor:
 *   - on first call: executes the handler, caches the JSON response in Redis.
 *   - on subsequent calls with the same key: returns the cached response
 *     without re-executing.
 *
 * Where to apply (see ADR 0008):
 *   - POST /api/billing/checkout-session
 *   - POST /api/terapia/bookings
 *   - POST /api/diario/entries (also: avoid duplicate journal entries when
 *     network flakes during save)
 *   - POST /api/eco/messages (only the user-facing message, not internal)
 *
 * Where NOT to apply:
 *   - PATCH/PUT/DELETE — semantically idempotent already (per HTTP spec).
 *   - GET — never has side effects.
 *   - POST /api/auth/login — should NOT be cached (each call may issue a
 *     fresh token pair).
 */
export const Idempotent = (options: IdempotencyOptions = {}) =>
  SetMetadata(IDEMPOTENT_KEY, options);
