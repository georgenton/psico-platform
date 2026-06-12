import type { RawBodyRequest } from "@nestjs/common";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { DeprecationInterceptor } from "./deprecation.interceptor";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth";
import { CurrentUser } from "../shared";
import type { AuthenticatedUser } from "../auth";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CancelSubscriptionDto } from "./dto/cancel-subscription.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateCheckoutSessionDto } from "./dto/checkout-session.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreatePortalSessionDto } from "./dto/create-portal-session.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ListInvoicesQueryDto } from "./dto/list-invoices-query.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SubscriptionService } from "./subscription.service";

/**
 * @deprecated Sprint S11 (2026-06-02) — use `/api/billing/*` instead.
 * Sunset: 2026-08-31. See deprecation.interceptor.ts for the headers we
 * emit and ADR 0006 for the 90-day deprecation policy.
 */
@ApiTags("Subscription (deprecated)")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@Controller("subscriptions")
@UseInterceptors(DeprecationInterceptor)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // Public — no auth required
  @Get("plans")
  getPlans() {
    return this.subscriptionService.getPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  getMySubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionService.getMySubscription(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("checkout")
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
  @Post("portal")
  createPortalSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePortalSessionDto,
  ) {
    return this.subscriptionService.createPortalSession(user.userId, dto);
  }

  // ─── Sprint S7 ────────────────────────────────────────────────────────────

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

  // Stripe sends raw body — no JWT, signature is verified inside the service
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers["stripe-signature"] as string;
    // rawBody is populated by NestFactory.create({ rawBody: true })
    return this.subscriptionService.handleWebhook(
      req.rawBody as Buffer,
      signature,
    );
  }
}
