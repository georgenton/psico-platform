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

/**
 * ¿Este fallo del `create` significa «ya existía»?
 *
 * Prisma marca la violación de clave única con `P2002`. Se comprueba por
 * forma y no con `instanceof PrismaClientKnownRequestError`, porque ese
 * símbolo no sobrevive a los dobles que usan las pruebas y un `instanceof`
 * que siempre es falso convertiría la guarda en «relanza todo».
 */
function esViolacionDeUnicidad(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/**
 * Estados de los que una suscripción no vuelve.
 *
 * Uno solo sirve a dos preguntas que antes se contestaban por separado y mal:
 * qué plan corresponde —una suscripción terminada no da derecho aunque
 * conserve su precio— y si su sitio sigue ocupado. `incomplete_expired` entra
 * aquí; nuestro enum no tiene valor propio para él y lo recoge en INCOMPLETE,
 * de modo que decidir con el enum dejaba el sitio bloqueado por una
 * suscripción muerta.
 */
function isTerminalStripeStatus(status: StripeSubscription["status"]): boolean {
  return status === "canceled" || status === "incomplete_expired";
}

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
    } catch (err) {
      // SÓLO la violación de unicidad significa «ya estaba reclamado».
      //
      // El `catch` ciego trataba cualquier fallo como tal, y entonces la fila
      // NO existe: `findUnique` devuelve null, `previo?.processedAt` es
      // undefined, no se corta, se registra «un intento anterior no terminó»
      // —que es falso, nadie reclamó—, se aplica el efecto y el `update`
      // final lanza P2025 porque no hay fila que actualizar.
      //
      // El disparador no es hipotético: el `create` manda `processedAt: null`
      // explícito, y contra el esquema anterior (`NOT NULL`, sin default)
      // Postgres responde 23502. El runbook documenta, con medida, que el
      // `pre_deployment_command` se omite cuando no hay contenedor previo y
      // el despliegue acaba en «finished» igual. En ese estado cada webhook
      // aplicaría el efecto, devolvería 500, Stripe reintentaría, y así
      // indefinidamente sin dejar una sola fila que lo registre.
      if (!esViolacionDeUnicidad(err)) throw err;
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
      // Los tres van al mismo sitio: ninguno aporta estado por sí mismo, sólo
      // dice que algo cambió. Una baja es una relectura que devuelve
      // `canceled`, así que no necesita su propio camino — y tener dos
      // caminos era parte del problema, porque el de la baja degradaba por
      // `userId` sin mirar de qué suscripción venía.
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.applySubscriptionEvent(
          event.data.object as StripeSubscription,
        );
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
   * D-ORD · Aplica el estado de una suscripción leyéndolo de Stripe, dentro
   * de un candado por persona.
   *
   * ── Por qué no se aplica el objeto del evento ─────────────────────────────
   *
   * El contrato anterior aplicaba `event.data.object` tal cual, con un upsert
   * que no comparaba nada. Stripe advierte que sus eventos **no llegan en
   * orden**, así que una reentrega tardía de un `active` después de una baja
   * devolvía a la persona a PRO.
   *
   * La tentación es ordenar por `event.created` y descartar lo viejo. La
   * documentación de Stripe lo desaconseja de forma explícita: «Snapshot
   * events record `created` in seconds, so distinct events can share a
   * timestamp. Don't use `created` to determine event order or whether you've
   * already processed an event.» Un reloj en segundos no ordena los hechos, y
   * el id del evento tampoco — no es monótono y Stripe no lo promete.
   *
   * Lo que la misma página sí recomienda es releer el objeto: «You can also
   * use the API to retrieve any missing objects.» El evento pasa a ser
   * únicamente la señal de que algo cambió; el estado lo dice
   * `subscriptions.retrieve`.
   *
   * ── Por qué además hace falta un candado ──────────────────────────────────
   *
   * Releer no basta por sí solo, y conviene decir exactamente por qué: dos
   * eventos DISTINTOS del mismo cliente pueden entregarse a la vez. Sin
   * serializar, esta intercalación es posible y pierde la escritura buena:
   *
   *   A relee → «activa»
   *   B relee → «cancelada» · B escribe FREE
   *   A escribe PRO con su lectura ya vieja
   *
   * No lo impide la unicidad del evento —son eventos distintos— ni la
   * relectura —A leyó bien, sólo que antes—. Lo impide serializar la lectura
   * y la escritura sobre el recurso en disputa, que es la fila de suscripción
   * de ESA persona: `pg_advisory_xact_lock` sobre su `userId`, tomado al
   * principio de la transacción y liberado al terminarla. Con él, B no puede
   * leer hasta que A haya confirmado, de modo que la segunda lectura ya ve lo
   * que la primera escribió.
   *
   * El candado va por `userId` y no por suscripción porque el recurso en
   * disputa es el hueco de la persona: un evento tardío de `sub_vieja` y uno
   * nuevo de `sub_nueva` compiten por la misma fila, y un candado por
   * suscripción no los serializaría entre sí.
   *
   * Se libera solo. `pg_advisory_xact_lock` muere con la transacción, así que
   * un proceso que se cae no deja a nadie esperando.
   *
   * Si la relectura falla, el método lanza. La fila del evento sigue sin
   * `processedAt`, el webhook responde distinto de 2xx y Stripe reintenta: es
   * preferible repetir a aplicar un estado inventado.
   */
  private async applySubscriptionEvent(
    delEvento: StripeSubscription,
  ): Promise<void> {
    const userId = delEvento.metadata["userId"];
    if (!userId) {
      this.logger.warn(
        `Stripe subscription ${delEvento.id} has no userId in metadata`,
      );
      return;
    }

    await this.prisma.$transaction(
      async (tx) => {
        // Serializa a todos los manejadores de ESTA persona. Lo primero, para
        // que la relectura de Stripe ocurra ya dentro del candado.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing:${userId}`}))`;

        const sub = await this.stripe.subscriptions.retrieve(delEvento.id);

        // Identidad: un evento de una suscripción ANTERIOR no toca la vigente.
        // Sin esto, la baja tardía de `sub_A` degradaría a quien ya paga con
        // `sub_B`. Se lee DENTRO de la transacción y del candado, así que la
        // comprobación sigue siendo válida en el momento de escribir.
        //
        // Pero «¿sigue viva la guardada?» NO se contesta con nuestra fila. La
        // primera versión lo hacía y perdía un alta legítima para siempre:
        //
        //   local  : sub_vieja ACTIVE (por detrás de Stripe)
        //   Stripe : sub_vieja cancelada, sub_nueva activa
        //
        // El alta de `sub_nueva` se descartaba por «sitio ocupado», el webhook
        // la sellaba como procesada, la baja posterior dejaba FREE y la
        // reentrega ya no la recuperaba. Quien acababa de pagar se quedaba sin
        // plan, en silencio.
        //
        // Y el enum local tampoco sirve de atajo: `incomplete_expired` es
        // terminal en Stripe y aquí cae en INCOMPLETE, así que una suscripción
        // muerta seguía bloqueando el sitio.
        //
        // Así que cuando la entrante es OTRA, se relee también la guardada.
        // Una lectura de más, sólo en el caso divergente, a cambio de decidir
        // con estado autoritativo por los dos lados.
        // La persona tiene que seguir existiendo, y esto va ANTES de
        // cualquier escritura.
        //
        // El processor de baja de cuenta borra el `User` a los 30 días y la
        // fila `Subscription` cae por cascade, pero NO cancela nada en
        // Stripe: los eventos siguen llegando. Sin esta comprobación, el
        // `upsert` entra por su rama `create`, viola la clave ajena, la
        // transacción revierte y la reclamación queda con `processedAt` NULL
        // PARA SIEMPRE — Stripe reintenta tres días y se rinde.
        //
        // Eso inutilizaba la precondición del rollback que esta misma
        // migración documenta. Y no es un error del sistema: no hay nada que
        // aplicar, así que es un resultado, se registra y el evento se sella.
        const persona = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!persona) {
          this.logger.warn(
            `Stripe event for subscription ${sub.id} references user ${userId}, which no longer exists: nothing to apply`,
          );
          return;
        }

        const vigente = await tx.subscription.findUnique({
          where: { userId },
          select: { stripeSubscriptionId: true },
        });
        if (vigente && vigente.stripeSubscriptionId !== sub.id) {
          // Si esto lanza no se decide a ciegas: la transacción revierte, el
          // evento no se sella y Stripe reintenta.
          const guardada = await this.stripe.subscriptions.retrieve(
            vigente.stripeSubscriptionId,
          );
          // Las dos vivas: gana la MÁS NUEVA.
          //
          // «¿Sigue viva la guardada?» no bastaba como pregunta. Una mejora
          // de plan deja viva la anterior mientras Stripe no la cancele —y
          // tanto la app como el servidor permiten contratar estando ya
          // suscrito—, así que el alta recién pagada se descartaba por
          // «sitio ocupado» y el webhook la sellaba. Quien acababa de pagar
          // se quedaba en su plan anterior, y ni el reintento ni la
          // renovación del año siguiente lo arreglaban.
          //
          // `created` es una propiedad del OBJETO, releída con autoridad de
          // Stripe en esta misma transacción. No es ordenar eventos por su
          // fecha —eso Stripe lo desaconseja y con razón—: es preguntar cuál
          // de dos suscripciones nació después.
          //
          // Empate exacto: se queda la guardada. Arbitrario pero estable, y
          // preferible a que el resultado dependa de cuál llegue primero.
          const guardadaViva = !isTerminalStripeStatus(guardada.status);
          const entranteEsPosterior = sub.created > guardada.created;
          if (guardadaViva && !entranteEsPosterior) {
            this.logger.log(
              `Ignoring Stripe event for superseded subscription ${sub.id}: user ${userId} now holds ${vigente.stripeSubscriptionId} (${guardada.status})`,
            );
            return;
          }
          // Lo que esto NO hace: cancelar la anterior en Stripe. Nuestro
          // registro pasa a seguir a la más nueva y la vieja sigue donde
          // estaba, porque cancelar una suscripción es un acto comercial y
          // un manejador de webhooks no es quien lo decide. Si queda viva
          // cobrando, eso se ve en Stripe y se resuelve allí; aquí se deja
          // dicho para que nadie lo lea como «ya está cerrada».
          this.logger.log(
            `Replacing ${vigente.stripeSubscriptionId} (${guardada.status}) with ${sub.id} for user ${userId}` +
              (guardadaViva
                ? " — la entrante es posterior; la anterior NO se cancela desde aquí"
                : ""),
          );
        }

        const firstItem = sub.items.data[0];
        const priceId = firstItem?.price.id ?? "";
        const status = this.mapStripeStatus(sub.status);
        // El precio dice qué se compró; el estado dice si da derecho hoy. Una
        // suscripción terminada conserva su `price`, así que derivar el plan
        // sólo del precio devolvía PRO a quien ya no lo tiene.
        const plan = isTerminalStripeStatus(sub.status)
          ? Plan.FREE
          : this.mapPriceIdToPlan(priceId);
        // In Stripe API 2026-04-22+, billing period fields moved to SubscriptionItem
        const periodStart = new Date(
          (firstItem?.current_period_start ?? sub.start_date) * 1000,
        );
        const periodEnd = new Date(
          (firstItem?.current_period_end ?? sub.billing_cycle_anchor) * 1000,
        );

        await tx.subscription.upsert({
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
        });
        await tx.user.update({ where: { id: userId }, data: { plan } });

        this.logger.log(
          `Synced subscription ${sub.id} for user ${userId}: plan=${plan}, status=${status}`,
        );
      },
      // La relectura de Stripe ocurre dentro, así que el plazo contempla una
      // llamada de red. Si se agota, la transacción revierte, el candado se
      // suelta y Stripe reintenta.
      { timeout: 20_000, maxWait: 10_000 },
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
