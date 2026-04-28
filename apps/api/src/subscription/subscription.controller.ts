import type { RawBodyRequest } from "@nestjs/common";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth";
import { CurrentUser } from "../content/guards/current-user.decorator";
import type { AuthenticatedUser } from "../auth";
import type { CreateCheckoutSessionDto } from "./dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "./dto/create-portal-session.dto";
import type { SubscriptionService } from "./subscription.service";

@Controller("subscriptions")
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
