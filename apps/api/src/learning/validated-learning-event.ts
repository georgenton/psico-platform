import type {
  LearningEventPayloadByType,
  LearningEventTypeV1,
} from "@psico/types";

/**
 * CC-7.2 — the INTERNAL write contract of the single learning-event writer.
 *
 * This is NOT an HTTP shape. A `ValidatedLearningEvent` may only be built by a
 * future domain-command layer AFTER it has: parsed the wire body (CC-7.1
 * parsers), executed the server-side transition, resolved every catalog key to
 * concrete ids, and established the server-owned facts. Nothing here is
 * trusted client input.
 *
 * Deliberate absences (ADR 0017):
 *   - no `createdAt` / `occurredAt` — the database clock stamps the event;
 *   - no `schemaVersion` — the repository stamps `1`;
 *   - no `Json`, no `Record<string, unknown>`, no metadata escape hatch —
 *     the payload is the exact per-type shape from `@psico/types`, coupled to
 *     `type` through `LearningEventPayloadByType` (single source of truth);
 *   - no actor beyond `userId` — the actor is established by the caller from
 *     the authenticated identity, never from a wire field.
 */
interface ValidatedLearningEventBase {
  /** The authenticated actor (server-established, never a wire field). */
  userId: string;
  /**
   * Canonical (lowercase UUID) idempotency key, exactly as produced by the
   * CC-7.1 parsers. The repository persists it verbatim — no re-normalization
   * happens at this layer, so a non-canonical key is a caller bug upstream.
   */
  idempotencyKey: string;
  /** Resolved edition id (Content Core), when the command has one. */
  editionId?: string | null;
  /** Resolved content-unit id, when the command has one. */
  unitId?: string | null;
  /** Resolved concept id, when the command has one. */
  conceptId?: string | null;
  /** Guide session id, for the guide_session_* transitions. */
  guideSessionId?: string | null;
  /** Storage anchor for block-scoped events (unused by the seven V1 types). */
  blockKey?: string | null;
}

/**
 * Discriminated union over exactly the seven V1 types. Deriving it from
 * `LearningEventPayloadByType` means a type without its payload (or a payload
 * riding the wrong type) does not compile — and the non-V1 Prisma kinds
 * (BLOCK_DWELL, HIGHLIGHT_CREATED, ANNOTATION_CREATED, RESONANCE_CONFIRMED)
 * are unrepresentable as inputs.
 */
export type ValidatedLearningEvent<
  T extends LearningEventTypeV1 = LearningEventTypeV1,
> = {
  [K in T]: ValidatedLearningEventBase & {
    type: K;
    payload: LearningEventPayloadByType[K];
  };
}[T];
