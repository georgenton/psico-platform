import { Inject, Injectable } from "@nestjs/common";
import {
  CIRCLES_ROLLOUT_CONFIG,
  type CirclesRolloutConfig,
  type CirclesRolloutMode,
} from "./circles-rollout";

/**
 * The ONE place the Círculos availability decision is made.
 *
 * Resolved once at boot and held as a mode plus an in-memory `Set`. No Prisma,
 * no Redis, no logger — a rollout gate is a pure function of
 * (mode, allowlist, userId), and the mode is never re-read at request time so a
 * mid-flight env change cannot half-open a surface.
 */
@Injectable()
export class CirclesRolloutService {
  private readonly mode: CirclesRolloutMode;
  private readonly pilot: ReadonlySet<string>;

  constructor(@Inject(CIRCLES_ROLLOUT_CONFIG) config: CirclesRolloutConfig) {
    this.mode = config.mode;
    this.pilot = new Set(config.pilotUserIds);
  }

  /** Exposed for the report and for specs — never for a branch in a handler. */
  currentMode(): CirclesRolloutMode {
    return this.mode;
  }

  /** Whether Círculos is on for this AUTHENTICATED actor right now. */
  isAvailable(userId: string | null): boolean {
    // A membership whose account has been deleted carries no enablement — not
    // even under `on`, where the feature is generally available but this
    // particular seat no longer belongs to anybody. Checked here rather than
    // left to the callers so the fail-closed answer is the only answer.
    if (userId === null) return false;
    if (this.mode === "on") return true;
    if (this.mode === "off") return false;
    return this.pilot.has(userId);
  }

  /**
   * Whether a GUEST surface may operate at all.
   *
   * A guest has no user id, so there is nothing to match against an allowlist
   * — which is exactly the hole to close: if a guest route asked
   * `isAvailable(someId)` it would either need an id it must never accept from
   * the client, or a default, and a default here is how `off` becomes `on`.
   *
   * The guest surface therefore rides on the INVITER's enablement, which the
   * invitation already encodes: an invitation can only exist if an authenticated
   * member was enabled when they created it. What this method decides is the
   * coarser question — is the guest surface running at all — and under `pilot`
   * the answer is yes, because refusing it would make an allowlisted member
   * unable to invite anyone, which is not what a pilot is.
   *
   * Under `off` it is no, and no request from a guest can change that.
   */
  isGuestSurfaceAvailable(): boolean {
    return this.mode !== "off";
  }
}
