import { Injectable } from "@nestjs/common";
import type {
  CancelSubscriptionResponse,
  InvoiceListResponse,
  ReactivateSubscriptionResponse,
  UsageResponse,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import type { BillingPlan } from "./dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "./dto/create-portal-session.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaymentService } from "./payment.service";
import { PLAN_QUOTAS } from "./quotas";
import type {
  CheckoutSessionResult,
  PortalSessionResult,
} from "./providers/payment-provider.interface";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UsageService } from "./usage.service";

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
    private readonly usageService: UsageService,
  ) {}

  // ─── Plans (provider-agnostic) ────────────────────────────────────────────

  /**
   * Lo que incluye cada plan, y SÓLO lo que el servidor aplica de verdad.
   *
   * Cada línea de `features` tiene detrás una regla comprobable, que es la que
   * fija `subscription.plans.spec.ts`:
   *
   *   - lectura → `isContentLockedByPlan`: los libros FREE se leen enteros; de
   *     los PRO, el primer capítulo;
   *   - audio y podcast → `LectorService.getAudio` y la política `PRO_ONLY` de
   *     los medios. «Que lo tengan publicado» no es un adorno: es la segunda
   *     condición, y hoy la mayoría no lo tiene;
   *   - Patrones → `PatronesService` (FREE recibe `locked`);
   *   - dictado → `PLAN_QUOTAS.*.voice` (FREE: 0).
   *
   * Se retiró lo que no tenía nada detrás: meditaciones en audio (no hay
   * ninguna), «diario personal con IA» (el diario es de extremo a extremo y la
   * IA no lo lee), soporte por correo, prioritario y dedicado (no hay canal ni
   * procedimiento de atención), «2 meses gratis» ($59 frente a 12 × $7 no son
   * dos meses), y las funciones de equipo del plan B2B (no existen cuentas de
   * equipo: ADR 0011, multi-rol sin multi-tenant).
   *
   * Eco no figura como ventaja de Pro a propósito: FREE tiene 10 mensajes por
   * día y Pro, 200 por periodo. Presentarlo como «más» sería falso.
   */
  getPlans(): PlanInfo[] {
    return [
      {
        plan: "FREE",
        name: "Gratuito",
        prices: { currency: "USD" },
        description: "Acceso básico a contenido psicoeducativo seleccionado.",
        features: [
          "Lectura completa de los libros gratuitos",
          "El primer capítulo de los libros Pro",
          "Ejercicios de respiración y reflexión",
          "Progreso guardado",
        ],
      },
      {
        plan: "PRO",
        name: "Pro",
        prices: { monthly: 7, yearly: 59, currency: "USD" },
        description: "Lectura de todos los libros y capítulos publicados.",
        features: [
          "Todo lo incluido en Gratuito",
          "Todos los capítulos de los libros Pro, a medida que se publiquen",
          "El audio y el podcast de los capítulos que los tengan publicados",
          "Patrones de tus reflexiones y resumen de tu semana",
          `Dictado por voz, hasta ${PLAN_QUOTAS.PRO.voice} minutos por periodo`,
        ],
      },
      {
        plan: "ANNUAL",
        name: "Pro Anual",
        prices: { yearly: 59, currency: "USD" },
        description:
          "El plan Pro con pago anual — $59/año (equivale a $4.92/mes).",
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
          "Propuesta para instituciones y equipos. Todavía no hay cuentas de equipo.",
        features: [
          "Todo lo incluido en Pro",
          "Mensajes con Eco y dictado por voz sin límite",
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
        userId: true,
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

  // ─── Sprint S7: usage + invoices + cancel + reactivate ────────────────────

  /**
   * Aggregated consumption for the current billing period. Caches in Redis
   * for 5 minutes — see UsageService docs for cache key + invalidation.
   */
  getUsage(userId: string): Promise<UsageResponse> {
    return this.usageService.getUsage(userId);
  }

  /**
   * Most recent invoices from Stripe (no local cache; Stripe is fast enough
   * and the back-pressure of caching invoice state is not worth the staleness
   * risk if a refund or void slips by).
   */
  async listInvoices(
    userId: string,
    limit: number,
  ): Promise<InvoiceListResponse> {
    const invoices = await this.paymentService.listInvoices(userId, limit);
    return { invoices };
  }

  async cancel(
    userId: string,
    reason: string | undefined,
  ): Promise<CancelSubscriptionResponse> {
    const result = await this.paymentService.cancelAtPeriodEnd(userId, reason);
    // Bust the usage cache so the Mi Plan banner switches immediately.
    await this.usageService.invalidate(userId);
    return {
      ok: true,
      cancelAtPeriodEnd: true,
      effectiveAt: result.effectiveAt,
    };
  }

  async reactivate(userId: string): Promise<ReactivateSubscriptionResponse> {
    await this.paymentService.reactivate(userId);
    await this.usageService.invalidate(userId);
    return { ok: true, cancelAtPeriodEnd: false };
  }
}
