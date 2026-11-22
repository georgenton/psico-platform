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
import type { ResendVerificationDto } from "./dto/resend-verification.dto";
import type { OAuthGoogleDto } from "./dto/oauth-google.dto";
import type { AuthResponseDto } from "./dto/auth-response.dto";
import type { JwtPayload } from "./strategies/jwt.strategy";
import { revokeAllUserSessions } from "./session-revocation";
import {
  AuthEventType,
  LoginFailReason,
  type AuthEventType as AuthEventTypeT,
} from "./auth-event.type";
import { GoogleVerifier } from "./oauth/google-verifier";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JobsService, type EmailJobPayload } from "../jobs";
import { reserveVerificationSend } from "./verification-send-budget";

const VERIFY_EMAIL_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;

/** What `prepareVerificationEmail` hands back: a reserved, rendered message, or none. */
interface PreparedVerificationEmail {
  /** Emails already counted in the trailing window before this request. */
  sentInWindow: number;
  /** Null when the account's budget was already spent; nothing was reserved. */
  mail: EmailJobPayload | null;
}

// The per-account budget for verification emails —
// VERIFICATION_SEND_MAX_PER_WINDOW in a trailing hour, shared by register()
// and resendVerification() — lives in `verification-send-budget.ts`, together
// with the lock that makes checking it and spending it one step.

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
    private readonly jobs: JobsService,
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
        authRevision: true,
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
    // or if the 24h link lapses before it's clicked, the person asks for
    // another one via POST /auth/resend-verification.
    //
    // It spends a slot of the same per-account budget as every resend, and it
    // takes it through the same locked reservation: a resend racing this one
    // can't push the account past the ceiling. Delivery stays in-process, as
    // it was when the mail journey was accepted (PR 868) — only the budget is
    // new here.
    void this.prepareVerificationEmail(user.id, user.email, user.name)
      .then(async (prepared) => {
        if (!prepared.mail) {
          this.logger.warn(
            `Verification email not sent for user ${user.id}: budget already spent (${prepared.sentInWindow} in window)`,
          );
          return;
        }
        await this.resend.send(prepared.mail);
      })
      .catch((err) => {
        this.logger.warn(
          `Verification email send failed for user ${user.id}: ${(err as Error).message}`,
        );
      });

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
        authRevision: true,
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
            authRevision: true,
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

  // ── session revocation (ADR 0015) ───────────────────────────────────────────

  /**
   * Log out EVERY device: bump authRevision (invalidates all live access
   * tokens) + delete all refresh tokens. Unlike single-device `logout`, this
   * is the "sign out everywhere" action.
   */
  async logoutAll(userId: string, ctx: AuthRequestContext = {}): Promise<void> {
    await this.prisma.$transaction((tx) => revokeAllUserSessions(tx, userId));
    await this.recordEvent({ type: AuthEventType.LOGOUT, userId, ctx });
  }

  /**
   * Revoke all of a user's sessions without any other state change. The hook
   * for sensitive events that happen outside auth (e.g. a role change) —
   * callers that already own a transaction should call
   * `revokeAllUserSessions(tx, userId)` directly instead.
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.$transaction((tx) => revokeAllUserSessions(tx, userId));
  }

  /**
   * Incident-response / admin helper: disable the account AND cut every live
   * session in one atomic step. `isActive=false` alone would let an unexpired
   * access token live to its 15m expiry (the gap this whole ADR closes), so we
   * revoke in the same transaction.
   */
  async disableUser(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { isActive: false },
      });
      await revokeAllUserSessions(tx, userId);
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

    // Atomic: consume token + rotate password + revoke every session
    // (bump authRevision → kills live access tokens; delete refresh tokens →
    // kills the ability to mint new ones). ADR 0015.
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: stored.id },
        data: { consumedAt: new Date() },
      });
      await tx.user.update({
        where: { id: stored.user.id },
        data: { passwordHash: newHash },
      });
      await revokeAllUserSessions(tx, stored.user.id);
    });

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
          "Este enlace ya no es válido. Puedes pedir uno nuevo con tu correo.",
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

  // ── resend verification ───────────────────────────────────────────────────

  /**
   * Issues a fresh verification link for an address. **Always resolves
   * successfully**, whatever happens inside — same contract, and same reason,
   * as `forgotPassword`: an answer that varied would turn this endpoint into
   * an oracle for "does this address have an account here", and the
   * already-verified branch would leak a second bit on top.
   *
   * Six internal paths, every one of them audited as
   * EMAIL_VERIFICATION_REQUESTED so the real outcome is recoverable from the
   * log even though the caller can't see it:
   *   - LOCAL user, not yet verified, within budget → reserve a slot and
   *     queue the email.
   *   - Address unknown → nothing to do.
   *   - Account inactive → treated exactly like unknown.
   *   - OAuth user → the provider already vouched for the address; we have no
   *     verification of our own to offer, and no password-less account to let
   *     through.
   *   - Already verified → nothing left to verify. Silent on purpose.
   *   - Over the per-address budget → refuse to send, still resolve.
   *
   * ── The response never waits for the provider ─────────────────────────
   *
   * The first version awaited Resend on the one branch that sends, so a slow
   * provider made "this address can receive a resend" measurably slower than
   * every other answer. The email now goes through the `email` queue — the
   * same BullMQ path the email-change and data-export notices already use,
   * with its 3 attempts and backoff — and the worker delivers it. What the
   * response still awaits is our own infrastructure: the locked reservation
   * (one short PostgreSQL transaction) and the enqueue (one Redis write).
   *
   * That removes the provider from the timing. It does NOT make the branches
   * indistinguishable in time, and nothing here claims so: the sending branch
   * still does a transaction and a Redis write that the others don't. Equal
   * status and equal body are what the tests pin; equal latency is not.
   *
   * What this deliberately does NOT do: change who may use the product. No
   * guard in this codebase requires a verified address, and this endpoint
   * doesn't introduce one — it closes the hole where a lapsed link left
   * deleting the account as the only way forward.
   */
  async resendVerification(
    dto: ResendVerificationDto,
    ctx: AuthRequestContext = {},
  ): Promise<void> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        authProvider: true,
        emailVerified: true,
      },
    });

    if (!user || !user.isActive) {
      await this.recordEvent({
        type: AuthEventType.EMAIL_VERIFICATION_REQUESTED,
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
        type: AuthEventType.EMAIL_VERIFICATION_REQUESTED,
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

    if (user.emailVerified) {
      await this.recordEvent({
        type: AuthEventType.EMAIL_VERIFICATION_REQUESTED,
        userId: user.id,
        email: user.email,
        ctx,
        metadata: { skipped: true, reason: "ALREADY_VERIFIED" },
      });
      return;
    }

    // One locked step: check the account's budget and, if there is room,
    // take a slot. Two requests racing for the last slot can't both get it.
    //
    // Caught for the same reason as the enqueue below: this transaction only
    // runs on the branch that can receive a resend, so letting a database
    // error surface as a 500 would answer "this address has an unverified
    // account" to whoever was probing.
    let prepared: PreparedVerificationEmail;
    try {
      prepared = await this.prepareVerificationEmail(
        user.id,
        user.email,
        user.name,
      );
    } catch (err) {
      this.logger.error(
        `Verification budget could not be reserved for user ${user.id}: ${(err as Error).message}`,
      );
      await this.recordEvent({
        type: AuthEventType.EMAIL_VERIFICATION_REQUESTED,
        userId: user.id,
        email: user.email,
        ctx,
        metadata: { skipped: true, reason: "RESERVE_FAILED" },
      });
      return;
    }

    if (!prepared.mail) {
      await this.recordEvent({
        type: AuthEventType.EMAIL_VERIFICATION_REQUESTED,
        userId: user.id,
        email: user.email,
        ctx,
        metadata: {
          skipped: true,
          reason: "ADDRESS_RATE_LIMITED",
          sentInWindow: prepared.sentInWindow,
        },
      });
      return;
    }

    // Hand the email to the queue instead of the provider. A failure here is
    // OUR infrastructure (Redis), not Resend's, and it must not become a 500
    // either: the response is 200 by contract, so the audit row is where it
    // gets recorded. The slot stays spent — see verification-send-budget.ts.
    //
    // The job carries the rendered message, raw link included, exactly like
    // the email-change notice in UsersService. BullMQ keeps completed jobs for
    // a day; the link it contains is a 24-hour, verify-only token.
    let enqueueFailed = false;
    try {
      await this.jobs.enqueueEmail(prepared.mail);
    } catch (err) {
      enqueueFailed = true;
      this.logger.error(
        `Verification email could not be queued for user ${user.id}: ${(err as Error).message}`,
      );
    }

    await this.recordEvent({
      type: AuthEventType.EMAIL_VERIFICATION_REQUESTED,
      userId: user.id,
      email: user.email,
      ctx,
      // `queued` says the job reached the email queue — not that the message
      // was delivered. The provider's answer is recorded by the queue itself
      // (attempts, failures) and the worker's log, not here.
      metadata: enqueueFailed ? { enqueueFailed: true } : { queued: true },
    });
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
        authRevision: true,
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
        authRevision: true,
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
   * Reserves a slot in the account's verification budget and, if it got one,
   * renders the email. Returns `mail: null` when the budget is already spent.
   *
   * It does NOT send. The reservation is a locked transaction, and sending
   * inside it would hold the lock across the provider's latency; so the
   * caller delivers afterwards — `register()` in-process, as it always has,
   * and `resendVerification()` through the email queue. Both share the
   * budget, which is what makes the ceiling hold for the account as a whole.
   *
   * The raw token exists only here and in the rendered message; the database
   * gets its hash.
   */
  private async prepareVerificationEmail(
    userId: string,
    email: string,
    name: string,
  ): Promise<PreparedVerificationEmail> {
    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + VERIFY_EMAIL_TTL_HOURS * 3600 * 1000,
    );

    const { reserved, sentInWindow } = await reserveVerificationSend(
      this.prisma,
      { userId, tokenHash: this.hashToken(rawToken), expiresAt },
    );
    if (!reserved) return { sentInWindow, mail: null };

    const appUrl = this.configService.get("APP_URL", { infer: true });
    const verifyUrl = `${appUrl}/verify-email?token=${rawToken}`;
    const rendered = renderVerifyEmail({
      firstName: name.split(" ")[0] ?? name,
      verifyUrl,
      expiresHours: VERIFY_EMAIL_TTL_HOURS,
    });

    return {
      sentInWindow,
      mail: {
        to: email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tag: rendered.tag,
      },
    };
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
      authRevision: number;
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
      // ADR 0015: bind the token to the account's current revision. A later
      // bump (disable / password change / logout-all / …) invalidates it.
      ar: user.authRevision,
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
