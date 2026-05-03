import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
<<<<<<< HEAD
import type { ConfigService } from "@nestjs/config";
import { Plan, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import type { Env } from "../config";
import type { PrismaService } from "../prisma";
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import { Plan, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import type { Env } from "../config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
>>>>>>> origin/main
import type { BillingPlan } from "./dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "./dto/create-portal-session.dto";

// In Stripe v22 with CJS module resolution, instance type is Stripe.Stripe
type StripeInstance = Stripe.Stripe;
type StripeEvent = ReturnType<StripeInstance["webhooks"]["constructEvent"]>;
type StripeSubscription = Awaited<
  ReturnType<StripeInstance["subscriptions"]["retrieve"]>
>;

export interface PlanInfo {
  plan: "FREE" | "PRO" | "ANNUAL" | "B2B";
  name: string;
  prices: { monthly?: number; yearly?: number; currency: string };
  description: string;
  features: string[];
}

export interface CheckoutSessionResult {
  url: string;
}

export interface PortalSessionResult {
  url: string;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
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

  // ─── Plans (hardcoded — prices don't change frequently) ───────────────────

  getPlans(): PlanInfo[] {
    return [
      {
        plan: "FREE",
        name: "Gratuito",
        prices: { currency: "USD" },
        description: "Acceso básico a contenido psicoeducativo seleccionado.",
        features: [
          "Acceso al primer capítulo de cada libro",
          "Ejercicios de respiración y reflexión",
          "Progreso guardado",
          "Soporte por email",
        ],
      },
      {
        plan: "PRO",
        name: "Pro",
        prices: { monthly: 7, yearly: 59, currency: "USD" },
        description: "Acceso completo a todos los libros y capítulos.",
        features: [
          "Todo lo incluido en Gratuito",
          "Acceso ilimitado a todos los libros",
          "Audio meditaciones y ejercicios completos",
          "Diario personal con IA",
          "Soporte prioritario",
          "2 meses gratis al pagar anual",
        ],
      },
      {
        plan: "ANNUAL",
        name: "Pro Anual",
        prices: { yearly: 59, currency: "USD" },
        description:
          "Plan Pro al mejor precio — $59/año (equivale a $4.92/mes).",
        features: [
          "Todo lo incluido en Pro",
          "Precio equivalente a $4.92/mes",
          "Facturación anual única",
        ],
      },
      {
        plan: "B2B",
        name: "Equipos",
        prices: { monthly: 120, currency: "USD" },
        description:
          "Para instituciones, clínicas y equipos de hasta 50 usuarios.",
        features: [
          "Todo lo incluido en Pro",
          "Hasta 50 usuarios por cuenta",
          "Panel de administración",
          "Reportes de progreso del equipo",
          "Integración con plataformas institucionales",
          "Soporte dedicado",
        ],
      },
    ];
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

  // ─── Checkout Session ──────────────────────────────────────────────────────

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

  // ─── Billing Portal ────────────────────────────────────────────────────────

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

  // ─── My Subscription ───────────────────────────────────────────────────────

  async getMySubscription(userId: string) {
    return this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        id: true,
        plan: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

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
    // In Stripe API 2026-04-22+, billing period fields moved from Subscription to SubscriptionItem
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

  // ─── Helpers ──────────────────────────────────────────────────────────────

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
}
