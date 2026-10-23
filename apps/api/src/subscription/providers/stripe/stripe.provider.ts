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
import {
  aExcepcionSegura,
  clasificarErrorDeProveedor,
} from "../../provider-errors";
import type { BillingPlan } from "../../dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "../../dto/create-portal-session.dto";
import type {
  CancelSubscriptionResult,
  CheckoutSessionResult,
  IPaymentProvider,
  PortalSessionResult,
  ReactivateSubscriptionResult,
  TherapyCheckoutOpts,
  TherapyCheckoutResult,
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
// checkout.session.completed event payload — Stripe v22 CJS doesn't expose
// `Stripe.Checkout.Session` as a usable type, so we derive it like invoices.
type StripeCheckoutSession = Awaited<
  ReturnType<StripeInstance["checkout"]["sessions"]["retrieve"]>
>;

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

  // ─── Sprint S66.A — one-time therapy payment ─────────────────────────────

  async createTherapyCheckout(
    opts: TherapyCheckoutOpts,
  ): Promise<TherapyCheckoutResult> {
    const stripeCustomerId = await this.getOrCreateStripeCustomer(opts.userId);

    const amountInCents = Math.round(opts.priceUsd * 100);

    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: opts.currency.toLowerCase(),
            unit_amount: amountInCents,
            product_data: {
              name: opts.productName,
            },
          },
          quantity: 1,
        },
      ],
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      metadata: {
        userId: opts.userId,
        kind: "therapy_booking",
        sessionId: opts.sessionId,
      },
      payment_intent_data: {
        metadata: {
          userId: opts.userId,
          kind: "therapy_booking",
          sessionId: opts.sessionId,
        },
      },
    });

    if (!session.url) {
      throw new BadRequestException(
        "Failed to create therapy checkout session",
      );
    }

    return { url: session.url, stripeCheckoutSessionId: session.id };
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

  async getCheckoutSessionStatus(
    sessionId: string,
    userId: string,
  ): Promise<{
    status: "success" | "processing" | "failed";
    subscriptionId: string | null;
  }> {
    // We expand `subscription` so the consuming service can decide on the
    // human-readable message without an extra round-trip — Stripe charges
    // the same regardless of expand depth.
    // El SDK puede fallar de varias formas y ninguna debe llegar cruda al
    // cliente: su `message` puede traer el identificador consultado o detalles
    // de la cuenta. Se clasifica por estado y tipo declarados, nunca por texto.
    let session: Awaited<
      ReturnType<StripeInstance["checkout"]["sessions"]["retrieve"]>
    >;
    try {
      session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });
    } catch (err) {
      throw aExcepcionSegura(clasificarErrorDeProveedor(err));
    }

    // La sesión se pide por un identificador que viaja en la URL de retorno,
    // así que llega desde el navegador y no prueba nada por sí mismo. Sin esta
    // comprobación, cualquiera con una sesión ajena recibía su estado: el
    // endpoint respondía sobre un objeto que no es suyo, y el mensaje que ve
    // la persona se compone a partir de ese estado.
    //
    // La sesión se crea con `metadata.userId` —tanto la de suscripción como la
    // de pago único—, de modo que la pertenencia se comprueba contra lo que el
    // propio proveedor guardó, no contra algo que nosotros reconstruyamos.
    //
    // Se responde «no existe» y no «no es tuya»: distinguirlas confirmaría que
    // el identificador es válido, que es justo lo que no se quiere revelar.
    // Sesión ajena y sesión sin dueño declarado reciben EXACTAMENTE la misma
    // respuesta que una inexistente —el mismo molde, no una copia parecida—,
    // porque cualquier diferencia confirmaría que el identificador es válido.
    if (session.metadata?.userId !== userId) {
      throw aExcepcionSegura("not_found");
    }

    // Stripe's payment_status disambiguates the three cases we care about:
    // - "paid" → user got Pro right now.
    // - "unpaid" with status == "open" → async payment method still settling.
    // - "no_payment_required" + status "complete" → free trial captured.
    // - status "expired" → user abandoned the checkout window.
    if (session.status === "expired" || session.payment_status === "unpaid") {
      if (session.status === "expired") {
        return { status: "failed", subscriptionId: null };
      }
      // unpaid + not expired = still processing (async methods).
      return {
        status: "processing",
        subscriptionId:
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null),
      };
    }

    return {
      status: "success",
      subscriptionId:
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null),
    };
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

    // D-ORD · Se reclama ANTES de aplicar y se marca terminado DESPUÉS.
    //
    // Antes era `findUnique` y luego `create`: comprobar y actuar en dos
    // tiempos. Dos entregas simultáneas del mismo evento pasaban las dos la
    // comprobación, y una entrega que moría a mitad dejaba la fila escrita
    // como procesada aunque su efecto no se hubiera aplicado — se perdía sin
    // que nada lo dijera.
    //
    // Ahora la unicidad de `stripeEventId` resuelve la carrera, y
    // `processedAt` nulo distingue «reclamado» de «terminado»: un reintento
    // sobre una reclamación inconclusa vuelve a aplicarlo, que es justo lo
    // que pide una recuperación tras fallo parcial.
    let reclamado = true;
    try {
      await this.prisma.stripeEvent.create({
        data: { stripeEventId: event.id, type: event.type, processedAt: null },
      });
    } catch {
      reclamado = false;
    }

    if (!reclamado) {
      const previo = await this.prisma.stripeEvent.findUnique({
        where: { stripeEventId: event.id },
      });
      if (previo?.processedAt) {
        this.logger.log(`Skipping already-processed Stripe event: ${event.id}`);
        return;
      }
      // Reclamado por un intento que no terminó. Se reaplica: el estado se
      // lee de Stripe, así que repetirlo converge al mismo sitio.
      this.logger.warn(
        `Reapplying Stripe event ${event.id}: a previous attempt did not finish`,
      );
    }

    // Si esto lanza, la fila queda con `processedAt` nulo y Stripe reintenta.
    await this.processEvent(event);

    await this.prisma.stripeEvent.update({
      where: { stripeEventId: event.id },
      data: { processedAt: new Date() },
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

      case "checkout.session.completed":
        await this.handleCheckoutCompleted(
          event.data.object as StripeCheckoutSession,
        );
        break;

      case "checkout.session.expired":
        await this.handleCheckoutExpired(
          event.data.object as StripeCheckoutSession,
        );
        break;

      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  /**
   * Sprint S66.A — branch the checkout.session.completed event by metadata.
   *
   * The subscription flow handles itself via customer.subscription.created
   * (Stripe fires both when a subscription Checkout completes). For
   * one-time therapy bookings we update the TherapySession row to PAID.
   */
  private async handleCheckoutCompleted(
    session: StripeCheckoutSession,
  ): Promise<void> {
    if (session.metadata?.["kind"] !== "therapy_booking") {
      // Subscription flow — owned by customer.subscription.created.
      return;
    }
    const therapySessionId = session.metadata["sessionId"];
    if (!therapySessionId) {
      this.logger.warn(
        `therapy_booking checkout ${session.id} has no sessionId metadata`,
      );
      return;
    }
    // Idempotent: subsequent firings of the same webhook just no-op.
    await this.prisma.therapySession.updateMany({
      where: {
        id: therapySessionId,
        paymentStatus: "PENDING",
      },
      data: {
        paymentStatus: "PAID",
        stripeCheckoutSessionId: session.id,
      },
    });
    this.logger.log(
      `TherapySession ${therapySessionId} marked PAID via checkout ${session.id}`,
    );
  }

  private async handleCheckoutExpired(
    session: StripeCheckoutSession,
  ): Promise<void> {
    if (session.metadata?.["kind"] !== "therapy_booking") return;
    const therapySessionId = session.metadata["sessionId"];
    if (!therapySessionId) return;
    await this.prisma.therapySession.updateMany({
      where: {
        id: therapySessionId,
        paymentStatus: "PENDING",
      },
      data: {
        paymentStatus: "FAILED",
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });
    this.logger.log(
      `TherapySession ${therapySessionId} CANCELLED (checkout expired ${session.id})`,
    );
  }

  /**
   * D-ORD · Aplica el estado de una suscripción leyéndolo de Stripe, no del
   * evento.
   *
   * El contrato anterior aplicaba `event.data.object` tal cual, con un upsert
   * que no comparaba nada. Stripe advierte que sus eventos **no llegan en
   * orden**, así que una reentrega tardía de un `active` después de una baja
   * devolvía a la persona a PRO. Estaba documentado como hallazgo en
   * `billing-events.pg-spec.ts`, con una prueba que afirmaba ese resultado.
   *
   * La tentación es ordenar por `event.created` y descartar lo viejo. La
   * documentación de Stripe lo desaconseja de forma explícita: «Snapshot
   * events record `created` in seconds, so distinct events can share a
   * timestamp. Don't use `created` to determine event order or whether you've
   * already processed an event.» Un reloj en segundos no ordena los hechos, y
   * el id del evento tampoco — no es monótono y Stripe no lo promete.
   *
   * Lo que la misma página sí recomienda es releer el objeto: «You can also
   * use the API to retrieve any missing objects.» Eso es lo que se hace aquí.
   * El evento pasa a ser únicamente la señal de que algo cambió; el estado lo
   * dice `subscriptions.retrieve`, que devuelve la verdad actual sea cual sea
   * el evento que nos despertó. Con eso, el orden de llegada deja de importar,
   * los empates temporales dejan de ser un caso —no se compara ningún
   * reloj— y una reentrega vieja converge al mismo sitio que una nueva.
   *
   * Si la relectura falla, el método lanza. La fila del evento sigue sin
   * `processedAt`, el webhook responde distinto de 2xx y Stripe reintenta: es
   * preferible repetir a aplicar un estado inventado.
   */
  private async syncSubscription(delEvento: StripeSubscription): Promise<void> {
    const sub = await this.stripe.subscriptions.retrieve(delEvento.id);
    await this.applySubscription(sub, delEvento);
  }

  /** Escribe el estado YA releído de Stripe. No vuelve a consultar. */
  private async applySubscription(
    sub: StripeSubscription,
    delEvento: StripeSubscription,
  ): Promise<void> {
    const userId = sub.metadata["userId"] ?? delEvento.metadata["userId"];
    if (!userId) {
      this.logger.warn(
        `Stripe subscription ${sub.id} has no userId in metadata`,
      );
      return;
    }

    // Identidad: un evento de una suscripción ANTERIOR no toca la vigente.
    // Sin esto, la baja tardía de `sub_A` degradaría a quien ya está pagando
    // con `sub_B`.
    //
    // La excepción es que la guardada esté terminada: una suscripción muerta
    // no ocupa el sitio, y quien vuelve a contratar tiene que poder sustituirla.
    // Sin esta salvedad, la primera versión de la guarda dejaba en FREE a
    // alguien que acababa de pagar — lo detectó la prueba de este mismo caso.
    const vigente = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { stripeSubscriptionId: true, status: true },
    });
    const sitioOcupado =
      vigente !== null && vigente.status !== SubscriptionStatus.CANCELED;
    if (vigente && vigente.stripeSubscriptionId !== sub.id && sitioOcupado) {
      this.logger.log(
        `Ignoring Stripe event for superseded subscription ${sub.id}: user ${userId} now holds ${vigente.stripeSubscriptionId}`,
      );
      return;
    }

    const firstItem = sub.items.data[0];
    const priceId = firstItem?.price.id ?? "";
    const status = this.mapStripeStatus(sub.status);
    // El precio dice qué se compró; el estado dice si da derecho hoy. Una
    // suscripción terminada conserva su `price`, así que derivar el plan sólo
    // del precio devolvía PRO a quien ya no lo tiene.
    const terminada =
      sub.status === "canceled" || sub.status === "incomplete_expired";
    const plan = terminada ? Plan.FREE : this.mapPriceIdToPlan(priceId);
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

  /**
   * D-ORD · La baja también se comprueba contra Stripe y contra la identidad.
   *
   * Antes degradaba a FREE por `userId`, con un `updateMany` que no miraba de
   * QUÉ suscripción venía el evento. Una baja tardía de una suscripción ya
   * sustituida quitaba el plan a quien había vuelto a pagar con otra.
   */
  private async cancelSubscription(
    delEvento: StripeSubscription,
  ): Promise<void> {
    const sub = await this.stripe.subscriptions.retrieve(delEvento.id);
    const userId = sub.metadata["userId"] ?? delEvento.metadata["userId"];
    if (!userId) return;

    const vigente = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { stripeSubscriptionId: true, status: true },
    });
    if (vigente && vigente.stripeSubscriptionId !== sub.id) {
      this.logger.log(
        `Ignoring cancellation of superseded subscription ${sub.id}: user ${userId} now holds ${vigente.stripeSubscriptionId}`,
      );
      return;
    }

    // Y se relee el estado: si entre el evento y este momento la suscripción
    // volvió a estar activa, degradar sería aplicar una foto vieja.
    if (sub.status !== "canceled" && sub.status !== "incomplete_expired") {
      this.logger.log(
        `Not downgrading ${userId}: subscription ${sub.id} is ${sub.status} in Stripe`,
      );
      await this.applySubscription(sub, delEvento);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.subscription.updateMany({
        where: { userId, stripeSubscriptionId: sub.id },
        data: { status: SubscriptionStatus.CANCELED, plan: Plan.FREE },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { plan: Plan.FREE },
      }),
    ]);

    this.logger.log(
      `Canceled subscription ${sub.id} for user ${userId} — downgraded to FREE`,
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
