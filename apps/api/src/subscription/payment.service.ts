import { Inject, Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { InvoiceSummary } from "@psico/types";
import { PURCHASES_CLOSED_CODE, PURCHASES_CLOSED_MESSAGE } from "@psico/types";
import type { Env } from "../config";
import { ExpectedUnavailableException } from "../shared/filters/expected-unavailable.exception";
import type { PurchaseGate } from "../shared/purchase-availability";
import { resolvePurchaseGate } from "../shared/purchase-availability";
import type { BillingPlan } from "./dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "./dto/create-portal-session.dto";
import { ProviderCapabilityUnsupportedError } from "./provider-errors";
import type {
  CancelSubscriptionResult,
  CheckoutSessionResult,
  IPaymentProvider,
  PortalSessionResult,
  ReactivateSubscriptionResult,
  TherapyCheckoutOpts,
  TherapyCheckoutResult,
} from "./providers/payment-provider.interface";
import {
  PAYPHONE_PROVIDER,
  STRIPE_PROVIDER,
} from "./providers/provider-tokens";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(STRIPE_PROVIDER) private readonly stripeProvider: IPaymentProvider,
    @Inject(PAYPHONE_PROVIDER)
    private readonly payphoneProvider: IPaymentProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ─── Provider selection ────────────────────────────────────────────────────

  /**
   * Selects the active payment provider.
   *
   * Phase 1: always returns Stripe — DEFAULT_PAYMENT_PROVIDER=stripe.
   * Phase 2: switch to PayphoneProvider for Ecuadorian users when
   *          DEFAULT_PAYMENT_PROVIDER=payphone or when country logic
   *          is added here.
   */
  selectProvider(): IPaymentProvider {
    const defaultProvider = this.config.get("DEFAULT_PAYMENT_PROVIDER", {
      infer: true,
    });

    if (defaultProvider === "payphone") {
      this.logger.debug(
        "Using PayphoneProvider (DEFAULT_PAYMENT_PROVIDER=payphone)",
      );
      return this.payphoneProvider;
    }

    return this.stripeProvider;
  }

  // ─── Delegation ────────────────────────────────────────────────────────────

  /**
   * ÚNICO punto por el que se crea un checkout de plan, y por eso la puerta
   * está aquí.
   *
   * Las dos rutas existentes —`/api/subscriptions/checkout` (legada) y
   * `/api/billing/checkout-session`— delegan en `SubscriptionService`, que
   * delega aquí; y este método es el único que llama a
   * `provider.createCheckoutSession`. Poner la guarda un nivel más arriba
   * dejaría sin cubrir a cualquier llamante futuro de este servicio.
   *
   * El orden importa: se rechaza ANTES de `selectProvider()`, así que no se
   * crea ningún cliente en el proveedor, no se guarda ningún identificador y
   * no se hace ninguna llamada a su API. La implementación de Stripe empieza
   * con `getOrCreateStripeCustomer`, que escribe en nuestra base: una guarda
   * dentro del proveedor llegaría tarde.
   */
  createCheckoutSession(
    userId: string,
    billingPlan: BillingPlan,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CheckoutSessionResult> {
    this.assertPurchasesOpen();
    return this.selectProvider().createCheckoutSession(
      userId,
      billingPlan,
      successUrl,
      cancelUrl,
    );
  }

  /** La puerta de las compras de planes, resuelta con el criterio compartido. */
  purchaseGate(): PurchaseGate {
    return resolvePurchaseGate(
      this.config.get("BILLING_PURCHASES", { infer: true }),
    );
  }

  /**
   * 503 declarado: no es un fallo, es la respuesta. `ExpectedUnavailableException`
   * evita que el filtro global lo trate como un 5xx inesperado y llene el
   * registro y Sentry con la misma traza.
   *
   * El `code` es el estable; el `message` va en castellano porque hay clientes
   * que lo pintan tal cual — reenviar el código pondría `PURCHASES_CLOSED` en
   * un diálogo, que es el defecto que ya cometimos una vez con Eco.
   */
  private assertPurchasesOpen(): void {
    if (this.purchaseGate().open) return;
    throw new ExpectedUnavailableException({
      code: PURCHASES_CLOSED_CODE,
      message: PURCHASES_CLOSED_MESSAGE,
    });
  }

  createPortalSession(
    userId: string,
    dto: CreatePortalSessionDto,
  ): Promise<PortalSessionResult> {
    return this.selectProvider().createPortalSession(userId, dto);
  }

  handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    return this.selectProvider().handleWebhook(rawBody, signature);
  }

  // ─── Sprint S66.A ─────────────────────────────────────────────────────────

  createTherapyCheckout(
    opts: TherapyCheckoutOpts,
  ): Promise<TherapyCheckoutResult> {
    return this.selectProvider().createTherapyCheckout(opts);
  }

  // ─── Sprint S7 ─────────────────────────────────────────────────────────────

  listInvoices(userId: string, limit: number): Promise<InvoiceSummary[]> {
    return this.selectProvider().listInvoices(userId, limit);
  }

  cancelAtPeriodEnd(
    userId: string,
    reason?: string,
  ): Promise<CancelSubscriptionResult> {
    return this.selectProvider().cancelAtPeriodEnd(userId, reason);
  }

  reactivate(userId: string): Promise<ReactivateSubscriptionResult> {
    return this.selectProvider().reactivate(userId);
  }

  /**
   * Sprint S11. Reads the status of a Stripe Checkout session so the front
   * can render the `/dashboard/plan/success` page without polling.
   *
   * Throws if the active provider does not implement `getCheckoutSessionStatus`
   * — today only Stripe does. Payphone redirects through its own protocol
   * and never reaches `/api/billing/return`, so we keep this method
   * provider-bound rather than synthesising a fake status.
   */
  getCheckoutSessionStatus(
    sessionId: string,
    userId: string,
  ): Promise<{
    status: "success" | "processing" | "failed";
    subscriptionId: string | null;
  }> {
    const provider = this.selectProvider();
    if (!provider.getCheckoutSessionStatus) {
      // Señal específica, no un `Error` cuyo texto haya que reconocer después.
      throw new ProviderCapabilityUnsupportedError(
        provider.name,
        "checkout_session_lookup",
      );
    }
    // El `userId` viaja hasta el proveedor porque la comprobación de
    // pertenencia sólo puede hacerla quien tiene la sesión delante.
    return provider.getCheckoutSessionStatus(sessionId, userId);
  }
}
