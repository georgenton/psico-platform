import { Injectable, Logger, NotImplementedException } from "@nestjs/common";
import type {
  BillingReturnResponse,
  CancelSubscriptionResponse,
  ReactivateSubscriptionResponse,
  UserPlan,
} from "@psico/types";

import { PrismaService } from "../prisma";
import { PaymentService } from "../subscription/payment.service";
import { SubscriptionService } from "../subscription/subscription.service";

/**
 * BillingService orchestrates the two new endpoints introduced by Sprint
 * S11 on top of the existing SubscriptionService:
 *
 *   - `GET /api/billing/return?session_id=…` — confirms the result of a
 *     Stripe Checkout by reading the session directly from the provider.
 *     The webhook is the source of truth for our DB state; this endpoint
 *     just lets the UI render the right success/processing/failed screen
 *     immediately, without polling.
 *
 *   - `PATCH /api/billing/subscription` — consolidated cancel / reactivate
 *     / switch-plan. Maps `action` onto the existing service methods so
 *     the legacy POSTs (/cancel + /reactivate) stay deterministic during
 *     the 90-day deprecation window (cf. ADR 0006).
 *
 * The rest of the billing surface (plans / usage / invoices / checkout /
 * portal / webhook) lives in SubscriptionService and BillingController
 * just delegates one-liners. We keep the services split because:
 *
 *   1. The legacy controller still calls the same methods unchanged.
 *   2. Sprint S22+ may move `subscription/` → `billing/` once the
 *      deprecation window closes; at that point this file collapses
 *      into the merged service.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly paymentService: PaymentService,
  ) {}

  /**
   * Confirm the result of a Stripe Checkout session.
   *
   * Flow:
   *   1. Read the provider session (Stripe `checkout.sessions.retrieve`).
   *   2. Read the user's current tier from our DB (the webhook may have
   *      already promoted them — that's fine; we trust the webhook for
   *      DB state and the session for the UI cue).
   *   3. Compose a humane es-EC message + return shape.
   *
   * Why we don't promote the user here: if we updated `User.plan` based
   * on a session read, a malicious actor could call the endpoint with a
   * sessionId from another user (we'd need an extra check). The webhook
   * already authenticates the event signature, so it stays the canonical
   * write path. This handler is read-only.
   */
  async getReturn(
    userId: string,
    sessionId: string,
  ): Promise<BillingReturnResponse> {
    // PaymentService picks the active provider; today only Stripe
    // implements `getCheckoutSessionStatus` (Payphone uses its own redirect
    // protocol and never reaches `/api/billing/return`). If a future
    // provider is selected without support, PaymentService throws — we
    // surface that as 501 below.
    let result: { status: "success" | "processing" | "failed" };
    try {
      result = await this.paymentService.getCheckoutSessionStatus(sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.warn(`Provider lookup failed for ${sessionId}: ${message}`);
      throw new NotImplementedException({
        code: "PROVIDER_NO_SESSION_LOOKUP",
        message,
      });
    }

    // Read tier separately so we always return the current value even if
    // the webhook ran before this call (the typical happy path).
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plan: true },
    });
    const subscription =
      await this.subscriptionService.getMySubscription(userId);

    const message = this.composeReturnMessage(result.status, user.plan);

    return {
      status: result.status,
      tier: user.plan as UserPlan,
      subscription,
      message,
    };
  }

  /**
   * Consolidated PATCH for the design's "Acciones del usuario" matrix.
   * `switch-plan` is reserved in the contract but rejected with 501 today
   * — we ship it in a follow-up sprint when we wire Stripe
   * `subscriptions.update({ proration_behavior })`.
   */
  async patchSubscription(
    userId: string,
    action: "cancel" | "reactivate" | "switch-plan",
    body: { reason?: string; newPlanId?: string },
  ): Promise<
    | CancelSubscriptionResponse
    | ReactivateSubscriptionResponse
    | { ok: true; switched: true; newPlanId: string }
  > {
    switch (action) {
      case "cancel":
        return this.subscriptionService.cancel(userId, body.reason);
      case "reactivate":
        return this.subscriptionService.reactivate(userId);
      case "switch-plan":
        // Reserved for a future sprint. Returning 501 instead of 400 so the
        // client can show "feature coming" rather than "your input is bad".
        throw new NotImplementedException({
          code: "SWITCH_PLAN_NOT_AVAILABLE",
          message:
            "El cambio de plan estará disponible próximamente. Por ahora, cancela y vuelve a suscribirte con el nuevo plan.",
          requestedPlanId: body.newPlanId,
        });
    }
  }

  private composeReturnMessage(
    status: "success" | "processing" | "failed",
    plan: string,
  ): string {
    if (status === "success") {
      const tierLabel = plan === "ANNUAL" ? "Pro Anual" : "Pro";
      return `¡Listo! Tu plan ${tierLabel} está activo.`;
    }
    if (status === "processing") {
      return "Estamos confirmando tu pago. Te avisaremos por correo en cuanto esté listo.";
    }
    return "No pudimos procesar el pago. Reintenta o usa otro método.";
  }
}
