import {
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Plan, EcoMessageKind } from "@prisma/client";
import { firstValueFrom, lastValueFrom, toArray } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EcoService } from "./eco.service";

vi.mock("@prisma/client", () => ({
  PrismaClient: class {},
  Plan: { FREE: "FREE", PRO: "PRO", ANNUAL: "ANNUAL", B2B: "B2B" },
  EcoMessageKind: {
    USER: "USER",
    ASSISTANT: "ASSISTANT",
    CRISIS: "CRISIS",
    SUGGESTION: "SUGGESTION",
  },
  SubscriptionStatus: {
    ACTIVE: "ACTIVE",
    TRIALING: "TRIALING",
    PAST_DUE: "PAST_DUE",
    CANCELED: "CANCELED",
    INCOMPLETE: "INCOMPLETE",
  },
}));

// Anthropic SDK gets fully mocked — we exercise the streaming path with
// a fake `messages.stream` that takes a controllable token feed.
const capturados: Array<{ err: unknown; ctx: unknown }> = [];
vi.mock("../observability/sentry", () => ({
  captureException: (err: unknown, ctx: unknown) => {
    capturados.push({ err, ctx });
  },
  initSentry: () => {},
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn(),
      };
    },
  };
});

// ─── Test helpers ──────────────────────────────────────────────────────────

const USER_ID = "user-abc";
const THREAD_ID = "thread-1";

function makePrisma(
  opts: {
    plan?: Plan;
    threadOwned?: boolean;
    userMessagesInPeriod?: number;
    hasActiveSub?: boolean;
  } = {},
) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ plan: opts.plan ?? Plan.PRO }),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue(
        opts.hasActiveSub
          ? {
              currentPeriodStart: new Date("2026-05-01"),
              currentPeriodEnd: new Date("2026-06-01"),
              status: "ACTIVE",
            }
          : null,
      ),
    },
    ecoThread: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.threadOwned === false
            ? null
            : { id: THREAD_ID, userId: USER_ID },
        ),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi
        .fn()
        .mockResolvedValue({ id: THREAD_ID, createdAt: new Date() }),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    ecoMessage: {
      create: vi.fn().mockResolvedValue({ id: "msg-1" }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(opts.userMessagesInPeriod ?? 0),
    },
    ecoMessageReport: {
      create: vi.fn().mockResolvedValue({ id: "rep-1" }),
    },
  };
}

function makeUsage() {
  return { invalidate: vi.fn().mockResolvedValue(undefined) };
}

function makeEmbedding() {
  return { embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) };
}

function makeVector() {
  return { searchSimilar: vi.fn().mockResolvedValue([]) };
}

function makeConfig() {
  return {
    get: vi.fn((key: string) => {
      if (key === "ANTHROPIC_API_KEY") return "sk-ant-stub";
      if (key === "AI_MAX_CONTEXT_CHUNKS") return 5;
      return "";
    }),
  };
}

// `makeAnthropicMock` is a helper kept here for future tests that exercise
// the LLM streaming path (currently mocked in §"sendMessage — happy path"
// which isn't in this file because it requires extra Prisma plumbing).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeAnthropicMock(chunks: string[]) {
  let listener: ((chunk: string) => void) | null = null;
  const stream = {
    on: vi.fn((event: string, cb: (chunk: string) => void) => {
      if (event === "text") listener = cb;
      return stream;
    }),
    controller: { abort: vi.fn() },
    finalMessage: vi.fn(),
  };
  void Promise.resolve().then(() => {
    for (const c of chunks) listener?.(c);
  });
  stream.finalMessage.mockResolvedValue({
    usage: { input_tokens: 50, output_tokens: 20 },
  });
  return stream;
}

function makeService(
  overrides: {
    prisma?: ReturnType<typeof makePrisma>;
    usage?: ReturnType<typeof makeUsage>;
    embedding?: ReturnType<typeof makeEmbedding>;
    vector?: ReturnType<typeof makeVector>;
  } = {},
) {
  const prisma = overrides.prisma ?? makePrisma();
  const usage = overrides.usage ?? makeUsage();
  const embedding = overrides.embedding ?? makeEmbedding();
  const vector = overrides.vector ?? makeVector();
  const service = new EcoService(
    prisma as never,
    usage as never,
    embedding as never,
    vector as never,
    makeConfig() as never,
  );
  return { service, prisma, usage, embedding, vector };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("EcoService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCaps", () => {
    it("returns the Eco persona (name + voice + caps)", () => {
      const { service } = makeService();
      const persona = service.getCaps();
      expect(persona.name).toBe("Eco");
      expect(persona.caps.length).toBeGreaterThan(0);
    });
  });

  describe("listThreads", () => {
    it("maps threads to rail items", async () => {
      const prisma = makePrisma();
      prisma.ecoThread.findMany.mockResolvedValue([
        {
          id: "t1",
          titleCiphertext: "abc",
          titleNonce: "n1",
          lastMessageAt: new Date(),
          _count: { messages: 5 },
        },
      ]);
      const { service } = makeService({ prisma });
      const res = await service.listThreads(USER_ID);
      expect(res.rail).toHaveLength(1);
      expect(res.rail[0]?.messageCount).toBe(5);
    });
  });

  describe("createThread", () => {
    it("creates a thread and returns id + createdAt", async () => {
      const { service, prisma } = makeService();
      const res = await service.createThread(USER_ID);
      expect(res.id).toBe(THREAD_ID);
      expect(prisma.ecoThread.create).toHaveBeenCalledWith({
        data: { userId: USER_ID },
        select: { id: true, createdAt: true },
      });
    });
  });

  describe("getThread", () => {
    it("404s when thread doesn't belong to user", async () => {
      const prisma = makePrisma({ threadOwned: false });
      const { service } = makeService({ prisma });
      await expect(
        service.getThread(USER_ID, "nope", undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns messages with hasMore=false when under page size", async () => {
      const prisma = makePrisma();
      prisma.ecoThread.findFirst.mockResolvedValue({
        id: THREAD_ID,
        titleCiphertext: null,
        titleNonce: null,
        createdAt: new Date(),
        lastMessageAt: new Date(),
      });
      prisma.ecoMessage.findMany.mockResolvedValue([
        {
          id: "m1",
          kind: EcoMessageKind.ASSISTANT,
          textCiphertext: null,
          textNonce: null,
          assistantText: "hola",
          suggestedBookId: null,
          createdAt: new Date(),
        },
      ]);
      const { service } = makeService({ prisma });
      const res = await service.getThread(USER_ID, THREAD_ID, undefined);
      expect(res.hasMore).toBe(false);
      expect(res.messages).toHaveLength(1);
      expect(res.messages[0]?.kind).toBe("assistant");
    });
  });

  describe("sendMessage — quota gate", () => {
    it("rejects FREE users who already used 10 messages today", async () => {
      const prisma = makePrisma({
        plan: Plan.FREE,
        userMessagesInPeriod: 10,
      });
      const { service } = makeService({ prisma });
      const events = await firstValueFrom(
        service
          .sendMessage(USER_ID, {
            threadId: THREAD_ID,
            textPlaintext: "hola",
            textCiphertext: "ct",
            textNonce: "n",
          })
          .pipe(toArray()),
      );
      expect(events).toHaveLength(1);
      expect(events[0]?.data.event).toBe("error");
      // Service didn't reach the LLM — no message persisted.
      expect(prisma.ecoMessage.create).not.toHaveBeenCalled();
    });
  });

  describe("sendMessage — crisis detection (layer 1)", () => {
    it("intercepts a crisis plaintext BEFORE calling the LLM", async () => {
      const prisma = makePrisma({
        plan: Plan.PRO,
        hasActiveSub: true,
        userMessagesInPeriod: 0,
      });
      const embedding = makeEmbedding();
      const { service } = makeService({ prisma, embedding });

      const events = await lastValueFrom(
        service
          .sendMessage(USER_ID, {
            threadId: THREAD_ID,
            textPlaintext: "estoy pensando en suicidarme",
            textCiphertext: "ct",
            textNonce: "n",
          })
          .pipe(toArray()),
      );

      // Expected sequence: crisis → done.
      const eventNames = events.map((e) => e.data.event);
      expect(eventNames).toEqual(["crisis", "done"]);
      // LLM was NOT consulted (embedding service is the canary).
      expect(embedding.embed).not.toHaveBeenCalled();
      // CRISIS message persisted in the thread for replay.
      const calls = prisma.ecoMessage.create.mock.calls;
      const kinds = calls.map(
        (c) => (c[0] as { data: { kind: string } }).data.kind,
      );
      expect(kinds).toContain("USER");
      expect(kinds).toContain("CRISIS");
    });
  });

  describe("reportMessage", () => {
    it("404s when message doesn't belong to user's thread", async () => {
      const prisma = makePrisma();
      prisma.ecoMessage.findMany.mockResolvedValue([]);
      // Override the findFirst-on-message lookup:
      (prisma.ecoMessage as { findFirst?: unknown }).findFirst = vi
        .fn()
        .mockResolvedValue(null);
      const { service } = makeService({ prisma });
      await expect(
        service.reportMessage(USER_ID, "msg-1", "HALLUCINATION", undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates a report row", async () => {
      const prisma = makePrisma();
      (prisma.ecoMessage as { findFirst?: unknown }).findFirst = vi
        .fn()
        .mockResolvedValue({ id: "msg-1" });
      const { service } = makeService({ prisma });
      const res = await service.reportMessage(
        USER_ID,
        "msg-1",
        "OFF_TONE",
        "no era empático",
      );
      expect(res.ok).toBe(true);
      expect(prisma.ecoMessageReport.create).toHaveBeenCalledWith({
        data: {
          messageId: "msg-1",
          userId: USER_ID,
          reason: "OFF_TONE",
          comment: "no era empático",
        },
      });
    });
  });

  describe("deleteThread", () => {
    it("404s when not owned", async () => {
      const prisma = makePrisma({ threadOwned: false });
      const { service } = makeService({ prisma });
      await expect(service.deleteThread(USER_ID, "x")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("deletes when owned", async () => {
      const { service, prisma } = makeService();
      await service.deleteThread(USER_ID, THREAD_ID);
      expect(prisma.ecoThread.delete).toHaveBeenCalledWith({
        where: { id: THREAD_ID },
      });
    });
  });

  // Smoke test that the service can be constructed without booting Anthropic.
  describe("construction", () => {
    it("instantiates without making network calls", () => {
      const { service } = makeService();
      expect(service).toBeInstanceOf(EcoService);
    });
  });

  // Suppress unused-variable warning for HttpException import in case the
  // future refactor surfaces it as a typed assertion. The error path test
  // above exercises the underlying ECO_QUOTA_EXCEEDED throw.
  it.skip("HttpException sentinel reference", () => {
    expect(HttpException).toBeDefined();
    expect(HttpStatus.PAYMENT_REQUIRED).toBe(402);
  });

  /**
   * R1 — nada crudo del proveedor sale hacia el registro ni hacia Sentry.
   *
   * El error que se inyecta lleva marcadores sintéticos en TODOS los sitios
   * por los que el texto podría escaparse: el `message`, el `stack`, una
   * propiedad anidada tipo `response.body` —que es donde un SDK deja lo que
   * envió— y la `cause`. Si alguno aparece en la salida, la fuga existe.
   *
   * Se comprueban todos los argumentos del logger, no sólo el primero: el
   * segundo era precisamente donde iba el stack.
   */
  describe("sendMessage — privacidad de la salida de error (R1)", () => {
    const SECRETO_MSG = "SECRETO_EN_MENSAJE";
    const SECRETO_STACK = "SECRETO_EN_STACK";
    const SECRETO_BODY = "SECRETO_EN_BODY";
    const SECRETO_CAUSE = "SECRETO_EN_CAUSE";

    function errorVenenoso() {
      const e = new Error(`fallo del proveedor ${SECRETO_MSG}`) as Error & {
        status: number;
        response: { body: string };
        cause: Error;
      };
      e.status = 500;
      e.stack = `Error: ${SECRETO_MSG}\n    at ${SECRETO_STACK} (/app/x.js:1:1)\n    at real (/app/y.js:2:2)`;
      e.response = { body: SECRETO_BODY };
      e.cause = new Error(SECRETO_CAUSE);
      return e;
    }

    async function provocar(threadId = THREAD_ID) {
      const prisma = makePrisma({
        plan: Plan.PRO,
        hasActiveSub: true,
        userMessagesInPeriod: 0,
      });
      const embedding = makeEmbedding();
      embedding.embed.mockRejectedValue(errorVenenoso());
      const { service } = makeService({ prisma, embedding });
      const errores = vi
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});
      const avisos = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});
      capturados.length = 0;

      const events = await lastValueFrom(
        service
          .sendMessage(USER_ID, {
            threadId,
            textPlaintext: "texto privado de la persona",
            textCiphertext: "ct",
            textNonce: "n",
          })
          .pipe(toArray()),
      );
      const todo = JSON.stringify({
        errores: errores.mock.calls,
        avisos: avisos.mock.calls,
        sentry: capturados.map((c) => ({
          mensaje: (c.err as Error)?.message,
          stack: (c.err as Error)?.stack,
          ctx: c.ctx,
        })),
        sse: events,
      });
      errores.mockRestore();
      avisos.mockRestore();
      return { todo, events, errores, capturados };
    }

    it("ningún marcador del proveedor llega al registro, a Sentry ni al SSE", async () => {
      const { todo } = await provocar();
      for (const marcador of [
        SECRETO_MSG,
        SECRETO_STACK,
        SECRETO_BODY,
        SECRETO_CAUSE,
        "texto privado de la persona",
      ]) {
        expect(todo).not.toContain(marcador);
      }
    });

    it("pero sí queda la etapa, la dependencia y la categoría", async () => {
      const { todo } = await provocar();
      expect(todo).toContain("stage=embeddings");
      expect(todo).toContain("dependency=voyage");
      expect(todo).toContain("category=upstream_unavailable");
    });

    it("a Sentry va un error sintético, no el original", async () => {
      await provocar();
      expect(capturados).toHaveLength(1);
      const err = capturados[0]?.err as Error & { response?: unknown };
      expect(err.message).not.toContain(SECRETO_MSG);
      // Y sin las propiedades que el SDK colgó.
      expect(err.response).toBeUndefined();
      expect((err as { original?: unknown }).original).toBeUndefined();
      const ctx = capturados[0]?.ctx as Record<string, unknown>;
      expect(Object.keys(ctx).sort()).toEqual(
        [
          "category",
          "dependency",
          "frames",
          "stage",
          "surface",
          "threadId",
          "upstreamStatus",
        ].sort(),
      );
    });

    it("una correlación que no parece identificador se descarta", async () => {
      // `threadId` lo elige el cliente: sin validarlo, el registro se vuelve
      // un canal por el que cualquiera escribe lo que quiera.
      const { todo } = await provocar("no es un id\nINYECTADO");
      expect(todo).not.toContain("INYECTADO");
      expect(todo).not.toContain("threadId=no es");
    });

    it("el mensaje que lee la persona no cambia", async () => {
      const { events } = await provocar();
      const ultimo = events.at(-1)?.data as {
        event: string;
        data: { message: string };
      };
      expect(ultimo.event).toBe("error");
      expect(ultimo.data.message).toBe(
        "Algo salió mal. Reintenta en unos segundos.",
      );
    });
  });

  /**
   * Los dos proveedores externos, cayéndose por separado.
   *
   * Medido antes en una pila local: con una clave de Voyage falsa, TODOS los
   * envíos terminaban en error y el registro decía sólo
   * `Eco sendMessage failed: Status code: 401`. Como el RAG pide embeddings
   * ANTES de llamar al modelo, esa línea era compatible con las dos
   * dependencias y no permitía decidir a cuál escribirle.
   *
   * Estas dos pruebas reproducen cada caída por separado y fijan lo que la
   * línea tiene que decir ahora. También fijan lo que NO debe cambiar: el
   * texto que lee la persona, y que no se persista una respuesta inventada.
   */
  describe("sendMessage — atribución de fallos de proveedor", () => {
    function errorConEstado(status: number) {
      const e = new Error(`Status code: ${status}`) as Error & {
        status: number;
      };
      e.status = status;
      return e;
    }

    function prismaListo() {
      return makePrisma({
        plan: Plan.PRO,
        hasActiveSub: true,
        userMessagesInPeriod: 0,
      });
    }

    it("un 401 de embeddings se atribuye a Voyage, no al modelo", async () => {
      const prisma = prismaListo();
      const embedding = makeEmbedding();
      embedding.embed.mockRejectedValue(errorConEstado(401));
      const { service } = makeService({ prisma, embedding });
      const registro = vi
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});

      const events = await lastValueFrom(
        service
          .sendMessage(USER_ID, {
            threadId: THREAD_ID,
            textPlaintext: "un texto privado que no debe aparecer en el log",
            textCiphertext: "CIFRADO_QUE_NO_DEBE_APARECER",
            textNonce: "n",
          })
          .pipe(toArray()),
      );

      expect(events.at(-1)?.data.event).toBe("error");

      const linea = String(registro.mock.calls.at(-1)?.[0] ?? "");
      expect(linea).toContain("stage=embeddings");
      expect(linea).toContain("dependency=voyage");
      expect(linea).toContain("category=upstream_auth");
      expect(linea).toContain("upstreamStatus=401");
      expect(linea).toContain(`threadId=${THREAD_ID}`);
      // Lo que el registro NO puede llevar.
      expect(linea).not.toContain("un texto privado");
      // Antes buscaba "ct": dos letras que aparecen por casualidad en
      // cualquier ruta. Una aserción así pasa o falla por azar.
      expect(linea).not.toContain("CIFRADO_QUE_NO_DEBE_APARECER");

      // El mensaje de la persona se conserva; no se inventa una respuesta.
      const creados = prisma.ecoMessage.create.mock.calls.map(
        (c) => (c[0] as { data: { kind: string } }).data.kind,
      );
      expect(creados).toContain("USER");
      expect(creados).not.toContain("ASSISTANT");

      registro.mockRestore();
    });

    it("un 500 del modelo se atribuye a Anthropic, no a embeddings", async () => {
      const prisma = prismaListo();
      const embedding = makeEmbedding(); // los embeddings van bien
      const { service } = makeService({ prisma, embedding });

      // El stream del SDK falla al resolverse, que es donde una caída del
      // proveedor se vuelve observable para el servicio.
      const anthropic = (
        service as unknown as {
          anthropic: { messages: { stream: ReturnType<typeof vi.fn> } };
        }
      ).anthropic;
      anthropic.messages.stream.mockReturnValue({
        on: vi.fn(),
        abort: vi.fn(),
        finalMessage: vi.fn().mockRejectedValue(errorConEstado(500)),
      });

      const registro = vi
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});

      const events = await lastValueFrom(
        service
          .sendMessage(USER_ID, {
            threadId: THREAD_ID,
            textPlaintext: "hola",
            textCiphertext: "ct",
            textNonce: "n",
          })
          .pipe(toArray()),
      );

      expect(events.at(-1)?.data.event).toBe("error");

      const linea = String(registro.mock.calls.at(-1)?.[0] ?? "");
      expect(linea).toContain("stage=model");
      expect(linea).toContain("dependency=anthropic");
      expect(linea).toContain("category=upstream_unavailable");
      expect(linea).toContain("upstreamStatus=500");
      expect(embedding.embed).toHaveBeenCalled(); // llegó más allá de embeddings

      registro.mockRestore();
    });
  });
});
