import { Injectable } from "@nestjs/common";
import type { PlanResponse, UserPlan } from "@psico/types";

import { PrismaService } from "../prisma";
import { SubscriptionService } from "../subscription/subscription.service";

/**
 * Aggregator for the Mi Plan screen.
 *
 * Before this sprint the screen issued four sequential requests:
 *   GET /user/me                  → tier
 *   GET /api/subscriptions/me     → subscription
 *   GET /api/subscriptions/plans  → catalog
 *   GET /api/subscriptions/usage  → counters
 *   GET /api/subscriptions/invoices → history
 *
 * That meant ~5 round-trips on every navigation to /dashboard/plan. The
 * design (docs/design/handoff/09-plan.md §"Endpoints de esta área") asks
 * for a single `GET /api/plan` that returns the whole bundle. This service
 * does the assembly server-side, where the same Redis cache that backs
 * UsageService also amortises the cost of repeated visits.
 *
 * The pieces are still individually exposed via /api/billing/* so that
 * specific consumers (e.g. an admin panel listing all invoices, or a
 * webhook handler that only needs `getUsage`) don't have to pay for the
 * whole bundle.
 */
@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async getPlan(userId: string): Promise<PlanResponse> {
    // The user's tier is the source-of-truth for which catalog item is
    // currently active. We hit Prisma directly (instead of the SubscriptionService)
    // to keep the path tight — we just need `plan`, not the full sub row.
    const userPromise = this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plan: true },
    });

    // Parallelise the four reads. None of them depend on each other.
    const [user, subscription, usage, invoiceList, plans] = await Promise.all([
      userPromise,
      this.subscriptionService.getMySubscription(userId),
      this.subscriptionService.getUsage(userId),
      this.subscriptionService.listInvoices(userId, 12),
      Promise.resolve(this.subscriptionService.getPlans()),
    ]);

    return {
      tier: user.plan as UserPlan,
      subscription,
      usage,
      invoices: invoiceList.invoices,
      plans,
    };
  }
}
