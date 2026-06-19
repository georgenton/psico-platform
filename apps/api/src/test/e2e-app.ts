/**
 * E2E test harness. Boots the full AppModule with mocked PrismaService and a
 * fresh ioredis-mock per call. Use from a spec like:
 *
 * ```ts
 * import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";
 *
 * describe("Auth E2E", () => {
 *   let h: E2EHarness;
 *   beforeAll(async () => { h = await createE2EApp(); });
 *   afterAll(async () => { await closeE2EApp(h); });
 *   beforeEach(() => h.resetMocks());
 *
 *   it("registers", async () => {
 *     h.prisma.user.findUnique.mockResolvedValue(null);
 *     // ...
 *     await request(h.app.getHttpServer()).post("/api/auth/register").send(...)
 *   });
 * });
 * ```
 *
 * Why a harness instead of plain Test.createTestingModule per spec:
 *   - Mirrors main.ts wiring (setGlobalPrefix, useGlobalFilters, ValidationPipe)
 *     so what we test is what runs in production.
 *   - Single place to evolve when main.ts changes (Sprint S2 will add OAuth
 *     strategies, Sprint S11 will move the Stripe webhook).
 *   - Reset semantics centralized — no copy-paste of `vi.clearAllMocks()`
 *     in every spec.
 */

import "./setup-env";
import {
  RequestMethod,
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { vi } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const RedisMock = require("ioredis-mock");
import type IoRedis from "ioredis";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma";
import { REDIS_CLIENT } from "../redis";
import { HttpExceptionFilter } from "../shared";

/**
 * Programmable Prisma mock — every model.method is a `vi.fn()`. Tests use it
 * via `harness.prisma.<model>.<method>.mockResolvedValue(...)`.
 *
 * We intentionally do NOT auto-mock $transaction with a one-size-fits-all
 * behavior; specs configure it as needed (callback form vs array form).
 */
export type MockedPrisma = ReturnType<typeof makePrismaMock>;

function makePrismaMock() {
  const fn = () => vi.fn();
  return {
    user: {
      findUnique: fn(),
      findFirst: fn(),
      findMany: fn(),
      create: fn(),
      update: fn(),
      delete: fn(),
      count: fn(),
    },
    refreshToken: {
      findUnique: fn(),
      create: fn(),
      update: fn(),
      updateMany: fn(),
    },
    authEvent: {
      create: vi.fn().mockResolvedValue(undefined),
      findMany: fn(),
    },
    passwordResetToken: {
      findUnique: fn(),
      create: vi.fn().mockResolvedValue(undefined),
      update: fn(),
    },
    emailVerificationToken: {
      findUnique: fn(),
      create: vi.fn().mockResolvedValue(undefined),
      update: fn(),
    },
    profile: {
      upsert: fn(),
    },
    diaryEntry: {
      findMany: fn(),
      findFirst: fn(),
      findUnique: fn(),
      create: fn(),
      update: fn(),
      delete: fn(),
      count: fn(),
    },
    // Other models added on demand by future sprints.
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => unknown)({
          refreshToken: { create: vi.fn() },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
}

export interface E2EHarness {
  app: INestApplication;
  prisma: MockedPrisma;
  redis: IoRedis;
  /**
   * Resets ALL prisma mocks (clears calls + sets impl back to undefined) and
   * flushes the in-memory Redis. Call from `beforeEach` so tests don't bleed.
   */
  resetMocks: () => Promise<void>;
}

export async function createE2EApp(): Promise<E2EHarness> {
  const prisma = makePrismaMock();
  const redis = new RedisMock() as IoRedis;

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(REDIS_CLIENT)
    .useValue(redis)
    .compile();

  const app = moduleRef.createNestApplication();

  // Mirror main.ts — keep this in sync as production wiring evolves.
  // Trust the first proxy hop so `req.ip` reflects `X-Forwarded-For` in tests
  // and matches production behaviour behind Railway.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.ALL },
      { path: "subscriptions/webhook", method: RequestMethod.ALL },
    ],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: undefined,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();

  const resetMocks = async (): Promise<void> => {
    // Reset prisma mock state (clears calls, restores default impl).
    for (const model of Object.values(prisma)) {
      if (typeof model === "function") continue; // $transaction handled below
      for (const fn of Object.values(
        model as Record<string, ReturnType<typeof vi.fn>>,
      )) {
        if (
          typeof (fn as { mockReset?: () => void }).mockReset === "function"
        ) {
          (fn as { mockReset: () => void }).mockReset();
        }
      }
    }
    prisma.$transaction.mockReset();
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => unknown)({
          refreshToken: { create: vi.fn() },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
    // Restore the always-resolved default for authEvent.create.
    prisma.authEvent.create.mockResolvedValue(undefined);
    // Wipe the in-memory Redis (throttler counters, idempotency cache).
    await redis.flushall();
  };

  return { app, prisma, redis, resetMocks };
}

export async function closeE2EApp(h: E2EHarness): Promise<void> {
  await h.app.close();
  await h.redis.quit().catch(() => undefined);
}
