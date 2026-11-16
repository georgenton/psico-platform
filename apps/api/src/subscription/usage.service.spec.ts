import { Plan, SubscriptionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageService } from "./usage.service";
import { ecoQuotaWindow } from "../eco/eco-quota";

vi.mock("@prisma/client", () => ({
  PrismaClient: class {},
  Plan: { FREE: "FREE", PRO: "PRO", ANNUAL: "ANNUAL", B2B: "B2B" },
  SubscriptionStatus: {
    ACTIVE: "ACTIVE",
    TRIALING: "TRIALING",
    PAST_DUE: "PAST_DUE",
    CANCELED: "CANCELED",
    INCOMPLETE: "INCOMPLETE",
  },
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────

const USER_ID = "user-abc";
const SUB_START = new Date("2026-05-01T00:00:00Z");
const SUB_END = new Date("2026-06-01T00:00:00Z");

function makePrismaMock(opts: {
  hasActiveSub?: boolean;
  plan?: Plan;
  diaryCount?: number;
  progressInPeriod?: Array<{
    chapter: { bookId: string; book: { totalChapters: number } };
  }>;
  allTimeProgress?: Array<{ chapterId: string }>;
  completedPerBook?: number;
  legacyChapterCount?: number;
  chapterToBook?: Array<{ id: string; bookId: string }>;
  voiceSecondsSum?: number;
}) {
  return {
    subscription: {
      findUnique: vi.fn().mockResolvedValue(
        opts.hasActiveSub
          ? {
              currentPeriodStart: SUB_START,
              currentPeriodEnd: SUB_END,
              status: SubscriptionStatus.ACTIVE,
            }
          : null,
      ),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ plan: opts.plan ?? Plan.FREE }),
    },
    diaryEntry: {
      count: vi.fn().mockResolvedValue(opts.diaryCount ?? 0),
    },
    edition: { findFirst: vi.fn().mockResolvedValue(null) },
    revisionUnit: { count: vi.fn().mockResolvedValue(0) },
    userProgress: {
      findMany: vi.fn().mockResolvedValue(opts.progressInPeriod ?? []),
      groupBy: vi.fn().mockResolvedValue(opts.allTimeProgress ?? []),
      // Book completion now counts both identities through one helper.
      count: vi.fn().mockResolvedValue(opts.completedPerBook ?? 0),
    },
    chapter: {
      findMany: vi.fn().mockResolvedValue(opts.chapterToBook ?? []),
      // With no published edition, book completion falls back to counting
      // legacy chapters — these cases model books that have no Content Core
      // structure yet.
      count: vi.fn().mockResolvedValue(opts.legacyChapterCount ?? 0),
    },
    voiceTranscription: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { durationSec: opts.voiceSecondsSum ?? 0 },
      }),
    },
    ecoMessage: {
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

function makeRedisMock() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(0),
    scanStream: vi.fn().mockReturnValue({
      // Async iterator returning no keys by default.
      [Symbol.asyncIterator]: async function* () {
        // Nothing to yield.
      },
    }),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("UsageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("period resolution", () => {
    it("usa el periodo de la suscripción ACTIVE", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.PRO });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.period.source).toBe("subscription");
      expect(result.period.start).toEqual(SUB_START);
      expect(result.period.end).toEqual(SUB_END);
    });

    it("cae al mes calendario cuando no hay suscripción activa", async () => {
      const prisma = makePrismaMock({ hasActiveSub: false, plan: Plan.FREE });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.period.source).toBe("calendar-month");
      // El start es 1ro de mes UTC, el end es 1ro del mes siguiente.
      expect(result.period.start.getUTCDate()).toBe(1);
      expect(result.period.end.getUTCDate()).toBe(1);
    });
  });

  describe("quotas", () => {
    it("FREE: eco=10 por DÍA UTC, voice=0, diary=null", async () => {
      // Esta prueba decía `eco.quota === 20`, y fijaba el defecto: 20 sale de
      // `PLAN_QUOTAS.FREE.eco` y Eco **no lo aplica nunca** en FREE — aplica
      // diez por día UTC. Una cuenta FREE veía «de 20» justo cuando se le
      // negaba el mensaje 11.
      const prisma = makePrismaMock({ plan: Plan.FREE });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.eco.quota).toBe(10);
      expect(result.eco.window.kind).toBe("utc-day");
      expect(result.eco.resetsAt).toEqual(result.eco.window.end);
      // Y las demás ventanas NO se mueven para hacer encajar Eco: voz, Diario
      // y libros siguen en el periodo de facturación.
      expect(result.voice.quota).toBe(0);
      expect(result.diary.quota).toBeNull();
      expect(result.period.source).toBe("calendar-month");
    });

    it("la ventana que informa es la MISMA que aplicaría la puerta", async () => {
      // El invariante que cierra el frente: si estas dos cosas pueden
      // discrepar, vuelven a discrepar. Las dos salen de `ecoQuotaWindow`, y
      // aquí se comprueba contra la función, no contra un literal.
      for (const [plan, sub] of [
        [Plan.FREE, false],
        [Plan.PRO, true],
        [Plan.PRO, false],
        [Plan.B2B, true],
      ] as const) {
        const prisma = makePrismaMock({ plan, hasActiveSub: sub });
        const service = new UsageService(
          prisma as never,
          makeRedisMock() as never,
        );
        const result = await service.getUsage(USER_ID);
        const esperada = ecoQuotaWindow(
          plan,
          sub
            ? {
                currentPeriodStart: SUB_START,
                currentPeriodEnd: SUB_END,
                status: SubscriptionStatus.ACTIVE,
              }
            : null,
          new Date(),
        );
        expect(result.eco.quota).toBe(esperada.limit);
        expect(result.eco.window.kind).toBe(esperada.kind);
        expect(result.eco.window.start.toISOString()).toBe(
          esperada.start.toISOString(),
        );
      }
    });

    it("B2B: sin cupo de Eco, y entonces sin reinicio", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.B2B });
      const service = new UsageService(
        prisma as never,
        makeRedisMock() as never,
      );
      const result = await service.getUsage(USER_ID);
      expect(result.eco.quota).toBeNull();
      expect(result.eco.remaining).toBeNull();
      expect(result.eco.resetsAt).toBeNull();
    });

    it("el consumo del periodo se conserva, pero como estadística aparte", async () => {
      const prisma = makePrismaMock({ plan: Plan.FREE });
      const service = new UsageService(
        prisma as never,
        makeRedisMock() as never,
      );
      const result = await service.getUsage(USER_ID);
      // Sigue estando — es información real — y ya no es lo que se empareja
      // con el cupo.
      expect(result.eco).toHaveProperty("messagesThisPeriod");
      expect(typeof result.eco.messagesThisPeriod).toBe("number");
    });

    it("PRO: eco=200, voice=120, diary=null", async () => {
      const prisma = makePrismaMock({
        hasActiveSub: true,
        plan: Plan.PRO,
      });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.eco.quota).toBe(200);
      expect(result.voice.quota).toBe(120);
      expect(result.diary.quota).toBeNull();
    });

    it("B2B: todos los quotas null (unlimited)", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.B2B });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.eco.quota).toBeNull();
      expect(result.voice.quota).toBeNull();
      expect(result.diary.quota).toBeNull();
    });
  });

  describe("counters", () => {
    it("diary entries vienen del count de DiaryEntry en el periodo", async () => {
      const prisma = makePrismaMock({
        hasActiveSub: true,
        plan: Plan.PRO,
        diaryCount: 9,
      });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.diary.entriesThisPeriod).toBe(9);
    });

    it("eco queda en 0 hasta S10", async () => {
      const prisma = makePrismaMock({ plan: Plan.PRO, hasActiveSub: true });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.eco.messagesThisPeriod).toBe(0);
    });

    it("voice.minutesThisPeriod = SUM(durationSec) / 60 rounded to 1 dp (S8)", async () => {
      const prisma = makePrismaMock({
        plan: Plan.PRO,
        hasActiveSub: true,
        voiceSecondsSum: 154, // 2.566… min → rounds to 2.6
      });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.voice.minutesThisPeriod).toBe(2.6);
      expect(result.voice.quota).toBe(120);
    });

    it("booksCompleted suma 1 cuando el usuario terminó todos los capítulos en el periodo", async () => {
      const prisma = makePrismaMock({
        hasActiveSub: true,
        plan: Plan.PRO,
        // Book has 2 chapters; the reader finished both.
        progressInPeriod: [
          { chapter: { book: { id: "book-1", slug: "libro" } } },
        ],
        legacyChapterCount: 2,
        completedPerBook: 2,
      });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.books.completedThisPeriod).toBe(1);
    });

    it("booksCompleted=0 si solo terminó parcialmente", async () => {
      const prisma = makePrismaMock({
        hasActiveSub: true,
        plan: Plan.PRO,
        // Book has 3 chapters; the reader finished 2. The numerator counts
        // both identities now, so a partially-read mixed book still reads 0.
        progressInPeriod: [
          { chapter: { book: { id: "book-1", slug: "libro" } } },
        ],
        legacyChapterCount: 3,
        completedPerBook: 1,
      });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.books.completedThisPeriod).toBe(0);
    });
  });

  describe("cache", () => {
    it("cache hit: devuelve el payload de Redis sin tocar Prisma", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.PRO });
      const redis = makeRedisMock();
      // Pre-pueblo el cache con un payload conocido.
      redis.get.mockResolvedValue(
        JSON.stringify({
          plan: "PRO",
          period: {
            start: SUB_START.toISOString(),
            end: SUB_END.toISOString(),
            source: "subscription",
          },
          books: { completedThisPeriod: 42 },
          eco: {
            used: 7,
            quota: 200,
            remaining: 193,
            window: {
              start: SUB_START.toISOString(),
              end: SUB_END.toISOString(),
              kind: "subscription",
            },
            resetsAt: SUB_END.toISOString(),
            messagesThisPeriod: 7,
          },
          voice: { minutesThisPeriod: 0, quota: 120 },
          diary: { entriesThisPeriod: 100, quota: null },
        }),
      );
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);

      expect(result.books.completedThisPeriod).toBe(42);
      expect(result.diary.entriesThisPeriod).toBe(100);
      // Las fechas vienen hidratadas como Date. Son CINCO, no dos: la ventana
      // de Eco y su `resetsAt` se añadieron, y olvidar una dejaría al cliente
      // con una cadena donde espera una fecha sólo en el camino cacheado.
      expect(result.period.start).toBeInstanceOf(Date);
      expect(result.eco.window.start).toBeInstanceOf(Date);
      expect(result.eco.window.end).toBeInstanceOf(Date);
      expect(result.eco.resetsAt).toBeInstanceOf(Date);
      expect(result.eco.used).toBe(7);
      // Y NO hubo aggregation desde Prisma (diaryEntry.count nunca corrió).
      expect(prisma.diaryEntry.count).not.toHaveBeenCalled();
    });

    it("cache hit con payload corrupto: cae a recomputar (no lanza)", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.PRO });
      const redis = makeRedisMock();
      redis.get.mockResolvedValue("{not-json");
      const service = new UsageService(prisma as never, redis as never);

      // Si no lanza y nos devuelve un objeto válido, el fallback funciona.
      const result = await service.getUsage(USER_ID);
      expect(result.plan).toBe("PRO");
      expect(prisma.diaryEntry.count).toHaveBeenCalled();
    });

    it("un payload cacheado con la forma ANTERIOR también recomputa", async () => {
      // Esto no es hipotético: al desplegar este cambio hay payloads de la
      // forma vieja en Redis durante hasta cinco minutos. Sin el fallback,
      // `hydrateDates` tropezaría con `eco.window` ausente y la pantalla de
      // Mi Plan devolvería un error por una caché que caduca sola.
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.PRO });
      const redis = makeRedisMock();
      redis.get.mockResolvedValue(
        JSON.stringify({
          plan: "PRO",
          period: {
            start: SUB_START.toISOString(),
            end: SUB_END.toISOString(),
            source: "subscription",
          },
          books: { completedThisPeriod: 42 },
          // La forma vieja: sin `used`, sin `window`, sin `resetsAt`.
          eco: { messagesThisPeriod: 0, quota: 200 },
          voice: { minutesThisPeriod: 0, quota: 120 },
          diary: { entriesThisPeriod: 100, quota: null },
        }),
      );
      const service = new UsageService(prisma as never, redis as never);

      const result = await service.getUsage(USER_ID);
      // Recomputado: la cifra del payload viejo (42) no sobrevive, y el bloque
      // de Eco llega completo.
      expect(result.books.completedThisPeriod).not.toBe(42);
      expect(result.eco.window.kind).toBe("subscription");
      expect(result.eco.resetsAt).toBeInstanceOf(Date);
      expect(prisma.diaryEntry.count).toHaveBeenCalled();
    });

    it("la clave que ESCRIBE sigue cubierta por el patrón que BORRA", async () => {
      // Esta tanda añadió un segmento a la clave (el día UTC, porque la ventana
      // de Eco en FREE ES el día UTC). Si ese segmento rompiera el glob de
      // `invalidate`, la invalidación dejaría de encontrar nada: Eco llama a
      // `invalidate` después de cada mensaje, así que la persona seguiría viendo
      // su cuota anterior durante cinco minutos. Se comprueba la relación entre
      // las dos cosas, no cada una por su lado.
      const prisma = makePrismaMock({ plan: Plan.FREE });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      await service.getUsage(USER_ID);
      await new Promise((resolve) => setImmediate(resolve));

      const escrita = (redis.set.mock.calls[0]?.[0] ?? "") as string;
      expect(escrita).not.toBe("");

      await service.invalidate(USER_ID);
      const patron = (
        redis.scanStream.mock.calls[0]?.[0] as { match: string } | undefined
      )?.match;
      expect(patron).toBeDefined();
      // El glob de Redis, traducido: `*` es «cualquier cosa».
      const re = new RegExp(
        `^${patron!.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
      );
      expect(re.test(escrita)).toBe(true);
    });

    it("escribe en cache después de recomputar (fire-and-forget)", async () => {
      const prisma = makePrismaMock({ hasActiveSub: true, plan: Plan.PRO });
      const redis = makeRedisMock();
      const service = new UsageService(prisma as never, redis as never);

      await service.getUsage(USER_ID);

      // Esperamos al microtask queue para que el fire-and-forget corra.
      await new Promise((resolve) => setImmediate(resolve));

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^usage:user-abc:/),
        expect.any(String),
        "EX",
        5 * 60,
      );
    });
  });
});
