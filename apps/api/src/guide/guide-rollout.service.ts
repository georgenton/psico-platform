import { Inject, Injectable } from "@nestjs/common";
import {
  GUIDE_ROLLOUT_CONFIG,
  type GuideRolloutConfig,
  type GuideRolloutMode,
} from "./guide-rollout";

/**
 * CC-7.R1 — the ONE place the availability decision is made.
 *
 * The config is resolved once at module boot and captured here as a mode plus
 * an in-memory `Set` for O(1) exact membership. No Prisma, no Redis, no logger,
 * no analytics, no read of the Emotional Map or LearningEvents, no mutation —
 * a rollout gate is a pure function of (mode, allowlist, userId).
 */
@Injectable()
export class GuideRolloutService {
  private readonly mode: GuideRolloutMode;
  private readonly pilot: ReadonlySet<string>;

  constructor(@Inject(GUIDE_ROLLOUT_CONFIG) config: GuideRolloutConfig) {
    this.mode = config.mode;
    this.pilot = new Set(config.pilotUserIds);
  }

  /**
   * Whether Guide is on for this actor RIGHT NOW. Exact id membership — no
   * lowercasing, no email, no plan, no percentage. FREE/PRO entitlement is
   * decided elsewhere; this only answers "is the surface enabled for you".
   */
  isAvailable(userId: string): boolean {
    if (this.mode === "on") return true;
    if (this.mode === "off") return false;
    return this.pilot.has(userId);
  }
}
