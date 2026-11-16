import { Inject, Injectable, Logger } from "@nestjs/common";
import { completedBookCount } from "../content-core/read/book-completion";
import type IoRedis from "ioredis";
import type { UsageResponse } from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { REDIS_CLIENT } from "../redis";
import { PLAN_QUOTAS } from "./quotas";
import {
  ecoQuotaWindow,
  ecoRemaining,
  ecoResetsAt,
  type EcoSubscriptionPeriod,
} from "../eco/eco-quota";

/**
 * UsageService — Sprint S7 aggregator.
 *
 * Returns one snapshot of the user's consumption for the current billing
 * period. Counter sources are live tables (DiaryEntry, UserProgress);
 * `EcoMessage` and `VoiceTranscription` modules don't exist yet so those
 * counters return 0 (placeholder) — they'll get wired up in S10 / S8.
 *
 * Caching strategy:
 *   - 5-minute Redis TTL keyed by `usage:<userId>:<periodStart-isoDate>`.
 *   - Mi Plan reloads on every visit but a chatty client (mobile pull-to-
 *     refresh) shouldn't melt our DB; 5 min is the sweet spot.
 *   - We DON'T invalidate on writes — a new diary entry just shows up next
 *     fetch. The freshness cost is negligible against the round-trip cost
 *     of broadcast invalidation.
 *
 * Period:
 *   - Active subscribers: use Subscription.currentPeriodStart/End.
 *   - FREE / no active sub: calendar month (UTC).
 *
 * Books completed:
 *   - Same definition as UsersService.computeStats — a book counts as
 *     completed iff the user has UserProgress for every published chapter.
 *     Scoped here to "the most recent completion within the period".
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);
  private static readonly CACHE_TTL_SECONDS = 5 * 60;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: IoRedis,
  ) {}

  async getUsage(userId: string): Promise<UsageResponse> {
    const ecoSub = await this.readSubscription(userId);
    const period = this.resolvePeriod(ecoSub);
    // El día UTC entra en la clave porque la ventana de Eco en FREE ES el día
    // UTC: sin él, una respuesta cacheada a las 23:58 seguiría anunciando el
    // reinicio de ayer durante los cinco minutos siguientes a medianoche.
    const utcDay = new Date().toISOString().slice(0, 10);
    const cacheKey = `usage:${userId}:${period.start.toISOString()}:${utcDay}`;

    // ── Cache hit ────────────────────────────────────────────────────────────
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return this.hydrateDates(JSON.parse(cached) as UsageResponse);
      } catch {
        // Bad payload — fall through to recompute. Don't bother logging:
        // happens once per format change and never again.
      }
    }

    // ── Live aggregation ─────────────────────────────────────────────────────
    const [
      user,
      diaryEntriesCount,
      progressInPeriod,
      voiceAggregate,
      ecoMessagesCount,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true },
      }),
      this.prisma.diaryEntry.count({
        where: {
          userId,
          createdAt: { gte: period.start, lt: period.end },
        },
      }),
      this.prisma.userProgress.findMany({
        where: {
          userId,
          completedAt: { gte: period.start, lt: period.end },
        },
        select: {
          chapter: {
            select: {
              bookId: true,
              book: { select: { id: true, slug: true } },
            },
          },
          // A native completion identifies its book through the edition.
          contentUnit: { select: { edition: { select: { slug: true } } } },
        },
      }),
      // Sprint S8: sum the user's voice transcription seconds in the period.
      this.prisma.voiceTranscription.aggregate({
        where: {
          userId,
          createdAt: { gte: period.start, lt: period.end },
        },
        _sum: { durationSec: true },
      }),
      // Sprint S10: count the user's Eco messages (USER role only — assistant
      // replies don't count against the quota) in the period.
      //
      // Se conserva, pero ya NO es lo que se presenta como cupo: es la
      // estadística del periodo de facturación. El cupo de Eco se resuelve
      // abajo, en la ventana que la puerta aplica de verdad.
      this.prisma.ecoMessage.count({
        where: {
          kind: "USER",
          createdAt: { gte: period.start, lt: period.end },
          thread: { userId },
        },
      }),
    ]);

    const plan = user?.plan ?? "FREE";
    const quotas = PLAN_QUOTAS[plan];

    // Which books the reader touched in this period, from BOTH identities: a
    // legacy chapter records progress against its Chapter, a native one against
    // its ContentUnit. Skipping either would under-count on a mixed book, which
    // is exactly the shape chapter authoring produces.
    const candidates = new Map<string, { id: string; slug: string }>();
    for (const row of progressInPeriod) {
      if (row.chapter) {
        candidates.set(row.chapter.book.id, {
          id: row.chapter.book.id,
          slug: row.chapter.book.slug,
        });
      } else if (row.contentUnit) {
        // Book stays legacy-owned in this phase, so the edition's slug is the
        // bridge back to it.
        const book = await this.prisma.book.findUnique({
          where: { slug: row.contentUnit.edition.slug },
          select: { id: true, slug: true },
        });
        if (book) candidates.set(book.id, book);
      }
    }

    // A book is complete when the reader has finished every chapter they can
    // currently open — counted against the published manifest, never against a
    // `Book.totalChapters` that goes stale the moment a native chapter exists.
    const completedBooks = await completedBookCount(this.prisma, {
      userId,
      books: [...candidates.values()],
    });

    // ── Eco: la MISMA ventana que aplica la puerta ──────────────────────────
    //
    // Antes esto publicaba `quota: PLAN_QUOTAS[plan].eco` (20 en FREE) junto al
    // consumo del mes, y Eco no aplica ninguna de las dos cosas en FREE: aplica
    // diez por día UTC. Una cuenta FREE veía «10 de 20» justo cuando se le
    // negaba el mensaje 11. Ahora las dos superficies preguntan a
    // `ecoQuotaWindow`, así que no pueden discrepar.
    //
    // `resolvePeriod` arriba NO se toca: es el periodo de facturación, y sigue
    // siendo el correcto para voz, Diario y libros.
    const ecoWindow = ecoQuotaWindow(plan, ecoSub, new Date());
    const ecoUsedInWindow = await this.prisma.ecoMessage.count({
      where: {
        kind: "USER",
        createdAt: { gte: ecoWindow.start, lt: ecoWindow.end },
        thread: { userId },
      },
    });

    const voiceSeconds = voiceAggregate._sum.durationSec ?? 0;
    const response: UsageResponse = {
      plan,
      period,
      books: { completedThisPeriod: completedBooks },
      eco: {
        used: ecoUsedInWindow,
        quota: ecoWindow.limit,
        remaining: ecoRemaining(ecoWindow, ecoUsedInWindow),
        window: {
          start: ecoWindow.start,
          end: ecoWindow.end,
          kind: ecoWindow.kind,
        },
        resetsAt: ecoResetsAt(ecoWindow),
        // La estadística del periodo de facturación, etiquetada como tal.
        messagesThisPeriod: ecoMessagesCount,
      },
      voice: {
        // Round to 0.1 min — what the UI displays. We keep the raw seconds
        // server-side (VoiceTranscription rows) for accurate quota math.
        minutesThisPeriod: Number((voiceSeconds / 60).toFixed(1)),
        quota: quotas.voice,
      },
      diary: { entriesThisPeriod: diaryEntriesCount, quota: quotas.diary },
    };

    // Fire-and-forget cache write — a failure here is harmless and we don't
    // want to add latency to the response path.
    void this.redis
      .set(
        cacheKey,
        JSON.stringify(response),
        "EX",
        UsageService.CACHE_TTL_SECONDS,
      )
      .catch((err) =>
        this.logger.warn(`Failed to cache usage: ${(err as Error).message}`),
      );

    return response;
  }

  /**
   * Invalidate the cache for a user. Called by the BullMQ daily-usage
   * processor after it rolls up yesterday's data — keeps the public endpoint
   * in lockstep with the rollup table without forcing every request to
   * refetch.
   */
  async invalidate(userId: string): Promise<void> {
    // Patterns: usage:<userId>:* — we don't know the exact period without
    // looking it up, and the user could have crossed a period boundary.
    // SCAN-DEL is cheap because the cardinality per user is at most 2-3
    // active keys.
    const stream = this.redis.scanStream({
      match: `usage:${userId}:*`,
      count: 100,
    });
    const keys: string[] = [];
    for await (const batch of stream) {
      keys.push(...(batch as string[]));
    }
    if (keys.length > 0) await this.redis.del(...keys);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  /**
   * La suscripción, leída UNA vez por petición.
   *
   * La necesitan dos cosas distintas: el periodo de facturación (voz, Diario,
   * libros) y la ventana de cuota de Eco. Leerla dos veces invitaría a que una
   * de las dos se quedara con otra fila.
   */
  private readSubscription(
    userId: string,
  ): Promise<EcoSubscriptionPeriod | null> {
    return this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        currentPeriodStart: true,
        currentPeriodEnd: true,
        status: true,
      },
    });
  }

  private resolvePeriod(
    sub: EcoSubscriptionPeriod | null,
  ): UsageResponse["period"] {
    if (
      sub &&
      (sub.status === "ACTIVE" ||
        sub.status === "TRIALING" ||
        sub.status === "PAST_DUE")
    ) {
      return {
        start: sub.currentPeriodStart,
        end: sub.currentPeriodEnd,
        source: "subscription",
      };
    }

    // Fallback: calendar month in UTC. FREE users + canceled subs land here.
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { start, end, source: "calendar-month" };
  }

  /**
   * JSON.parse turns Date back into strings. Re-hydrate every date field so the
   * cached response has the SAME shape as a freshly computed one.
   *
   * Son cinco, no dos: al periodo se le añadieron la ventana de Eco y su
   * `resetsAt`. Olvidar una deja al cliente con una cadena donde espera una
   * fecha **sólo en el camino cacheado**, que es la clase de defecto que
   * aparece a los cinco minutos y no en la primera prueba.
   */
  private hydrateDates(payload: UsageResponse): UsageResponse {
    return {
      ...payload,
      period: {
        ...payload.period,
        start: new Date(payload.period.start),
        end: new Date(payload.period.end),
      },
      eco: {
        ...payload.eco,
        window: {
          ...payload.eco.window,
          start: new Date(payload.eco.window.start),
          end: new Date(payload.eco.window.end),
        },
        resetsAt:
          payload.eco.resetsAt === null ? null : new Date(payload.eco.resetsAt),
      },
    };
  }
}
