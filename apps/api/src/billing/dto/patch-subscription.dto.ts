import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Body for `PATCH /api/billing/subscription` — consolidated mutation
 * (Sprint S11). Replaces the Sprint S7 split between `POST /cancel` and
 * `POST /reactivate` per the design (`docs/design/handoff/09-plan.md`
 * §"Acciones del usuario").
 *
 * The legacy POSTs stay alive during the 90-day deprecation window so
 * any client still on `subscriptionsApi` doesn't break — but the
 * design matrix and api-client now use this single PATCH.
 *
 * `action: "switch-plan"` is reserved in the contract but rejected at
 * the service layer with `501 NOT_IMPLEMENTED` until we ship Stripe
 * `subscriptions.update` with `proration_behavior: "create_prorations"`
 * in a follow-up sprint.
 */
export class PatchSubscriptionDto {
  /**
   * What to do with the subscription:
   * - `"cancel"` — mark cancel-at-period-end; the user keeps Pro
   *   until the period closes
   * - `"reactivate"` — undo a pending cancellation (no-op if not pending)
   * - `"switch-plan"` — move to a different plan with proration. Currently
   *   501 — server-side TODO.
   *
   * Plugin emits the enum in OpenAPI.
   */
  @IsEnum(["cancel", "reactivate", "switch-plan"] as const)
  action!: "cancel" | "reactivate" | "switch-plan";

  /**
   * Free-text reason for cancellation (up to 480 chars). Captured for
   * retention analytics; sent to Stripe metadata. Only meaningful when
   * `action === "cancel"` — ignored for the other actions.
   */
  @IsOptional()
  @IsString()
  @MaxLength(480)
  reason?: string;

  /**
   * Target plan tier for `action: "switch-plan"`. Required for that
   * action; ignored otherwise. Until the server implements the switch,
   * the request returns 501.
   */
  @IsOptional()
  @IsIn(["PRO_MONTHLY", "PRO_YEARLY", "B2B"] as const)
  newPlanId?: "PRO_MONTHLY" | "PRO_YEARLY" | "B2B";
}
