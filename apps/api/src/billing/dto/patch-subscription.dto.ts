import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Consolidated body for `PATCH /api/billing/subscription` — replaces the
 * Sprint S7 split between `POST /cancel` and `POST /reactivate` per the
 * design (docs/design/handoff/09-plan.md §"Acciones del usuario").
 *
 * The legacy POSTs stay alive during the 90-day deprecation window so any
 * client still on `subscriptionsApi` doesn't break — but the design
 * matrix and api-client now use this single PATCH.
 *
 * `action: "switch-plan"` is reserved in the contract but rejected at the
 * service layer with `501 NOT_IMPLEMENTED` until we ship Stripe
 * `subscriptions.update` with `proration_behavior: "create_prorations"` in
 * a follow-up sprint.
 */
export class PatchSubscriptionDto {
  @IsEnum(["cancel", "reactivate", "switch-plan"] as const)
  action!: "cancel" | "reactivate" | "switch-plan";

  /** Free-text reason for cancellation. Captured for retention analytics. */
  @IsOptional()
  @IsString()
  @MaxLength(480)
  reason?: string;

  /** Only required when action === "switch-plan". */
  @IsOptional()
  @IsIn(["PRO_MONTHLY", "PRO_YEARLY", "B2B"] as const)
  newPlanId?: "PRO_MONTHLY" | "PRO_YEARLY" | "B2B";
}
