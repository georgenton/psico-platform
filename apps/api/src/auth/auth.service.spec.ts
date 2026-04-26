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
    create: vi.fn(),
  },
  refreshToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
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
    };
    return config[key];
  }),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    // $transaction executes the callback and returns its result
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    service = new AuthService(
      mockPrisma as never,
      mockJwtService as unknown as JwtService,
      mockConfigService as unknown as ConfigService,
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
});
