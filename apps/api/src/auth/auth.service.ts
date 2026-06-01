import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ResendService } from "../notifications";
import {
  verifyEmail as renderVerifyEmail,
  passwordResetEmail as renderPasswordResetEmail,
} from "../notifications";
import type { Env } from "../config";
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";
import type { ForgotPasswordDto } from "./dto/forgot-password.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";
import type { VerifyEmailDto } from "./dto/verify-email.dto";
import type { OAuthGoogleDto } from "./dto/oauth-google.dto";
import type { AuthResponseDto } from "./dto/auth-response.dto";
import type { JwtPayload } from "./strategies/jwt.strategy";
import {
  AuthEventType,
  LoginFailReason,
  type AuthEventType as AuthEventTypeT,
} from "./auth-event.type";
import { GoogleVerifier } from "./oauth/google-verifier";

const VERIFY_EMAIL_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;

/**
 * Per-request context carried alongside the DTOs to populate the audit log
 * (`AuthEvent` table). All fields are optional — the service tolerates a
 * missing context but the log will simply omit those columns.
 */
export interface AuthRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
    private readonly resend: ResendService,
    private readonly googleVerifier: GoogleVerifier,
  ) {}

  // ── register ──────────────────────────────────────────────────────────────

  async register(
    dto: RegisterDto,
    ctx: AuthRequestContext = {},
  ): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) throw new ConflictException("Email already in use");

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Generate the per-user Argon2id salt (ADR 0007 §A). 16 bytes random,
    // base64url, stored as-is in the DB. NOT a secret — the client receives
    // it back at login to derive the master key.
    const cryptoSalt = randomBytes(16).toString("base64url");

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        authProvider: "LOCAL",
        cryptoSalt,
        profile: { create: {} },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        cryptoSalt: true,
      },
    });

    // Audit BEFORE issuing tokens so a DB failure on the audit doesn't issue
    // tokens for an unrecorded registration.
    await this.recordEvent({
      type: AuthEventType.REGISTER,
      userId: user.id,
      email: user.email,
      ctx,
    });

    // Fire-and-forget verification email. We don't await to avoid blocking
    // the register response on Resend latency — if the email fails to send,
    // the user can re-request later via /auth/resend-verification (future).
    // The audit log captures the request regardless.
    void this.sendVerificationEmail(user.id, user.email, user.name).catch(
      (err) => {
        this.logger.warn(
          `Verification email send failed for user ${user.id}: ${(err as Error).message}`,
        );
      },
    );

    return this.issueTokens(user, this.prisma, ctx);
  }

  // ── login ─────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ctx: AuthRequestContext = {},
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        passwordHash: true,
        isActive: true,
        cryptoSalt: true,
      },
    });

    // Constant-time path: run bcrypt even when user not found to prevent
    // timing attacks. The placeholder hash will never match.
    const passwordHash = user?.passwordHash ?? "$2b$12$invalidhashfortimingatk";
    const valid = await bcrypt.compare(dto.password, passwordHash);

    if (!user) {
      await this.recordEvent({
        type: AuthEventType.LOGIN_FAIL,
        email: dto.email,
        ctx,
        metadata: { reason: LoginFailReason.USER_NOT_FOUND },
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!valid) {
      await this.recordEvent({
        type: AuthEventType.LOGIN_FAIL,
        userId: user.id,
        email: user.email,
        ctx,
        metadata: { reason: LoginFailReason.WRONG_PASSWORD },
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.isActive) {
      await this.recordEvent({
        type: AuthEventType.LOGIN_FAIL,
        userId: user.id,
        email: user.email,
        ctx,
        metadata: { reason: LoginFailReason.ACCOUNT_INACTIVE },
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.recordEvent({
      type: AuthEventType.LOGIN_OK,
      userId: user.id,
      email: user.email,
      ctx,
    });

    // Sprint S6-crypto-polish: lazy migration of legacy accounts.
    //
    // Accounts created before the crypto layer landed have cryptoSalt = null.
    // We backfill on first successful login because:
    //   1. We have a confirmed password match — safe moment to bind a salt.
    //   2. The salt is non-sensitive; no consent flow needed.
    //   3. The user immediately gets the new salt back in the response and
    //      can derive a master key on next Diary open without an extra trip.
    //
    // Idempotent: if a salt already exists we don't touch it.
    const userWithSalt = await this.ensureCryptoSalt(user);

    return this.issueTokens(userWithSalt, this.prisma, ctx);
  }

  /**
   * Backfills `cryptoSalt` for legacy accounts. Returns the user object with
   * the salt populated (either pre-existing or freshly written).
   */
  private async ensureCryptoSalt<
    T extends { id: string; cryptoSalt: string | null },
  >(user: T): Promise<T> {
    if (user.cryptoSalt) return user;
    const salt = randomBytes(16).toString("base64url");
    await this.prisma.user.update({
      where: { id: user.id },
      data: { cryptoSalt: salt },
    });
    return { ...user, cryptoSalt: salt };
  }

  // ── refresh ───────────────────────────────────────────────────────────────

  async refresh(
    rawToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponseDto> {
    const ctx: AuthRequestContext = { ipAddress, userAgent };
    const tokenHash = this.hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            plan: true,
            isActive: true,
            cryptoSalt: true,
          },
        },
      },
    });

    // Two failure modes worth distinguishing in the audit:
    //  - REFRESH_REUSED: a previously valid token was presented again
    //    (revokedAt is set). Could indicate token theft + replay.
    //  - generic invalid: token never existed or expired naturally.
    if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
      await this.recordEvent({
        type: AuthEventType.REFRESH_REUSED,
        userId: stored?.userId ?? null,
        ctx,
        metadata: {
          reason: !stored
            ? "TOKEN_NOT_FOUND"
            : stored.expiresAt < new Date()
              ? "TOKEN_EXPIRED"
              : "ACCOUNT_INACTIVE",
        },
      });
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (stored.revokedAt !== null) {
      await this.recordEvent({
        type: AuthEventType.REFRESH_REUSED,
        userId: stored.userId,
        ctx,
        metadata: { reason: "TOKEN_REVOKED", originalTokenId: stored.id },
      });
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Backfill cryptoSalt for legacy accounts on refresh too — covers the
    // user who never explicitly logs in (session restored via refresh cookie
    // on web cold-start, or via SecureStore on mobile relaunch).
    const refreshedUser = await this.ensureCryptoSalt(stored.user);

    // Atomic rotation: revoke old token and issue new pair in a transaction
    const [, response] = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      return [null, await this.issueTokens(refreshedUser, tx, ctx)];
    });

    await this.recordEvent({
      type: AuthEventType.REFRESH,
      userId: stored.userId,
      ctx,
    });

    return response;
  }

  // ── logout ────────────────────────────────────────────────────────────────

  async logout(
    userId: string,
    rawToken: string,
    ctx: AuthRequestContext = {},
  ): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, token: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.recordEvent({
      type: AuthEventType.LOGOUT,
      userId,
      ctx,
      // count=0 means the user presented a token that wasn't theirs/active.
      // Still log — could be a stale tab in another browser.
      metadata: { revokedCount: result.count },
    });
  }

  // ── forgot password ───────────────────────────────────────────────────────

  /**
   * Initiates a password reset flow. **Always returns void successfully**,
   * regardless of whether the email matches a user. This is intentional:
   * leaking "this email is / isn't registered" lets attackers enumerate
   * users.
   *
   * On the inside, four paths:
   *   - LOCAL user found → generate token, send email, audit.
   *   - OAuth user found → DON'T send reset email (no password to reset),
   *     audit with reason. The user sees a generic success and goes
   *     "wait, I signed up with Google" via the login screen.
   *   - User not found → audit (with email, null userId), do nothing.
   *   - Inactive user → same as not found.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    ctx: AuthRequestContext = {},
  ): Promise<void> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        isActive: true,
        authProvider: true,
      },
    });

    if (!user || !user.isActive) {
      await this.recordEvent({
        type: AuthEventType.PASSWORD_RESET_REQUESTED,
        userId: null,
        email: normalizedEmail,
        ctx,
        metadata: {
          skipped: true,
          reason: user ? "INACTIVE" : "USER_NOT_FOUND",
        },
      });
      return;
    }

    if (user.authProvider !== "LOCAL") {
      await this.recordEvent({
        type: AuthEventType.PASSWORD_RESET_REQUESTED,
        userId: user.id,
        email: user.email,
        ctx,
        metadata: {
          skipped: true,
          reason: "OAUTH_USER",
          provider: user.authProvider,
        },
      });
      return;
    }

    // Generate a one-time token, store its SHA-256 hash, send the RAW value
    // via email. The raw value never touches disk.
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_HOURS * 3600 * 1000,
    );

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const appUrl = this.configService.get("APP_URL", { infer: true });
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    // Best-effort send. If Resend is down, the user can re-request.
    const email = renderPasswordResetEmail({
      firstName: user.firstName ?? user.name,
      resetUrl,
      expiresHours: PASSWORD_RESET_TTL_HOURS,
      requestIp: ctx.ipAddress,
    });
    try {
      await this.resend.send({
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        tag: email.tag,
      });
    } catch (err) {
      this.logger.error(
        `Password reset email send failed for user ${user.id}: ${(err as Error).message}`,
      );
    }

    await this.recordEvent({
      type: AuthEventType.PASSWORD_RESET_REQUESTED,
      userId: user.id,
      email: user.email,
      ctx,
    });
  }

  // ── reset password ────────────────────────────────────────────────────────

  /**
   * Consumes a password reset token, rotates the password, revokes all
   * active refresh tokens (forces re-login on every device).
   *
   * Failure modes:
   *   - 400 if token format invalid (caught at DTO validation).
   *   - 410 GONE if token unknown, expired, or already consumed. Same code
   *     for all three so an attacker can't differentiate "just expired"
   *     from "never existed".
   */
  async resetPassword(
    dto: ResetPasswordDto,
    ctx: AuthRequestContext = {},
  ): Promise<void> {
    const tokenHash = this.hashToken(dto.token);

    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, email: true, isActive: true, authProvider: true },
        },
      },
    });

    if (
      !stored ||
      stored.consumedAt !== null ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive ||
      stored.user.authProvider !== "LOCAL"
    ) {
      throw new GoneException({
        code: "TOKEN_INVALID_OR_EXPIRED",
        message: "Este enlace ya no es válido. Solicita uno nuevo.",
      });
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);

    // Atomic: consume token + rotate password + revoke all refresh tokens.
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: stored.user.id },
        data: { passwordHash: newHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.recordEvent({
      type: AuthEventType.PASSWORD_RESET_COMPLETED,
      userId: stored.user.id,
      email: stored.user.email,
      ctx,
    });
  }

  // ── verify email ──────────────────────────────────────────────────────────

  async verifyEmail(
    dto: VerifyEmailDto,
    ctx: AuthRequestContext = {},
  ): Promise<{ ok: true; userId: string }> {
    const tokenHash = this.hashToken(dto.token);

    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: { select: { id: true, email: true, emailVerified: true } },
      },
    });

    if (
      !stored ||
      stored.consumedAt !== null ||
      stored.expiresAt < new Date()
    ) {
      throw new GoneException({
        code: "TOKEN_INVALID_OR_EXPIRED",
        message:
          "Este enlace ya no es válido. Solicita uno nuevo desde tu perfil.",
      });
    }

    // Idempotent: if email is already verified, still mark the token
    // consumed and return ok. No reason to surface "you already did this".
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: stored.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: stored.user.id },
        data: { emailVerified: true },
      }),
    ]);

    await this.recordEvent({
      type: AuthEventType.EMAIL_VERIFIED,
      userId: stored.user.id,
      email: stored.user.email,
      ctx,
    });

    return { ok: true, userId: stored.user.id };
  }

  // ── OAuth · Google ────────────────────────────────────────────────────────

  /**
   * Sign in or create an account from a Google ID token (POST /api/auth/oauth/google).
   *
   * Three branches:
   *   1. providerId matches an existing GOOGLE user → return tokens (LOGIN).
   *   2. providerId is new + email is unused → create new GOOGLE user (REGISTER).
   *   3. providerId is new but email collides with a LOCAL user → 409.
   *      We don't auto-link accounts to avoid impersonation: an attacker
   *      who somehow gets a Google account with a Local user's email
   *      shouldn't be able to take it over silently. Account linking is a
   *      separate, explicit flow (post-v1).
   */
  async loginWithGoogle(
    dto: OAuthGoogleDto,
    ctx: AuthRequestContext = {},
  ): Promise<AuthResponseDto> {
    if (!this.googleVerifier.isEnabled()) {
      throw new BadRequestException({
        code: "OAUTH_NOT_CONFIGURED",
        message: "Google sign-in is not enabled on this server.",
      });
    }

    const claims = await this.googleVerifier.verify(dto.idToken);

    // Path 1: existing GOOGLE user by providerId.
    const existingByProvider = await this.prisma.user.findFirst({
      where: { authProvider: "GOOGLE", providerId: claims.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        isActive: true,
        cryptoSalt: true,
      },
    });

    if (existingByProvider) {
      if (!existingByProvider.isActive) {
        await this.recordEvent({
          type: AuthEventType.LOGIN_FAIL,
          userId: existingByProvider.id,
          email: existingByProvider.email,
          ctx,
          metadata: {
            reason: LoginFailReason.ACCOUNT_INACTIVE,
            provider: "GOOGLE",
          },
        });
        throw new UnauthorizedException("Invalid credentials");
      }

      await this.recordEvent({
        type: AuthEventType.OAUTH_LOGIN,
        userId: existingByProvider.id,
        email: existingByProvider.email,
        ctx,
        metadata: { provider: "GOOGLE" },
      });
      const googleUserWithSalt =
        await this.ensureCryptoSalt(existingByProvider);
      return this.issueTokens(googleUserWithSalt, this.prisma, ctx);
    }

    // Path 3 first: same email under a different auth method? Refuse to
    // auto-link. Surface a specific error code so the frontend can suggest
    // "you registered with email + password — sign in that way".
    const collidingEmail = await this.prisma.user.findUnique({
      where: { email: claims.email },
      select: { id: true, authProvider: true },
    });
    if (collidingEmail) {
      await this.recordEvent({
        type: AuthEventType.LOGIN_FAIL,
        userId: collidingEmail.id,
        email: claims.email,
        ctx,
        metadata: { reason: "PROVIDER_COLLISION", provider: "GOOGLE" },
      });
      throw new ConflictException({
        code: "EMAIL_ALREADY_REGISTERED",
        message:
          `Este correo ya está registrado con ${collidingEmail.authProvider.toLowerCase()}. ` +
          `Inicia sesión con ese método.`,
      });
    }

    // Path 2: brand-new user.
    //
    // Google OAuth users get a cryptoSalt too — the master key derives from
    // a future "passcode" the user sets the first time they open Diario.
    // For now the salt is stored but the diary unlock UX will prompt for a
    // passcode (separate from Google login). Documented as TODO until UX
    // lands; the salt being there means we don't need a migration later.
    const cryptoSalt = randomBytes(16).toString("base64url");
    const created = await this.prisma.user.create({
      data: {
        email: claims.email,
        passwordHash: null,
        name: claims.name ?? claims.email.split("@")[0]!,
        firstName: claims.name?.split(" ")[0] ?? null,
        avatarUrl: claims.picture,
        authProvider: "GOOGLE",
        providerId: claims.sub,
        cryptoSalt,
        // Google already verified the email — skip our own verification flow.
        emailVerified: claims.emailVerified,
        profile: { create: {} },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        cryptoSalt: true,
      },
    });

    await this.recordEvent({
      type: AuthEventType.OAUTH_REGISTER,
      userId: created.id,
      email: created.email,
      ctx,
      metadata: { provider: "GOOGLE" },
    });

    return this.issueTokens(created, this.prisma, ctx);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * Generates a verification token and sends the welcome email. Called from
   * `register()` fire-and-forget and (future) from a resend-verification
   * endpoint.
   */
  private async sendVerificationEmail(
    userId: string,
    email: string,
    name: string,
  ): Promise<void> {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + VERIFY_EMAIL_TTL_HOURS * 3600 * 1000,
    );

    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    const appUrl = this.configService.get("APP_URL", { infer: true });
    const verifyUrl = `${appUrl}/verify-email?token=${rawToken}`;
    const rendered = renderVerifyEmail({
      firstName: name.split(" ")[0] ?? name,
      verifyUrl,
      expiresHours: VERIFY_EMAIL_TTL_HOURS,
    });

    await this.resend.send({
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tag: rendered.tag,
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Writes one row to AuthEvent. Sync (awaited) — auth events are critical
   * for security and compliance, we don't want to drop them under load.
   * Failures are swallowed because we never want an audit log issue to
   * prevent a successful auth or unblock an authentic failure response.
   */
  private async recordEvent(input: {
    type: AuthEventTypeT;
    userId?: string | null;
    email?: string | null;
    ctx: AuthRequestContext;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.authEvent.create({
        data: {
          type: input.type,
          userId: input.userId ?? null,
          email: input.email ?? null,
          ipAddress: input.ctx.ipAddress ?? null,
          userAgent: input.ctx.userAgent ?? null,
          // Prisma's InputJsonValue is recursive; Record<string, unknown> is
          // structurally close but not assignable. Metadata is always a plain
          // serialisable object — cast is sound but not provable to TS.
          metadata: (input.metadata ?? undefined) as never,
        },
      });
    } catch {
      // TODO senior: route to a Logger + Sentry breadcrumb so we notice
      // when the audit write itself starts failing. Don't throw — that
      // would mask the actual auth outcome from the client.
    }
  }

  private async issueTokens(
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      plan: string;
      cryptoSalt?: string | null;
    },
    // TODO senior: accept Prisma transaction client type once shared kernel is extracted
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any = this.prisma,
    ctx: AuthRequestContext = {},
  ): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    };

    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = randomBytes(64).toString("hex");
    const tokenHash = this.hashToken(rawRefreshToken);

    const expiresIn = this.configService.get("JWT_REFRESH_EXPIRES_IN", {
      infer: true,
    });

    await tx.refreshToken.create({
      data: {
        token: tokenHash,
        userId: user.id,
        userAgent: ctx.userAgent,
        ipAddress: ctx.ipAddress,
        expiresAt: this.parseExpiry(expiresIn),
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
        // cryptoSalt is null for legacy accounts. The client gracefully
        // shows "tu cuenta no tiene cifrado E2E activado" with a re-derive
        // CTA (future) instead of breaking the diary flow.
        cryptoSalt: user.cryptoSalt ?? null,
      },
    };
  }

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  private parseExpiry(expiry: string): Date {
    const now = Date.now();
    const match = /^(\d+)([smhd])$/.exec(expiry);
    if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const ms: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
    return new Date(now + value * ms[unit]);
  }
}
