import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import type { BillingPlan } from "./dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "./dto/create-portal-session.dto";
import type { PaymentService } from "./payment.service";
import type {
  CheckoutSessionResult,
  PortalSessionResult,
} from "./providers/payment-provider.interface";

export interface PlanInfo {
  plan: "FREE" | "PRO" | "ANNUAL" | "B2B";
  name: string;
  prices: { monthly?: number; yearly?: number; currency: string };
  description: string;
  features: string[];
}

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  // ─── Plans (provider-agnostic) ────────────────────────────────────────────

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

  // ─── Subscription read (provider-agnostic) ────────────────────────────────

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

  // ─── Payment delegation ───────────────────────────────────────────────────

  createCheckoutSession(
    userId: string,
    billingPlan: BillingPlan,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CheckoutSessionResult> {
    return this.paymentService.createCheckoutSession(
      userId,
      billingPlan,
      successUrl,
      cancelUrl,
    );
  }

  createPortalSession(
    userId: string,
    dto: CreatePortalSessionDto,
  ): Promise<PortalSessionResult> {
    return this.paymentService.createPortalSession(userId, dto);
  }

  handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    return this.paymentService.handleWebhook(rawBody, signature);
  }
}
