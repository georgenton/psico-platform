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
  },
  refreshToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
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
  },
  $transaction: vi.fn(),
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

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish default async resolutions cleared by clearAllMocks.
    mockPrisma.authEvent.create.mockResolvedValue(undefined);
    mockPrisma.emailVerificationToken.create.mockResolvedValue(undefined);
    mockResend.send.mockResolvedValue(undefined);
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

      // Three writes in the transaction
      const txCalls = mockPrisma.$transaction.mock.calls[0][0];
      expect(Array.isArray(txCalls)).toBe(true);

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
