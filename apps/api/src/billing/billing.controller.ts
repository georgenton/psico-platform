import type { RawBodyRequest } from "@nestjs/common";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiNotImplementedResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import type { Request } from "express";

import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../shared";
import { CancelSubscriptionDto } from "../subscription/dto/cancel-subscription.dto";
import { CreateCheckoutSessionDto } from "../subscription/dto/checkout-session.dto";
import { CreatePortalSessionDto } from "../subscription/dto/create-portal-session.dto";
import { ListInvoicesQueryDto } from "../subscription/dto/list-invoices-query.dto";
import { SubscriptionService } from "../subscription/subscription.service";
import { BillingService } from "./billing.service";
import { PatchSubscriptionDto } from "./dto/patch-subscription.dto";
import { BillingReturnQueryDto } from "./dto/return-query.dto";

/**
 * /api/billing/* — the canonical path matrix per design 09-plan.md.
 *
 * Sprint S11 introduces this controller alongside the legacy
 * SubscriptionController (which keeps `/api/subscriptions/*` alive with
 * `Deprecation: true` headers for 90 days, per ADR 0006). Every handler
 * below delegates to the same SubscriptionService / BillingService methods
 * the legacy controller already uses — there is no behaviour drift.
 *
 * Endpoints (all under the global `/api` prefix):
 *
 *   GET   /billing/plans            — public catalog
 *   GET   /billing/me               — current subscription
 *   POST  /billing/checkout-session — start a Stripe Checkout
 *   POST  /billing/customer-portal  — Stripe billing portal redirect
 *   GET   /billing/usage            — counters
 *   GET   /billing/invoices         — recent invoices
 *   PATCH /billing/subscription     — consolidated cancel/reactivate/switch
 *   POST  /billing/cancel           — kept for backward-compat
 *   POST  /billing/reactivate       — kept for backward-compat
 *   GET   /billing/return           — Stripe success callback (new)
 *   POST  /billing/webhook          — Stripe webhook (same handler as legacy)
 */
@ApiTags("Billing")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@Controller("billing")
export class BillingController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly billingService: BillingService,
  ) {}

  // ── Public catalog ────────────────────────────────────────────────────────

  @Get("plans")
  getPlans() {
    return this.subscriptionService.getPlans();
  }

  // ── Authenticated reads ───────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get("me")
  getMySubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionService.getMySubscription(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("usage")
  getUsage(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionService.getUsage(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("invoices")
  listInvoices(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.subscriptionService.listInvoices(
      user.userId,
      query.limit ?? 12,
    );
  }

  // ── Stripe interaction ────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post("checkout-session")
  createCheckoutSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.subscriptionService.createCheckoutSession(
      user.userId,
      dto.billingPlan,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("customer-portal")
  createPortalSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePortalSessionDto,
  ) {
    return this.subscriptionService.createPortalSession(user.userId, dto);
  }

  /**
   * Callback the user's browser hits after Stripe Checkout. The front
   * passes back the `session_id` Stripe appended to `successUrl`.
   *
   * We do NOT mutate the user's plan here — the Stripe webhook is the
   * canonical write path. This handler just confirms the result so the
   * front can show success/processing/failed immediately without polling.
   */
  @UseGuards(JwtAuthGuard)
  // Los estados que esta ruta puede devolver ahora, declarados para que el
  // contrato no dependa de leer el servicio. Antes cualquier fallo salía como
  // 501; ahora se distinguen: 404 cuando la sesión no es suya o no existe
  // —misma respuesta a propósito—, 503 cuando el proveedor no está disponible,
  // 502 ante un error suyo inesperado, y 501 sólo si la forma de pago activa
  // no admite esta consulta.
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiServiceUnavailableResponse({ type: ErrorEnvelopeDto })
  @ApiBadGatewayResponse({ type: ErrorEnvelopeDto })
  @ApiNotImplementedResponse({ type: ErrorEnvelopeDto })
  @Get("return")
  getReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BillingReturnQueryDto,
  ) {
    return this.billingService.getReturn(user.userId, query.session_id);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Consolidated mutation per design — replaces /cancel + /reactivate.
   * The legacy POSTs below stay alive for the 90-day deprecation window.
   */
  @UseGuards(JwtAuthGuard)
  @Patch("subscription")
  @HttpCode(HttpStatus.OK)
  patchSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PatchSubscriptionDto,
  ) {
    return this.billingService.patchSubscription(user.userId, dto.action, {
      reason: dto.reason,
      newPlanId: dto.newPlanId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("cancel")
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CancelSubscriptionDto,
  ) {
    return this.subscriptionService.cancel(user.userId, dto.reason);
  }

  @UseGuards(JwtAuthGuard)
  @Post("reactivate")
  @HttpCode(HttpStatus.OK)
  reactivate(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionService.reactivate(user.userId);
  }

  // ── Webhook (no auth — Stripe signs the body) ─────────────────────────────

  /**
   * Same handler as `/api/subscriptions/webhook`. Both paths are exposed
   * so we can migrate the Stripe Dashboard webhook endpoint at our own
   * pace; once it points to `/api/billing/webhook`, the legacy one can
   * be retired in a follow-up sprint.
   */
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers["stripe-signature"] as string;
    return this.subscriptionService.handleWebhook(
      req.rawBody as Buffer,
      signature,
    );
  }
}
