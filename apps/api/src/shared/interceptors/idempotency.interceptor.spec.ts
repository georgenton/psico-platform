import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BadRequestException, Logger } from "@nestjs/common";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { of } from "rxjs";
import { firstValueFrom } from "rxjs";
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const RedisMock = require("ioredis-mock");
import type IoRedis from "ioredis";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import {
  IDEMPOTENT_KEY,
  type IdempotencyOptions,
} from "../decorators/idempotent.decorator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext({
  headers = {},
  method = "POST",
  path = "/api/diario/entries",
  userId = "user-1",
  routePath = "/api/diario/entries",
  responseStatusCode = 201,
}: {
  headers?: Record<string, string>;
  method?: string;
  path?: string;
  userId?: string | null;
  routePath?: string;
  responseStatusCode?: number;
} = {}): {
  context: ExecutionContext;
  response: {
    status: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
    statusCode: number;
  };
} {
  const response = {
    statusCode: responseStatusCode,
    status: vi.fn(),
    setHeader: vi.fn(),
  };
  const request = {
    headers,
    method,
    path,
    route: { path: routePath },
    user: userId ? { userId } : undefined,
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => () => undefined,
    getClass: () => function FakeController() {},
  } as unknown as ExecutionContext;
  return { context, response };
}

function makeReflector(options: IdempotencyOptions | undefined): Reflector {
  const reflector = new Reflector();
  vi.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
    if (key === IDEMPOTENT_KEY) return options;
    return undefined;
  });
  return reflector;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("IdempotencyInterceptor", () => {
  let redis: IoRedis;

  beforeEach(() => {
    redis = new RedisMock() as IoRedis;
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it("passes through when handler is NOT @Idempotent", async () => {
    const reflector = makeReflector(undefined);
    const interceptor = new IdempotencyInterceptor(reflector, redis);
    const { context } = makeContext();
    const handler: CallHandler = { handle: () => of({ id: "new" }) };

    const result = await firstValueFrom(
      interceptor.intercept(context, handler),
    );
    expect(result).toEqual({ id: "new" });
  });

  it("throws 400 when @Idempotent and no Idempotency-Key header", async () => {
    const reflector = makeReflector({});
    const interceptor = new IdempotencyInterceptor(reflector, redis);
    const { context } = makeContext({ headers: {} });
    const handler: CallHandler = { handle: () => of({ id: "new" }) };

    expect(() => interceptor.intercept(context, handler)).toThrow(
      BadRequestException,
    );
  });

  it("throws 400 when Idempotency-Key has invalid format", async () => {
    const reflector = makeReflector({});
    const interceptor = new IdempotencyInterceptor(reflector, redis);
    const { context } = makeContext({
      headers: { "idempotency-key": "short" }, // < 16 chars
    });
    const handler: CallHandler = { handle: () => of({ id: "new" }) };

    expect(() => interceptor.intercept(context, handler)).toThrow(
      BadRequestException,
    );
  });

  it("executes handler on first call with valid key + caches response", async () => {
    const reflector = makeReflector({});
    const interceptor = new IdempotencyInterceptor(reflector, redis);
    const key = "01234567-89ab-cdef-0123-456789abcdef";
    const { context } = makeContext({
      headers: { "idempotency-key": key },
    });

    const handleSpy = vi.fn().mockReturnValue(of({ id: "new", value: 42 }));
    const handler: CallHandler = { handle: handleSpy };

    const result = await firstValueFrom(
      interceptor.intercept(context, handler),
    );

    expect(result).toEqual({ id: "new", value: 42 });
    expect(handleSpy).toHaveBeenCalledOnce();

    // Cached in Redis
    const cached = await redis.get(
      `idemp:user-1:POST:/api/diario/entries:${key}`,
    );
    expect(cached).toBeTruthy();
    const parsed = JSON.parse(cached!);
    expect(parsed.body).toEqual({ id: "new", value: 42 });
    expect(parsed.status).toBe(201);
  });

  it("on second call with same key: returns cached body WITHOUT running handler", async () => {
    const reflector = makeReflector({});
    const interceptor = new IdempotencyInterceptor(reflector, redis);
    const key = "01234567-89ab-cdef-0123-456789abcdef";
    const { context: ctx1 } = makeContext({
      headers: { "idempotency-key": key },
    });

    // First call — populates the cache.
    const handle1 = vi.fn().mockReturnValue(of({ id: "first" }));
    await firstValueFrom(interceptor.intercept(ctx1, { handle: handle1 }));

    // Second call — should replay without invoking the handler.
    const { context: ctx2, response: res2 } = makeContext({
      headers: { "idempotency-key": key },
    });
    const handle2 = vi.fn().mockReturnValue(of({ id: "SHOULD NOT FIRE" }));
    const result = await firstValueFrom(
      interceptor.intercept(ctx2, { handle: handle2 }),
    );

    expect(result).toEqual({ id: "first" });
    expect(handle2).not.toHaveBeenCalled();
    expect(res2.setHeader).toHaveBeenCalledWith("Idempotency-Replay", "true");
  });

  it("isolates cache by route (same key on different endpoints does NOT collide)", async () => {
    const reflector = makeReflector({});
    const interceptor = new IdempotencyInterceptor(reflector, redis);
    const key = "01234567-89ab-cdef-0123-456789abcdef";

    const { context: ctxA } = makeContext({
      headers: { "idempotency-key": key },
      routePath: "/api/diario/entries",
    });
    const handlerA: CallHandler = { handle: () => of({ from: "diario" }) };
    await firstValueFrom(interceptor.intercept(ctxA, handlerA));

    const { context: ctxB } = makeContext({
      headers: { "idempotency-key": key },
      routePath: "/api/eco/messages",
    });
    const handlerB = vi.fn().mockReturnValue(of({ from: "eco" }));
    const result = await firstValueFrom(
      interceptor.intercept(ctxB, { handle: handlerB }),
    );

    // Each route gets its own execution.
    expect(handlerB).toHaveBeenCalledOnce();
    expect(result).toEqual({ from: "eco" });
  });

  it("isolates cache by user (same key from different users does NOT collide)", async () => {
    const reflector = makeReflector({});
    const interceptor = new IdempotencyInterceptor(reflector, redis);
    const key = "01234567-89ab-cdef-0123-456789abcdef";

    const { context: userA } = makeContext({
      headers: { "idempotency-key": key },
      userId: "user-A",
    });
    await firstValueFrom(
      interceptor.intercept(userA, { handle: () => of({ owner: "A" }) }),
    );

    const { context: userB } = makeContext({
      headers: { "idempotency-key": key },
      userId: "user-B",
    });
    const handlerB = vi.fn().mockReturnValue(of({ owner: "B" }));
    const result = await firstValueFrom(
      interceptor.intercept(userB, { handle: handlerB }),
    );

    expect(handlerB).toHaveBeenCalledOnce();
    expect(result).toEqual({ owner: "B" });
  });
});
