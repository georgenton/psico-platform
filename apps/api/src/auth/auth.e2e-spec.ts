import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import request from "supertest";
import * as bcrypt from "bcryptjs";
import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";

/**
 * First end-to-end test of the API stack. Exercises:
 *   1. ValidationPipe (400 + envelope on bad body)
 *   2. Global prefix (/api/* mounted, /auth/* not)
 *   3. JwtAuthGuard (401 on protected endpoint without bearer)
 *   4. ThrottlerGuard (429 after exceeding /api/auth/login limit)
 *   5. HttpExceptionFilter (consistent envelope across all error sources)
 *   6. Audit log writes (AuthEvent.create called with the right shape)
 *
 * Does NOT exercise:
 *   - Real DB writes (Prisma is mocked — that's coverage of the *integration*,
 *     not of Prisma queries themselves).
 *   - Real OAuth or Stripe (those are stubbed via env).
 *
 * Future sprints add testcontainers for real Postgres E2E if needed.
 */

describe("Auth · E2E", () => {
  let h: E2EHarness;

  beforeAll(async () => {
    // Silence Nest's startup logger noise in test output.
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    h = await createE2EApp();
  });

  afterAll(async () => {
    await closeE2EApp(h);
  });

  beforeEach(async () => {
    await h.resetMocks();
  });

  // ── Global prefix sanity check ────────────────────────────────────────────

  describe("global prefix", () => {
    it("exposes /api/auth/login (POST is registered)", async () => {
      h.prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(h.app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "ghost@example.com", password: "anything" });

      // 401 (credentials invalid) is fine — what we care about is "route exists".
      // A missing route would 404.
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("does NOT expose /auth/login (no prefix → 404)", async () => {
      const res = await request(h.app.getHttpServer())
        .post("/auth/login")
        .send({ email: "x@y.z", password: "anything" });

      expect(res.status).toBe(404);
    });

    it("exposes /health at the root (excluded from prefix)", async () => {
      const res = await request(h.app.getHttpServer()).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });

  // ── Validation pipe + error envelope ──────────────────────────────────────

  describe("validation + error envelope", () => {
    it("returns 400 + envelope when body is malformed", async () => {
      const res = await request(h.app.getHttpServer())
        .post("/api/auth/register")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        path: "/api/auth/register",
      });
      expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Array.isArray(res.body.details)).toBe(true);
    });

    it("returns 401 + envelope on wrong password", async () => {
      const realHash = await bcrypt.hash("rightPassword", 12);
      h.prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "user@example.com",
        name: "U",
        role: "USER",
        plan: "FREE",
        passwordHash: realHash,
        isActive: true,
      });

      const res = await request(h.app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "user@example.com", password: "wrongPassword" });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: "Invalid credentials",
      });
    });
  });

  // ── Happy path: register → login → logout ─────────────────────────────────

  describe("auth flow", () => {
    it("register: 201 + token pair + user", async () => {
      h.prisma.user.findUnique.mockResolvedValue(null);
      h.prisma.user.create.mockResolvedValue({
        id: "user-new",
        email: "new@example.com",
        name: "New",
        role: "USER",
        plan: "FREE",
      });
      h.prisma.refreshToken.create.mockResolvedValue({});

      const res = await request(h.app.getHttpServer())
        .post("/api/auth/register")
        .send({
          email: "new@example.com",
          password: "Password123!",
          name: "New User",
        });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toHaveLength(128); // 64 bytes hex
      expect(res.body.user.email).toBe("new@example.com");
    });

    it("login: 200 + tokens for valid credentials", async () => {
      const realHash = await bcrypt.hash("Password123!", 12);
      h.prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "user@example.com",
        name: "U",
        role: "USER",
        plan: "FREE",
        passwordHash: realHash,
        isActive: true,
      });
      h.prisma.refreshToken.create.mockResolvedValue({});

      const res = await request(h.app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "user@example.com", password: "Password123!" });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it("logout: 204 with a valid bearer; the audit log captures it", async () => {
      // Build a valid JWT by going through the login flow first.
      const realHash = await bcrypt.hash("Password123!", 12);
      h.prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "user@example.com",
        name: "U",
        role: "USER",
        plan: "FREE",
        passwordHash: realHash,
        isActive: true,
        authRevision: 0,
      });
      h.prisma.refreshToken.create.mockResolvedValue({});

      const loginRes = await request(h.app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "user@example.com", password: "Password123!" });

      const { accessToken, refreshToken } = loginRes.body;

      h.prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const logoutRes = await request(h.app.getHttpServer())
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ refreshToken });

      expect(logoutRes.status).toBe(204);

      // Audit: LOGIN_OK + LOGOUT both fired.
      const types = h.prisma.authEvent.create.mock.calls.map(
        (c: unknown[]) => (c[0] as { data: { type: string } }).data.type,
      );
      expect(types).toContain("LOGIN_OK");
      expect(types).toContain("LOGOUT");
    });

    it("logout: 401 without bearer token", async () => {
      const res = await request(h.app.getHttpServer())
        .post("/api/auth/logout")
        .send({ refreshToken: "anything" });

      expect(res.status).toBe(401);
    });
  });

  // ── S2: email flows ───────────────────────────────────────────────────────

  describe("forgot-password / reset-password / verify-email", () => {
    it("forgot-password always returns 200 (no leak) — even on unknown email", async () => {
      h.prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(h.app.getHttpServer())
        .post("/api/auth/forgot-password")
        .send({ email: "ghost@example.com" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("forgot-password validates email format → 400 envelope", async () => {
      const res = await request(h.app.getHttpServer())
        .post("/api/auth/forgot-password")
        .send({ email: "not-an-email" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("reset-password with malformed token → 400", async () => {
      const res = await request(h.app.getHttpServer())
        .post("/api/auth/reset-password")
        .send({ token: "short", newPassword: "newSecret123" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("reset-password with unknown token → 410 GONE", async () => {
      h.prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      const res = await request(h.app.getHttpServer())
        .post("/api/auth/reset-password")
        .send({
          token: "a".repeat(64),
          newPassword: "newSecret123",
        });

      expect(res.status).toBe(410);
      expect(res.body.code).toBe("TOKEN_INVALID_OR_EXPIRED");
    });

    it("verify-email with unknown token → 410 GONE", async () => {
      h.prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      const res = await request(h.app.getHttpServer())
        .post("/api/auth/verify-email")
        .send({ token: "b".repeat(64) });

      expect(res.status).toBe(410);
      expect(res.body.code).toBe("TOKEN_INVALID_OR_EXPIRED");
    });
  });

  // ── S2: OAuth Google ──────────────────────────────────────────────────────

  describe("oauth/google", () => {
    it("returns 400 OAUTH_NOT_CONFIGURED when GOOGLE_CLIENT_ID is unset", async () => {
      // setup-env.ts intentionally leaves GOOGLE_CLIENT_ID empty for tests,
      // so the verifier reports isEnabled=false and the service short-circuits.
      const res = await request(h.app.getHttpServer())
        .post("/api/auth/oauth/google")
        .send({ idToken: "x".repeat(128) });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("OAUTH_NOT_CONFIGURED");
    });

    it("validates idToken format → 400 on short token", async () => {
      const res = await request(h.app.getHttpServer())
        .post("/api/auth/oauth/google")
        .send({ idToken: "short" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── ThrottlerGuard ────────────────────────────────────────────────────────

  describe("throttler", () => {
    it("blocks the 6th login attempt within the 15min window", async () => {
      // Mock so every call returns "wrong creds" (cheap path, no bcrypt cost).
      h.prisma.user.findUnique.mockResolvedValue(null);

      // Bombard the same endpoint with the same IP (supertest defaults to 127.0.0.1).
      // The throttle is 5/15min/IP — request #6 must 429.
      let firstBlockAt = 0;
      for (let i = 1; i <= 10; i++) {
        const res = await request(h.app.getHttpServer())
          .post("/api/auth/login")
          .send({ email: `x${i}@y.z`, password: "any" });
        if (res.status === 429 && firstBlockAt === 0) {
          firstBlockAt = i;
          // Verify the envelope on the throttled response.
          expect(res.body).toMatchObject({
            statusCode: 429,
            code: "RATE_LIMIT_EXCEEDED",
          });
          break;
        }
      }

      expect(firstBlockAt).toBe(6);
    });

    it("counts the throttler per X-Forwarded-For IP (trust proxy enabled)", async () => {
      // Without `app.set("trust proxy", 1)` Express would return the IP of
      // Railway's internal proxy for every request — meaning 5 logins
      // anywhere in the world would 429 the entire planet. This test guards
      // that wiring.
      h.prisma.user.findUnique.mockResolvedValue(null);

      // 5 hits from IP A — all should succeed (not throttled).
      for (let i = 1; i <= 5; i++) {
        const res = await request(h.app.getHttpServer())
          .post("/api/auth/login")
          .set("X-Forwarded-For", "203.0.113.10")
          .send({ email: `a${i}@x.y`, password: "any" });
        expect(res.status).not.toBe(429);
      }

      // IP A's 6th hit IS throttled.
      const ipAOver = await request(h.app.getHttpServer())
        .post("/api/auth/login")
        .set("X-Forwarded-For", "203.0.113.10")
        .send({ email: `a6@x.y`, password: "any" });
      expect(ipAOver.status).toBe(429);

      // But a DIFFERENT IP must NOT be affected — its counter starts at zero.
      const ipBFresh = await request(h.app.getHttpServer())
        .post("/api/auth/login")
        .set("X-Forwarded-For", "198.51.100.20")
        .send({ email: "b@x.y", password: "any" });
      expect(ipBFresh.status).not.toBe(429);
    });
  });
});
