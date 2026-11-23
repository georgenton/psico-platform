import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import type { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: "USER",
  plan: "FREE",
  passwordHash: "$2b$12$hashedpassword",
  isActive: true,
  authRevision: 0,
};

const mockRefreshToken = {
  id: "token-1",
  token: "hashed-token",
  userId: "user-1",
  userAgent: null,
  ipAddress: null,
  expiresAt: new Date(Date.now() + 86400000),
  revokedAt: null,
  createdAt: new Date(),
  user: mockUser,
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
  },
  refreshToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  authEvent: {
    create: vi.fn().mockResolvedValue(undefined),
  },
  passwordResetToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  emailVerificationToken: {
    create: vi.fn().mockResolvedValue(undefined),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
  // The verification budget takes `pg_advisory_xact_lock` through the
  // callback-form transaction, which this mock runs on itself. Its real
  // serialising effect is proven against PostgreSQL in
  // `verification-send-budget.pg-spec.ts`, not here.
  $executeRaw: vi.fn(),
};

const mockJwtService = {
  sign: vi.fn().mockReturnValue("mock-access-token"),
};

const mockConfigService = {
  get: vi.fn().mockImplementation((key: string) => {
    const config: Record<string, string> = {
      JWT_REFRESH_EXPIRES_IN: "30d",
      JWT_SECRET: "test-secret-at-least-32-chars-long!!",
      APP_URL: "https://app.example.com",
    };
    return config[key];
  }),
};

const mockResend = {
  send: vi.fn().mockResolvedValue(undefined),
};

const mockGoogleVerifier = {
  isEnabled: vi.fn().mockReturnValue(true),
  verify: vi.fn(),
};

const mockJobs = {
  enqueueEmail: vi.fn().mockResolvedValue(undefined),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish default async resolutions cleared by clearAllMocks.
    mockPrisma.authEvent.create.mockResolvedValue(undefined);
    mockPrisma.emailVerificationToken.create.mockResolvedValue(undefined);
    // Default: nothing sent in the window, so the per-address budget is open.
    // A default that happened to be at the ceiling would make every
    // resendVerification test exercise the rate-limited branch by accident.
    mockPrisma.emailVerificationToken.count.mockResolvedValue(0);
    mockResend.send.mockResolvedValue(undefined);
    mockJobs.enqueueEmail.mockResolvedValue(undefined);
    // No case-insensitive match unless a test says so.
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.$executeRaw.mockResolvedValue(0);
    mockGoogleVerifier.isEnabled.mockReturnValue(true);
    // $transaction handles both callback and array forms.
    mockPrisma.$transaction.mockImplementation(
      async (
        arg: unknown[] | ((tx: typeof mockPrisma) => Promise<unknown>),
      ) => {
        if (typeof arg === "function") return arg(mockPrisma);
        return Promise.all(arg);
      },
    );
    service = new AuthService(
      mockPrisma as never,
      mockJwtService as unknown as JwtService,
      mockConfigService as unknown as ConfigService,
      mockResend as never,
      mockGoogleVerifier as never,
      mockJobs as never,
    );
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe("register", () => {
    it("creates a new user and returns tokens when email is unique", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      const result = await service.register({
        email: "test@example.com",
        password: "Password123!",
        name: "Test User",
      });

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toHaveLength(128); // 64 bytes hex
      expect(result.user.email).toBe("test@example.com");
      expect(mockPrisma.user.create).toHaveBeenCalledOnce();
    });

    it("embeds the `ar` (auth-revision) claim in the signed token (ADR 0015)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      await service.register({
        email: "test@example.com",
        password: "Password123!",
        name: "Test User",
      });

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: "user-1", ar: 0 }),
      );
    });

    it("throws ConflictException when email is already in use", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: "test@example.com",
          password: "Password123!",
          name: "Test User",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("stores a bcrypt hash, never the plaintext password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      await service.register({
        email: "test@example.com",
        password: "MySecret!",
        name: "Test User",
      });

      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).not.toBe("MySecret!");
      expect(createCall.data.passwordHash).toMatch(/^\$2[ab]\$\d+\$/);
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe("login", () => {
    it("returns tokens for valid credentials", async () => {
      const realHash = await bcrypt.hash("correctPassword", 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: realHash,
      });
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      const result = await service.login({
        email: "test@example.com",
        password: "correctPassword",
      });

      expect(result.accessToken).toBe("mock-access-token");
    });

    it("throws UnauthorizedException for wrong password", async () => {
      const realHash = await bcrypt.hash("correctPassword", 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: realHash,
      });

      await expect(
        service.login({ email: "test@example.com", password: "wrongPassword" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when user does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: "ghost@example.com", password: "any" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException for inactive accounts", async () => {
      const realHash = await bcrypt.hash("correctPassword", 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
        passwordHash: realHash,
      });

      await expect(
        service.login({
          email: "test@example.com",
          password: "correctPassword",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refresh ───────────────────────────────────────────────────────────────

  describe("refresh", () => {
    it("rotates token and returns new pair when token is valid", async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshToken);
      mockPrisma.refreshToken.update.mockResolvedValue(mockRefreshToken);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      const result = await service.refresh("valid-raw-token");

      expect(result.accessToken).toBe("mock-access-token");
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      );
    });

    it("throws UnauthorizedException when token is revoked", async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        revokedAt: new Date(),
      });

      await expect(service.refresh("revoked-token")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException when token is expired", async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh("expired-token")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException when token does not exist", async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh("unknown-token")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── logout ────────────────────────────────────────────────────────────────

  describe("logout", () => {
    it("revokes the refresh token for the given user", async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout("user-1", "raw-token");

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-1",
            revokedAt: null,
          }),
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });
  });

  // ── audit log (AuthEvent) ─────────────────────────────────────────────────

  describe("audit log", () => {
    it("writes a REGISTER event with IP/UA context after successful registration", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      await service.register(
        { email: "x@y.z", password: "Password123!", name: "X" },
        { ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0" },
      );

      const events = mockPrisma.authEvent.create.mock.calls.map(
        (c) => c[0].data,
      );
      const register = events.find(
        (e: { type: string }) => e.type === "REGISTER",
      );
      expect(register).toBeDefined();
      expect(register.userId).toBe("user-1");
      expect(register.ipAddress).toBe("203.0.113.5");
      expect(register.userAgent).toBe("Mozilla/5.0");
    });

    it("writes LOGIN_OK on successful login", async () => {
      const realHash = await bcrypt.hash("correctPassword", 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: realHash,
      });
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      await service.login(
        { email: "test@example.com", password: "correctPassword" },
        { ipAddress: "10.0.0.1", userAgent: "curl/8" },
      );

      const loginOk = mockPrisma.authEvent.create.mock.calls.find(
        (c) => c[0].data.type === "LOGIN_OK",
      );
      expect(loginOk).toBeDefined();
      expect(loginOk![0].data.userId).toBe("user-1");
    });

    it("writes LOGIN_FAIL with reason=USER_NOT_FOUND when email is unknown", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login(
          { email: "ghost@example.com", password: "any" },
          { ipAddress: "10.0.0.2" },
        ),
      ).rejects.toThrow(UnauthorizedException);

      const fail = mockPrisma.authEvent.create.mock.calls[0][0].data;
      expect(fail.type).toBe("LOGIN_FAIL");
      expect(fail.userId).toBeNull();
      expect(fail.email).toBe("ghost@example.com");
      expect(fail.metadata).toEqual({ reason: "USER_NOT_FOUND" });
    });

    it("writes LOGIN_FAIL with reason=WRONG_PASSWORD when password is wrong", async () => {
      const realHash = await bcrypt.hash("correctPassword", 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: realHash,
      });

      await expect(
        service.login(
          { email: "test@example.com", password: "wrongPassword" },
          {},
        ),
      ).rejects.toThrow(UnauthorizedException);

      const fail = mockPrisma.authEvent.create.mock.calls[0][0].data;
      expect(fail.type).toBe("LOGIN_FAIL");
      expect(fail.userId).toBe("user-1");
      expect(fail.metadata).toEqual({ reason: "WRONG_PASSWORD" });
    });

    it("writes LOGIN_FAIL with reason=ACCOUNT_INACTIVE when user is suspended", async () => {
      const realHash = await bcrypt.hash("correctPassword", 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
        passwordHash: realHash,
      });

      await expect(
        service.login(
          { email: "test@example.com", password: "correctPassword" },
          {},
        ),
      ).rejects.toThrow(UnauthorizedException);

      const fail = mockPrisma.authEvent.create.mock.calls[0][0].data;
      expect(fail.metadata).toEqual({ reason: "ACCOUNT_INACTIVE" });
    });

    it("writes REFRESH_REUSED when a revoked token is presented (security signal)", async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        revokedAt: new Date(),
      });

      await expect(service.refresh("revoked-token")).rejects.toThrow(
        UnauthorizedException,
      );

      const reuse = mockPrisma.authEvent.create.mock.calls.find(
        (c) => c[0].data.type === "REFRESH_REUSED",
      );
      expect(reuse).toBeDefined();
      expect(reuse![0].data.metadata).toMatchObject({
        reason: "TOKEN_REVOKED",
      });
    });

    it("writes REFRESH on a successful rotation", async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshToken);
      mockPrisma.refreshToken.update.mockResolvedValue(mockRefreshToken);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      await service.refresh("valid-raw-token", "Mozilla/5.0", "10.0.0.3");

      const refresh = mockPrisma.authEvent.create.mock.calls.find(
        (c) => c[0].data.type === "REFRESH",
      );
      expect(refresh).toBeDefined();
      expect(refresh![0].data.ipAddress).toBe("10.0.0.3");
    });

    it("writes LOGOUT (even if no token was revoked) for traceability", async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await service.logout("user-1", "raw", { ipAddress: "10.0.0.4" });

      const logout = mockPrisma.authEvent.create.mock.calls[0][0].data;
      expect(logout.type).toBe("LOGOUT");
      expect(logout.metadata).toEqual({ revokedCount: 0 });
    });

    it("does NOT throw when the audit write itself fails — auth outcome is preserved", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);
      mockPrisma.authEvent.create.mockRejectedValueOnce(new Error("Disk full"));

      // Register must still succeed despite the audit failure.
      const result = await service.register(
        { email: "x@y.z", password: "Password123!", name: "X" },
        {},
      );
      expect(result.accessToken).toBe("mock-access-token");
    });
  });

  // ── forgotPassword ────────────────────────────────────────────────────────

  describe("forgotPassword", () => {
    it("generates a token + sends email for LOCAL user; audits success", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "user@example.com",
        name: "User",
        firstName: "User",
        isActive: true,
        authProvider: "LOCAL",
      });
      mockPrisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword(
        { email: "user@example.com" },
        { ipAddress: "1.2.3.4" },
      );

      // Token persisted (hashed)
      const tokenCall = mockPrisma.passwordResetToken.create.mock.calls[0][0];
      expect(tokenCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(tokenCall.data.expiresAt).toBeInstanceOf(Date);

      // Email sent with the reset URL
      const sendCall = mockResend.send.mock.calls[0][0];
      expect(sendCall.to).toBe("user@example.com");
      expect(sendCall.tag).toBe("password-reset");
      expect(sendCall.html).toContain(
        "https://app.example.com/reset-password?token=",
      );

      // Audit: PASSWORD_RESET_REQUESTED with userId set
      const event = mockPrisma.authEvent.create.mock.calls[0][0].data;
      expect(event.type).toBe("PASSWORD_RESET_REQUESTED");
      expect(event.userId).toBe("user-1");
    });

    it("returns successfully without leaking when email is unknown", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ email: "ghost@example.com" }),
      ).resolves.toBeUndefined();

      // No token created, no email sent.
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mockResend.send).not.toHaveBeenCalled();

      // Audit captures the attempt with userId=null.
      const event = mockPrisma.authEvent.create.mock.calls[0][0].data;
      expect(event.type).toBe("PASSWORD_RESET_REQUESTED");
      expect(event.userId).toBeNull();
      expect(event.email).toBe("ghost@example.com");
      expect(event.metadata).toMatchObject({ skipped: true });
    });

    it("reaches an account stored with capitals when it's typed in lowercase", async () => {
      // Same defect as resendVerification, measured on staging on 2026-11-23:
      // register() stores the address as typed, and lowercasing before an
      // exact lookup meant an account like this could not recover at all.
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: "user-caps",
          email: "Ana@Example.com",
          name: "Ana",
          firstName: "Ana",
          isActive: true,
          authProvider: "LOCAL",
          emailVerified: true,
        },
      ]);
      mockPrisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword({ email: "ana@example.com" });

      expect(mockPrisma.user.findUnique.mock.calls[0][0].where).toEqual({
        email: "ana@example.com",
      });
      expect(mockPrisma.user.findMany.mock.calls[0][0].where).toEqual({
        email: { equals: "ana@example.com", mode: "insensitive" },
      });
      // To the address as STORED.
      expect(mockResend.send.mock.calls[0][0].to).toBe("Ana@Example.com");
      expect(mockPrisma.authEvent.create.mock.calls[0][0].data.userId).toBe(
        "user-caps",
      );
    });

    it("prefers the exact address, and never guesses between case twins", async () => {
      // Exact hit: no fallback query at all.
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "user@example.com",
        name: "User",
        firstName: "User",
        isActive: true,
        authProvider: "LOCAL",
        emailVerified: true,
      });
      mockPrisma.passwordResetToken.create.mockResolvedValue({});
      await service.forgotPassword({ email: "  user@example.com " });
      expect(mockPrisma.user.findUnique.mock.calls[0][0].where).toEqual({
        email: "user@example.com",
      });
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();

      // Two accounts that differ only by case: nothing is sent.
      vi.clearAllMocks();
      mockPrisma.authEvent.create.mockResolvedValue(undefined);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: "a",
          email: "Ana@Example.com",
          name: "A",
          firstName: null,
          isActive: true,
          authProvider: "LOCAL",
          emailVerified: true,
        },
        {
          id: "b",
          email: "ANA@example.com",
          name: "B",
          firstName: null,
          isActive: true,
          authProvider: "LOCAL",
          emailVerified: true,
        },
      ]);
      await expect(
        service.forgotPassword({ email: "ana@example.com" }),
      ).resolves.toBeUndefined();
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mockResend.send).not.toHaveBeenCalled();
      expect(
        mockPrisma.authEvent.create.mock.calls[0][0].data.metadata,
      ).toMatchObject({
        skipped: true,
        reason: "AMBIGUOUS_CASE",
      });
    });

    it("skips email for OAuth users (no password to reset)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-google",
        email: "user@gmail.com",
        name: "User",
        firstName: null,
        isActive: true,
        authProvider: "GOOGLE",
      });

      await service.forgotPassword({ email: "user@gmail.com" });

      expect(mockResend.send).not.toHaveBeenCalled();
      const event = mockPrisma.authEvent.create.mock.calls[0][0].data;
      expect(event.metadata).toMatchObject({
        skipped: true,
        reason: "OAUTH_USER",
        provider: "GOOGLE",
      });
    });
  });

  // ── resetPassword ─────────────────────────────────────────────────────────

  describe("resetPassword", () => {
    const validToken = "a".repeat(64); // raw 64-hex (matches regex)
    // SHA-256("aaaa...") — precomputed to assert hash lookup
    function sha256Hex(input: string): string {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      return require("crypto").createHash("sha256").update(input).digest("hex");
    }

    it("rotates password + consumes token + revokes refresh tokens (atomic)", async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "tok-1",
        userId: "user-1",
        tokenHash: sha256Hex(validToken),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        user: {
          id: "user-1",
          email: "user@example.com",
          isActive: true,
          authProvider: "LOCAL",
        },
      });

      await service.resetPassword({
        token: validToken,
        newPassword: "newSecret123",
      });

      // The reset runs inside a callback transaction (ADR 0015: consume token
      // + rotate password + revoke every session).
      const txArg = mockPrisma.$transaction.mock.calls[0][0];
      expect(typeof txArg).toBe("function");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ authRevision: { increment: 1 } }),
        }),
      );
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });

      // Audit captured
      const event = mockPrisma.authEvent.create.mock.calls[0][0].data;
      expect(event.type).toBe("PASSWORD_RESET_COMPLETED");
      expect(event.userId).toBe("user-1");
    });

    it("throws 410 GONE for an expired token", async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "tok-1",
        userId: "user-1",
        tokenHash: sha256Hex(validToken),
        expiresAt: new Date(Date.now() - 1000),
        consumedAt: null,
        user: { id: "user-1", isActive: true, authProvider: "LOCAL" },
      });

      await expect(
        service.resetPassword({
          token: validToken,
          newPassword: "newSecret123",
        }),
      ).rejects.toMatchObject({ status: 410 });
    });

    it("throws 410 for a consumed token (no replay)", async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "tok-1",
        userId: "user-1",
        tokenHash: sha256Hex(validToken),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
        user: { id: "user-1", isActive: true, authProvider: "LOCAL" },
      });

      await expect(
        service.resetPassword({
          token: validToken,
          newPassword: "newSecret123",
        }),
      ).rejects.toMatchObject({ status: 410 });
    });

    it("throws 410 for an OAuth user (no password to reset)", async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "tok-1",
        userId: "user-google",
        tokenHash: sha256Hex(validToken),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        user: { id: "user-google", isActive: true, authProvider: "GOOGLE" },
      });

      await expect(
        service.resetPassword({
          token: validToken,
          newPassword: "newSecret123",
        }),
      ).rejects.toMatchObject({ status: 410 });
    });
  });

  // ── verifyEmail ───────────────────────────────────────────────────────────

  describe("verifyEmail", () => {
    const validToken = "b".repeat(64);

    it("marks user.emailVerified=true and consumes the token", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: "tok-2",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        user: { id: "user-1", email: "user@example.com", emailVerified: false },
      });

      const result = await service.verifyEmail({ token: validToken });

      expect(result).toEqual({ ok: true, userId: "user-1" });

      const event = mockPrisma.authEvent.create.mock.calls[0][0].data;
      expect(event.type).toBe("EMAIL_VERIFIED");
      expect(event.userId).toBe("user-1");
    });

    it("throws 410 for an unknown / expired / consumed token", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyEmail({ token: validToken }),
      ).rejects.toMatchObject({
        status: 410,
      });
    });
  });

  // ── resendVerification ────────────────────────────────────────────────────

  describe("resendVerification", () => {
    /** An unverified LOCAL account — the one case that should receive mail. */
    const unverifiedLocal = {
      id: "user-1",
      email: "user@example.com",
      name: "Ana Pérez",
      isActive: true,
      authProvider: "LOCAL",
      emailVerified: false,
    };

    /** The audit row for the request (there is exactly one per call). */
    const auditedEvent = () =>
      mockPrisma.authEvent.create.mock.calls[0][0].data;

    it("reserves a slot, queues a fresh link, and audits it", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(unverifiedLocal);

      await service.resendVerification(
        { email: "user@example.com" },
        { ipAddress: "1.2.3.4" },
      );

      // A new token row, hashed — the raw value only ever goes in the email.
      const tokenCall =
        mockPrisma.emailVerificationToken.create.mock.calls[0][0];
      expect(tokenCall.data.userId).toBe("user-1");
      expect(tokenCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(tokenCall.data.expiresAt).toBeInstanceOf(Date);

      // Into the queue, not to the provider: the response must not wait on
      // Resend. The worker delivers it.
      expect(mockJobs.enqueueEmail).toHaveBeenCalledTimes(1);
      expect(mockResend.send).not.toHaveBeenCalled();
      const job = mockJobs.enqueueEmail.mock.calls[0][0];
      expect(job.to).toBe("user@example.com");
      expect(job.tag).toBe("verify-email");
      expect(job.html).toContain("https://app.example.com/verify-email?token=");

      const event = auditedEvent();
      expect(event.type).toBe("EMAIL_VERIFICATION_REQUESTED");
      expect(event.userId).toBe("user-1");
      expect(event.ipAddress).toBe("1.2.3.4");
      // `queued`, not `sent`: reaching the queue says nothing about delivery.
      expect(event.metadata).toEqual({ queued: true });
    });

    it("takes the budget lock before counting, inside one transaction", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(unverifiedLocal);
      const order: string[] = [];
      mockPrisma.$executeRaw.mockImplementation(async () => {
        order.push("lock");
        return 0;
      });
      mockPrisma.emailVerificationToken.count.mockImplementation(async () => {
        order.push("count");
        return 0;
      });
      mockPrisma.emailVerificationToken.create.mockImplementation(async () => {
        order.push("create");
        return undefined;
      });

      await service.resendVerification({ email: "user@example.com" });

      // The mock can't show the lock SERIALISES anything — that's what the
      // PostgreSQL suite is for. What it can show is the shape: one callback
      // transaction, the lock first, then the count, then the reservation.
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(typeof mockPrisma.$transaction.mock.calls[0][0]).toBe("function");
      expect(order).toEqual(["lock", "count", "create"]);
      const sql = mockPrisma.$executeRaw.mock
        .calls[0][0] as TemplateStringsArray;
      expect(sql.join("?")).toContain("pg_advisory_xact_lock");
      expect(mockPrisma.$executeRaw.mock.calls[0][1]).toBe(
        "email-verification:user-1",
      );
    });

    // ── the no-leak contract ────────────────────────────────────────────────
    //
    // Each of these asserts the SAME observable outcome — resolves, sends
    // nothing — for a different internal reason. That sameness IS the
    // property: an endpoint whose answer varied by branch would be an oracle
    // for "which addresses have accounts here", and the already-verified
    // branch would leak a second bit on top of that.

    it("resolves without leaking when the address is unknown", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resendVerification({ email: "ghost@example.com" }),
      ).resolves.toBeUndefined();

      expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(mockJobs.enqueueEmail).not.toHaveBeenCalled();

      const event = auditedEvent();
      expect(event.type).toBe("EMAIL_VERIFICATION_REQUESTED");
      expect(event.userId).toBeNull();
      expect(event.email).toBe("ghost@example.com");
      expect(event.metadata).toMatchObject({
        skipped: true,
        reason: "USER_NOT_FOUND",
      });
    });

    it("resolves without leaking when the account is already verified", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...unverifiedLocal,
        emailVerified: true,
      });

      await expect(
        service.resendVerification({ email: "user@example.com" }),
      ).resolves.toBeUndefined();

      // Nothing to verify — and, just as important, nothing in the response
      // that says so.
      expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(mockJobs.enqueueEmail).not.toHaveBeenCalled();
      expect(auditedEvent().metadata).toMatchObject({
        skipped: true,
        reason: "ALREADY_VERIFIED",
      });
    });

    it("resolves without leaking when the account is inactive", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...unverifiedLocal,
        isActive: false,
      });

      await expect(
        service.resendVerification({ email: "user@example.com" }),
      ).resolves.toBeUndefined();

      expect(mockJobs.enqueueEmail).not.toHaveBeenCalled();
      const event = auditedEvent();
      // Indistinguishable from unknown to the caller; the log keeps the
      // difference, and does it without asserting an identity we refused.
      expect(event.userId).toBeNull();
      expect(event.metadata).toMatchObject({
        skipped: true,
        reason: "INACTIVE",
      });
    });

    it("skips OAuth accounts — the provider already vouched for the address", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...unverifiedLocal,
        email: "user@gmail.com",
        authProvider: "GOOGLE",
      });

      await service.resendVerification({ email: "user@gmail.com" });

      expect(mockJobs.enqueueEmail).not.toHaveBeenCalled();
      expect(auditedEvent().metadata).toMatchObject({
        skipped: true,
        reason: "OAUTH_USER",
        provider: "GOOGLE",
      });
    });

    it("looks the address up exactly first, trimmed — the key login() uses", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(unverifiedLocal);

      await service.resendVerification({ email: "  User@Example.COM \n" });

      // Trimmed, NOT lowercased: register() stores the address as typed.
      expect(mockPrisma.user.findUnique.mock.calls[0][0].where).toEqual({
        email: "User@Example.COM",
      });
      // An exact hit never needs the fallback.
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
      expect(mockJobs.enqueueEmail).toHaveBeenCalledTimes(1);
    });

    it("reaches an account stored with capitals when it's typed in lowercase", async () => {
      // The defect found on staging on 2026-11-23: the account exists as
      // `Ana@Example.com`, the request says `ana@example.com`, and the first
      // version answered 200 and did nothing — audited as USER_NOT_FOUND.
      const stored = { ...unverifiedLocal, email: "Ana@Example.com" };
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findMany.mockResolvedValue([stored]);

      await service.resendVerification({ email: "ana@example.com" });

      expect(mockPrisma.user.findMany.mock.calls[0][0].where).toEqual({
        email: { equals: "ana@example.com", mode: "insensitive" },
      });
      // Delivered to the address as it was STORED.
      expect(mockJobs.enqueueEmail).toHaveBeenCalledTimes(1);
      expect(mockJobs.enqueueEmail.mock.calls[0][0].to).toBe("Ana@Example.com");
      expect(auditedEvent().metadata).toEqual({ queued: true });
    });

    it("refuses to guess when two accounts differ only by case", async () => {
      // The column is unique case-sensitively, so this can exist. Picking one
      // would send a link to whichever row came first.
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findMany.mockResolvedValue([
        { ...unverifiedLocal, id: "user-a", email: "Ana@Example.com" },
        { ...unverifiedLocal, id: "user-b", email: "ANA@example.com" },
      ]);

      await expect(
        service.resendVerification({ email: "ana@example.com" }),
      ).resolves.toBeUndefined();

      expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(mockJobs.enqueueEmail).not.toHaveBeenCalled();
      const event = auditedEvent();
      expect(event.userId).toBeNull();
      expect(event.metadata).toMatchObject({
        skipped: true,
        reason: "AMBIGUOUS_CASE",
      });
    });

    // ── the per-address budget ──────────────────────────────────────────────

    it("refuses to send once the address is at its hourly ceiling", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(unverifiedLocal);
      mockPrisma.emailVerificationToken.count.mockResolvedValue(3);

      await expect(
        service.resendVerification({ email: "user@example.com" }),
      ).resolves.toBeUndefined();

      expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(mockJobs.enqueueEmail).not.toHaveBeenCalled();
      expect(auditedEvent().metadata).toMatchObject({
        skipped: true,
        reason: "ADDRESS_RATE_LIMITED",
        sentInWindow: 3,
      });
    });

    it("still sends one below the ceiling", async () => {
      // The control for the test above. Without it, a ceiling of zero — or a
      // comparison stuck at `true` — would read as a passing rate limit.
      mockPrisma.user.findUnique.mockResolvedValue(unverifiedLocal);
      mockPrisma.emailVerificationToken.count.mockResolvedValue(2);

      await service.resendVerification({ email: "user@example.com" });

      expect(mockJobs.enqueueEmail).toHaveBeenCalledTimes(1);
      expect(auditedEvent().metadata).toEqual({ queued: true });
    });

    it("counts the budget per account over a trailing hour", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(unverifiedLocal);

      const before = Date.now();
      await service.resendVerification({ email: "user@example.com" });
      const after = Date.now();

      const where = mockPrisma.emailVerificationToken.count.mock.calls[0][0]
        .where as { userId: string; createdAt: { gte: Date } };

      // Keyed by the account under attack, not by the caller.
      expect(where.userId).toBe("user-1");
      // One hour back, give or take the time the call itself took. Asserting
      // the window — rather than just "some date" — is what keeps the budget
      // from quietly widening to a day.
      expect(where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(
        before - 3600_000 - 1000,
      );
      expect(where.createdAt.gte.getTime()).toBeLessThanOrEqual(
        after - 3600_000 + 1000,
      );
    });

    it("still resolves, and records it, when the email can't be queued", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(unverifiedLocal);
      mockJobs.enqueueEmail.mockRejectedValueOnce(new Error("redis is down"));

      await expect(
        service.resendVerification({ email: "user@example.com" }),
      ).resolves.toBeUndefined();

      // The row was written before queueing, so the attempt spent budget —
      // deliberate, so an outage can't become an unmetered retry loop.
      expect(mockPrisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      expect(auditedEvent().metadata).toEqual({ enqueueFailed: true });
    });

    it("still resolves when the reservation itself fails", async () => {
      // The reservation only runs on the branch that CAN receive a resend.
      // If a database error escaped as a 500 here, that 500 would itself say
      // "this address has an unverified account".
      mockPrisma.user.findUnique.mockResolvedValue(unverifiedLocal);
      mockPrisma.$transaction.mockRejectedValueOnce(new Error("db hiccup"));

      await expect(
        service.resendVerification({ email: "user@example.com" }),
      ).resolves.toBeUndefined();

      expect(mockJobs.enqueueEmail).not.toHaveBeenCalled();
      expect(auditedEvent().metadata).toMatchObject({
        skipped: true,
        reason: "RESERVE_FAILED",
      });
    });
  });

  // ── register shares the same budget ───────────────────────────────────────

  describe("register · verification email", () => {
    /** Lets the fire-and-forget chain in register() run to completion. */
    const flush = () => new Promise((r) => setTimeout(r, 0));

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);
    });

    it("spends a slot through the same locked reservation, then sends in-process", async () => {
      await service.register({
        email: "test@example.com",
        password: "Password123!",
        name: "Test User",
      });
      await flush();

      expect(mockPrisma.$executeRaw.mock.calls[0][1]).toBe(
        `email-verification:${mockUser.id}`,
      );
      expect(mockPrisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      // In-process, as accepted with the mail journey: register doesn't
      // await it, so its latency was never on the response.
      expect(mockResend.send).toHaveBeenCalledTimes(1);
      expect(mockJobs.enqueueEmail).not.toHaveBeenCalled();
    });

    it("doesn't send when a racing resend already spent the budget", async () => {
      mockPrisma.emailVerificationToken.count.mockResolvedValue(3);

      await service.register({
        email: "test@example.com",
        password: "Password123!",
        name: "Test User",
      });
      await flush();

      expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(mockResend.send).not.toHaveBeenCalled();
    });
  });

  // ── loginWithGoogle ───────────────────────────────────────────────────────

  describe("loginWithGoogle", () => {
    const validIdToken = "x".repeat(128);

    it("returns 400 OAUTH_NOT_CONFIGURED when GOOGLE_CLIENT_ID is unset", async () => {
      mockGoogleVerifier.isEnabled.mockReturnValueOnce(false);

      await expect(
        service.loginWithGoogle({ idToken: validIdToken }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("creates a new user when providerId is new and email is free", async () => {
      mockGoogleVerifier.verify.mockResolvedValue({
        sub: "google-sub-123",
        email: "new@gmail.com",
        emailVerified: true,
        name: "New Person",
        picture: "https://example.com/avatar.png",
      });
      // No existing user by providerId
      mockPrisma.user.findFirst.mockResolvedValue(null);
      // No collision by email
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "user-new",
        email: "new@gmail.com",
        name: "New Person",
        role: "USER",
        plan: "FREE",
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const res = await service.loginWithGoogle({ idToken: validIdToken });

      expect(res.accessToken).toBe("mock-access-token");
      const created = mockPrisma.user.create.mock.calls[0][0].data;
      expect(created.authProvider).toBe("GOOGLE");
      expect(created.providerId).toBe("google-sub-123");
      expect(created.passwordHash).toBeNull();
      expect(created.emailVerified).toBe(true);

      const types = mockPrisma.authEvent.create.mock.calls.map(
        (c) => c[0].data.type,
      );
      expect(types).toContain("OAUTH_REGISTER");
    });

    it("returns tokens for a returning GOOGLE user (by providerId)", async () => {
      mockGoogleVerifier.verify.mockResolvedValue({
        sub: "google-sub-123",
        email: "user@gmail.com",
        emailVerified: true,
        name: "User",
        picture: null,
      });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: "user-existing",
        email: "user@gmail.com",
        name: "User",
        role: "USER",
        plan: "FREE",
        isActive: true,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const res = await service.loginWithGoogle({ idToken: validIdToken });

      expect(res.accessToken).toBe("mock-access-token");
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      const types = mockPrisma.authEvent.create.mock.calls.map(
        (c) => c[0].data.type,
      );
      expect(types).toContain("OAUTH_LOGIN");
    });

    it("rejects when the Google email collides with a LOCAL user (no auto-link)", async () => {
      mockGoogleVerifier.verify.mockResolvedValue({
        sub: "google-sub-123",
        email: "existing@example.com",
        emailVerified: true,
        name: "Existing",
        picture: null,
      });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-local",
        authProvider: "LOCAL",
      });

      await expect(
        service.loginWithGoogle({ idToken: validIdToken }),
      ).rejects.toMatchObject({ status: 409 });

      const event = mockPrisma.authEvent.create.mock.calls[0][0].data;
      expect(event.type).toBe("LOGIN_FAIL");
      expect(event.metadata).toMatchObject({ reason: "PROVIDER_COLLISION" });
    });
  });
});
