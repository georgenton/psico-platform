import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";

import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../shared";
import { PlanService } from "./plan.service";

/**
 * `GET /api/plan` — Mi Plan envolvente.
 *
 * Lives at the top level (not under /billing/*) per the design table in
 * docs/design/handoff/09-plan.md §"Endpoints de esta área". The reason
 * for the top-level mount: this is the single endpoint the Mi Plan screen
 * needs to render — putting it under /billing/* would imply it's part of
 * the billing CRUD surface, when really it's a read-only screen aggregator.
 *
 * Compose:
 *   - `tier`              (UserPlan flat from User.plan)
 *   - `subscription`      (from SubscriptionService.getMySubscription)
 *   - `usage`             (from SubscriptionService.getUsage — Redis cached)
 *   - `invoices` (last 12)  (from SubscriptionService.listInvoices via Stripe)
 *   - `plans` catalog     (from SubscriptionService.getPlans)
 *
 * No body, no query — entirely keyed on the authenticated user.
 */
@ApiTags("Billing")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@Controller("plan")
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getPlan(@CurrentUser() user: AuthenticatedUser) {
    return this.planService.getPlan(user.userId);
  }
}
