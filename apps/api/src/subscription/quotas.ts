/**
 * Per-plan usage quotas — Sprint S7.
 *
 * These define the CAPS exposed via `GET /api/subscriptions/usage`. Enforcement
 * lives in the feature modules that consume each counter:
 *   - eco.quota   → `AIModule` will refuse new messages when the user's
 *                   running count crosses this (lands with the conversational
 *                   layer in S10).
 *   - voice.quota → `VoiceModule` will refuse new transcriptions (S8).
 *   - diary.quota → `DiarioModule` would refuse entries — but v1 leaves diary
 *                   unlimited for everyone (null), so there's nothing to do.
 *
 * `null` = unlimited (B2B for everything, Pro for diary).
 *
 * Why constants in code over a DB table:
 *   - Quotas change with marketing campaigns, not with each deploy. Three
 *     changes a year is the right baseline; a DB row would imply admin UI
 *     overhead we don't need yet.
 *   - When we add per-customer overrides (e.g. B2B contract with custom
 *     limits) we'll add an `Subscription.usageQuotaOverride` JSON column;
 *     this file remains the default.
 */

import type { Plan } from "@prisma/client";

export interface PlanQuotas {
  /** Eco AI companion messages per billing period. */
  eco: number | null;
  /** Voice transcription minutes per billing period. */
  voice: number | null;
  /** Diary entries per billing period (null = unlimited for all tiers in v1). */
  diary: number | null;
}

export const PLAN_QUOTAS: Record<Plan, PlanQuotas> = {
  FREE: {
    eco: 20,
    voice: 0, // FREE doesn't get voice at all
    diary: null,
  },
  PRO: {
    eco: 200,
    voice: 120,
    diary: null,
  },
  ANNUAL: {
    eco: 200,
    voice: 120,
    diary: null,
  },
  B2B: {
    eco: null,
    voice: null,
    diary: null,
  },
};
