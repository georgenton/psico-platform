import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Reflector } from "@nestjs/core";
import type IoRedis from "ioredis";
import type { Observable } from "rxjs";
import { from, of } from "rxjs";
import { switchMap, tap } from "rxjs/operators";
import type { Request } from "express";
import {
  IDEMPOTENT_KEY,
  type IdempotencyOptions,
} from "../decorators/idempotent.decorator";
import { REDIS_CLIENT } from "../../redis";
import type { AuthenticatedUser } from "../../auth";

const HEADER_NAME = "idempotency-key";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const KEY_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;

interface CachedResponse {
  status: number;
  body: unknown;
  createdAt: string;
}

/**
 * Global interceptor that implements idempotent POSTs for handlers marked
 * with `@Idempotent()`.
 *
 * Algorithm (see ADR 0008):
 *   1. If the handler is NOT @Idempotent, pass through.
 *   2. Read header `Idempotency-Key`. If missing on an @Idempotent handler:
 *      - Production: throw 400 (client MUST send it — design intent).
 *      - Dev/Test (no enforcement): pass through. Reconsider in S1.
 *      For now we always enforce — failing loud is better than silent drift.
 *   3. Validate the key format (UUID-ish, 16-128 chars, alphanumeric+-_).
 *   4. Compose Redis key: `idemp:<userId|anon>:<route>:<key>`.
 *   5. GET — hit → return cached body. Miss → execute handler, SETEX result.
 *
 * Notes:
 *   - Cached responses include the HTTP status so retries get the same
 *     2xx/4xx the original request got.
 *   - Errors are NOT cached. If the first call throws, the second call
 *     re-runs the handler (intentional: don't trap clients in a 500 loop).
 *   - Route is part of the key so the same Idempotency-Key value used
 *     against two different endpoints doesn't collide.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: IoRedis,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<
      IdempotencyOptions | undefined
    >(IDEMPOTENT_KEY, [context.getHandler(), context.getClass()]);

    if (!options) return next.handle();

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const rawKey = request.headers[HEADER_NAME];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key) {
      throw new BadRequestException({
        code: "MISSING_IDEMPOTENCY_KEY",
        message:
          `This endpoint requires an "Idempotency-Key" header (UUID v7 recommended). ` +
          "Reusing the same key returns the original response without re-executing.",
      });
    }

    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException({
        code: "INVALID_IDEMPOTENCY_KEY",
        message:
          "Idempotency-Key must be 16–128 chars, alphanumeric with - and _",
      });
    }

    const userId = request.user?.userId ?? "anon";
    const route = `${request.method}:${request.route?.path ?? request.path}`;
    const cacheKey = `idemp:${userId}:${route}:${key}`;
    const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

    return from(this.redis.get(cacheKey)).pipe(
      switchMap((cached) => {
        if (cached) {
          const parsed = JSON.parse(cached) as CachedResponse;
          this.logger.log(
            `Idempotent replay: ${route} key=${key.slice(0, 8)}… → ${parsed.status} (orig ${parsed.createdAt})`,
          );
          const response = context.switchToHttp().getResponse<{
            status: (code: number) => unknown;
            setHeader: (name: string, value: string) => void;
          }>();
          response.status(parsed.status);
          response.setHeader("Idempotency-Replay", "true");
          return of(parsed.body);
        }

        return next.handle().pipe(
          tap((body) => {
            const response = context.switchToHttp().getResponse<{
              statusCode: number;
            }>();
            const cachePayload: CachedResponse = {
              status: response.statusCode ?? 200,
              body,
              createdAt: new Date().toISOString(),
            };
            // Fire-and-forget — we don't want to block the response on the
            // SET. Worst case: a retry within the next millisecond re-runs
            // the handler. Acceptable.
            this.redis
              .set(cacheKey, JSON.stringify(cachePayload), "EX", ttl)
              .catch((err) =>
                this.logger.warn(
                  `Failed to cache idempotent response for ${cacheKey}: ${(err as Error).message}`,
                ),
              );
          }),
        );
      }),
    );
  }
}
