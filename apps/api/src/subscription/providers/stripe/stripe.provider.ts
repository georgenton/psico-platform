import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import { Plan, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import type {
  InvoiceStatus as PsicoInvoiceStatus,
  InvoiceSummary,
} from "@psico/types";
import type { Env } from "../../../config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../../prisma";
import type { BillingPlan } from "../../dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "../../dto/create-portal-session.dto";
import type {
  CancelSubscriptionResult,
  CheckoutSessionResult,
  IPaymentProvider,
  PortalSessionResult,
  ReactivateSubscriptionResult,
} from "../payment-provider.interface";

// In Stripe v22 with CJS module resolution, instance type is Stripe.Stripe
type StripeInstance = Stripe.Stripe;
type StripeEvent = ReturnType<StripeInstance["webhooks"]["constructEvent"]>;
type StripeSubscription = Awaited<
  ReturnType<StripeInstance["subscriptions"]["retrieve"]>
>;
// invoices.list returns an ApiList<Invoice> — pull the element type out so
// we get the bare Invoice without the .retrieve wrapper's lastResponse.
type StripeInvoice = Awaited<
  ReturnType<StripeInstance["invoices"]["list"]>
>["data"][number];

@Injectable()
export class StripeProvider implements IPaymentProvider {
  readonly name = "stripe";
  private readonly logger = new Logger(StripeProvider.name);
  private readonly stripe: StripeInstance;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.stripe = new Stripe(
      this.config.get("STRIPE_SECRET_KEY", { infer: true }),
      { apiVersion: "2026-04-22.dahlia" },
    );
  }

  // ─── IPaymentProvider ──────────────────────────────────────────────────────

  async createCheckoutSession(
    userId: string,
    billingPlan: BillingPlan,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CheckoutSessionResult> {
    const priceId = this.resolvePriceId(billingPlan);
    const stripeCustomerId = await this.getOrCreateStripeCustomer(userId);

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
      subscription_data: { metadata: { userId } },
    });

    if (!session.url) {
      throw new BadRequestException("Failed to create checkout session");
    }

    return { url: session.url };
  }

  async createPortalSession(
    userId: string,
    dto: CreatePortalSessionDto,
  ): Promise<PortalSessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      throw new BadRequestException("No active subscription found");
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: dto.returnUrl,
    });

    return { url: session.url };
  }

  // ─── Sprint S7: invoices + cancel + reactivate ─────────────────────────────

  async listInvoices(userId: string, limit: number): Promise<InvoiceSummary[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });
    if (!user?.stripeCustomerId) {
      // No customer yet → no invoices. Empty array, not 404 — the UI shows
      // "Aún no hay facturas" without surfacing a backend error.
      return [];
    }

    const list = await this.stripe.invoices.list({
      customer: user.stripeCustomerId,
      limit,
    });

    return list.data.map((inv) => this.mapInvoice(inv));
  }

  async cancelAtPeriodEnd(
    userId: string,
    reason?: string,
  ): Promise<CancelSubscriptionResult> {
    const sub = await this.findActiveStripeSubscription(userId);

    const updated = await this.stripe.subscriptions.update(sub.id, {
      cancel_at_period_end: true,
      // Stripe accepts arbitrary metadata — handy for the customer-success
      // CSV without us building a separate retention table.
      metadata: reason
        ? { ...sub.metadata, cancellation_reason: reason }
        : sub.metadata,
    });

    // Mirror locally so Mi Plan shows the banner immediately without
    // waiting for the customer.subscription.updated webhook.
    const periodEnd = new Date(
      (updated.items.data[0]?.current_period_end ??
        updated.billing_cycle_anchor) * 1000,
    );
    await this.prisma.subscription.updateMany({
      where: { userId },
      data: { cancelAtPeriodEnd: true },
    });

    this.logger.log(
      `Cancel-at-period-end requested for user ${userId} (effective ${periodEnd.toISOString()})`,
    );

    return { cancelAtPeriodEnd: true, effectiveAt: periodEnd };
  }

  async reactivate(userId: string): Promise<ReactivateSubscriptionResult> {
    const sub = await this.findActiveStripeSubscription(userId);

    if (!sub.cancel_at_period_end) {
      // Already active — return idempotently rather than 4xx-ing. UX wise
      // the user clicked "reactivate", and the system state already matches
      // that intent.
      return { cancelAtPeriodEnd: false };
    }

    await this.stripe.subscriptions.update(sub.id, {
      cancel_at_period_end: false,
    });

    await this.prisma.subscription.updateMany({
      where: { userId },
      data: { cancelAtPeriodEnd: false },
    });

    this.logger.log(`Reactivated subscription for user ${userId}`);

    return { cancelAtPeriodEnd: false };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: StripeEvent;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.get("STRIPE_WEBHOOK_SECRET", { infer: true }),
      );
    } catch {
      throw new BadRequestException("Invalid Stripe webhook signature");
    }

    // Idempotency: skip already-processed events
    const existing = await this.prisma.stripeEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (existing) {
      this.logger.log(`Skipping already-processed Stripe event: ${event.id}`);
      return;
    }

    await this.processEvent(event);

    await this.prisma.stripeEvent.create({
      data: {
        stripeEventId: event.id,
        type: event.type,
        processedAt: new Date(),
      },
    });
  }

  getWebhookEventType(rawBody: Buffer, signature: string): string {
    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.get("STRIPE_WEBHOOK_SECRET", { infer: true }),
      );
      return event.type;
    } catch {
      return "unknown";
    }
  }

  supportsRecurring(): boolean {
    return true;
  }

  // ─── Stripe customer (lazy creation) ──────────────────────────────────────

  private async getOrCreateStripeCustomer(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, email: true, name: true },
    });

    if (!user) throw new NotFoundException("User not found");
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  // ─── Webhook event processing ──────────────────────────────────────────────

  private async processEvent(event: StripeEvent): Promise<void> {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await this.syncSubscription(event.data.object as StripeSubscription);
        break;

      case "customer.subscription.deleted":
        await this.cancelSubscription(event.data.object as StripeSubscription);
        break;

      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async syncSubscription(sub: StripeSubscription): Promise<void> {
    const userId = sub.metadata["userId"];
    if (!userId) {
      this.logger.warn(
        `Stripe subscription ${sub.id} has no userId in metadata`,
      );
      return;
    }

    const firstItem = sub.items.data[0];
    const priceId = firstItem?.price.id ?? "";
    const plan = this.mapPriceIdToPlan(priceId);
    const status = this.mapStripeStatus(sub.status);
    // In Stripe API 2026-04-22+, billing period fields moved to SubscriptionItem
    const periodStart = new Date(
      (firstItem?.current_period_start ?? sub.start_date) * 1000,
    );
    const periodEnd = new Date(
      (firstItem?.current_period_end ?? sub.billing_cycle_anchor) * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          stripeCustomerId: sub.customer as string,
          status,
          plan,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
        update: {
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          status,
          plan,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { plan },
      }),
    ]);

    this.logger.log(
      `Synced subscription for user ${userId}: plan=${plan}, status=${status}`,
    );
  }

  private async cancelSubscription(sub: StripeSubscription): Promise<void> {
    const userId = sub.metadata["userId"];
    if (!userId) return;

    await this.prisma.$transaction([
      this.prisma.subscription.updateMany({
        where: { userId },
        data: { status: SubscriptionStatus.CANCELED },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { plan: Plan.FREE },
      }),
    ]);

    this.logger.log(
      `Canceled subscription for user ${userId} — downgraded to FREE`,
    );
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private resolvePriceId(billingPlan: BillingPlan): string {
    const map: Record<BillingPlan, keyof Env> = {
      PRO_MONTHLY: "STRIPE_PRO_MONTHLY_PRICE_ID",
      PRO_YEARLY: "STRIPE_PRO_YEARLY_PRICE_ID",
      B2B: "STRIPE_B2B_PRICE_ID",
    };
    return this.config.get(map[billingPlan], { infer: true });
  }

  private mapPriceIdToPlan(priceId: string): Plan {
    if (
      priceId ===
      this.config.get("STRIPE_PRO_MONTHLY_PRICE_ID", { infer: true })
    )
      return Plan.PRO;
    if (
      priceId === this.config.get("STRIPE_PRO_YEARLY_PRICE_ID", { infer: true })
    )
      return Plan.ANNUAL;
    if (priceId === this.config.get("STRIPE_B2B_PRICE_ID", { infer: true }))
      return Plan.B2B;
    return Plan.FREE;
  }

  private mapStripeStatus(
    status: StripeSubscription["status"],
  ): SubscriptionStatus {
    const statusMap: Partial<
      Record<StripeSubscription["status"], SubscriptionStatus>
    > = {
      active: SubscriptionStatus.ACTIVE,
      trialing: SubscriptionStatus.TRIALING,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      incomplete: SubscriptionStatus.INCOMPLETE,
    };
    return statusMap[status] ?? SubscriptionStatus.INCOMPLETE;
  }

  /**
   * Pull the active Stripe subscription for a user. Used by cancel + reactivate.
   * Rejects with 400 if the user has no Stripe-backed sub (e.g. still FREE) —
   * the controller catches and surfaces a clean error to the client.
   */
  private async findActiveStripeSubscription(
    userId: string,
  ): Promise<StripeSubscription> {
    const local = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { stripeSubscriptionId: true, status: true },
    });
    if (!local?.stripeSubscriptionId) {
      throw new BadRequestException("NO_ACTIVE_SUBSCRIPTION");
    }
    if (
      local.status === SubscriptionStatus.CANCELED ||
      local.status === SubscriptionStatus.INCOMPLETE
    ) {
      throw new BadRequestException("SUBSCRIPTION_NOT_CANCELLABLE");
    }
    return this.stripe.subscriptions.retrieve(local.stripeSubscriptionId);
  }

  private mapInvoice(inv: StripeInvoice): InvoiceSummary {
    return {
      // `id` is null only on draft auto-advance invoices we haven't surfaced
      // before; fall back to invoice_number to avoid an undefined.
      id: inv.id ?? inv.number ?? "unknown",
      // Stripe.created is epoch seconds.
      date: new Date(inv.created * 1000),
      // Stripe amounts are minor units; convert to major (USD dollars).
      amount: (inv.amount_paid || inv.amount_due) / 100,
      currency: inv.currency,
      status: this.mapInvoiceStatus(inv.status),
      pdfUrl: inv.invoice_pdf ?? null,
      hostedUrl: inv.hosted_invoice_url ?? null,
    };
  }

  private mapInvoiceStatus(
    status: StripeInvoice["status"] | null,
  ): PsicoInvoiceStatus {
    switch (status) {
      case "paid":
        return "paid";
      case "open":
        return "open";
      case "void":
        return "void";
      case "uncollectible":
        return "uncollectible";
      case "draft":
      default:
        return "draft";
    }
  }
}
