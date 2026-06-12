import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthResponseDto } from "./dto/auth-response.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthService, type AuthRequestContext } from "./auth.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RegisterDto } from "./dto/register.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LoginDto } from "./dto/login.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RefreshDto } from "./dto/refresh.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ResetPasswordDto } from "./dto/reset-password.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { VerifyEmailDto } from "./dto/verify-email.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { OAuthGoogleDto } from "./dto/oauth-google.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { AuthenticatedUser } from "./strategies/jwt.strategy";

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/**
 * Extracts IP + User-Agent from an Express request. Used to populate the
 * AuthEvent audit log.
 *
 * IP resolution: prefer `X-Forwarded-For` (Railway / any reverse proxy in
 * front of the app sets this). Fall back to the raw socket address.
 */
function extractAuthContext(req: Request): AuthRequestContext {
  const xff = req.headers["x-forwarded-for"];
  const xffString = Array.isArray(xff) ? xff[0] : xff;
  return {
    userAgent: req.headers["user-agent"],
    ipAddress:
      xffString?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? undefined,
  };
}

@ApiTags("Auth")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiTooManyRequestsResponse({ type: ErrorEnvelopeDto })
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: "Register a new account (email + password)" })
  @ApiOkResponse({ type: AuthResponseDto })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, extractAuthContext(req));
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: "Login with email + password" })
  @ApiOkResponse({ type: AuthResponseDto })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, extractAuthContext(req));
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Rotate refresh token, get new access token",
    description:
      "The presented refresh token is invalidated; a new pair is issued.",
  })
  @ApiOkResponse({ type: AuthResponseDto })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const ctx = extractAuthContext(req);
    return this.authService.refresh(
      dto.refreshToken,
      ctx.userAgent,
      ctx.ipAddress,
    );
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Revoke the presented refresh token" })
  logout(@Body() dto: RefreshDto, @Req() req: AuthenticatedRequest) {
    return this.authService.logout(
      req.user.userId,
      dto.refreshToken,
      extractAuthContext(req),
    );
  }

  // ── S2: email flows ──────────────────────────────────────────────────────

  /**
   * Initiate password reset. **Always returns 200** regardless of whether the
   * email matches a user — prevents enumeration. 3/hour/IP throttle slows
   * down spammers without inconveniencing legitimate users.
   */
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60 * 60_000 } })
  @ApiOperation({
    summary: "Request a password reset email (no-leak, always 200)",
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.authService.forgotPassword(dto, extractAuthContext(req));
    return { ok: true };
  }

  /**
   * Consume a password reset token. 410 GONE if invalid/expired/used.
   * On success: all active refresh tokens are revoked (logout everywhere).
   */
  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: "Reset password using a token from email" })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.authService.resetPassword(dto, extractAuthContext(req));
  }

  /**
   * Consume an email verification token. Sets User.emailVerified=true.
   * Idempotent — second call with same token returns 410.
   */
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify email using a token from registration email",
  })
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    return this.authService.verifyEmail(dto, extractAuthContext(req));
  }

  // ── S2: OAuth · Google ───────────────────────────────────────────────────

  /**
   * Sign in or sign up with a Google ID token. The frontend uses Google
   * Identity Services (web) or Google Sign-In SDK (mobile) to obtain the
   * token client-side and POSTs it here. Backend verifies against Google's
   * public keys via google-auth-library (ADR 0009 — no Passport redirect
   * flow).
   *
   * - First time → creates User with authProvider=GOOGLE, emailVerified
   *   pre-set if Google says the email is verified.
   * - Returning → matches by providerId, returns tokens.
   * - Email collides with a LOCAL user → 409 EMAIL_ALREADY_REGISTERED.
   */
  @Post("oauth/google")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @ApiOperation({
    summary: "Sign in / register with a Google ID token",
    description:
      "Verifies the token against Google's public keys, then issues our own access + refresh pair.",
  })
  @ApiOkResponse({ type: AuthResponseDto })
  oauthGoogle(@Body() dto: OAuthGoogleDto, @Req() req: Request) {
    return this.authService.loginWithGoogle(dto, extractAuthContext(req));
  }
}
