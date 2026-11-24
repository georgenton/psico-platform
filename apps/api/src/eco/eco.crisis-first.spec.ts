import { Logger } from "@nestjs/common";
import { Plan } from "@prisma/client";
import { lastValueFrom, toArray } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EcoService } from "./eco.service";
import { crisisNotice } from "./crisis";

/**
 * El aviso va primero.
 *
 * Si lo que escribe la persona dispara la capa 1, el aviso sale antes de la
 * cuota, de la base y de cualquier escritura, y nada de lo que venga después
 * lo impide ni lo cambia por un error. Medido el 2026-11-24 contra el código
 * anterior: con la cuota agotada llegaba sólo «Has usado tus 10 mensajes», y un
 * fallo al guardar o al leer el perfil dejaba sólo `ECO_UNKNOWN`.
 */

vi.mock("@prisma/client", () => ({
  PrismaClient: class {},
  Plan: { FREE: "FREE", PRO: "PRO", ANNUAL: "ANNUAL", B2B: "B2B" },
}));

const capturados: Array<{ err: unknown; ctx: unknown }> = [];
vi.mock("../observability/sentry", () => ({
  captureException: (err: unknown, ctx: unknown) => {
    capturados.push({ err, ctx });
  },
  initSentry: () => {},
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { stream: vi.fn() };
  },
}));

const USER_ID = "user-abc";
const THREAD_ID = "thread-1";
const TEXTO = "quiero suicidarme, y esto es privado";
const CIFRADO = "CIFRADO_QUE_NO_DEBE_SALIR";
const NONCE = "NONCE_QUE_NO_DEBE_SALIR";

type Evento = { event: string; data: Record<string, unknown> };

function doblar(
  opts: {
    plan?: Plan;
    /** Lo que devuelve el recuento vivo, ya con el mensaje escrito. */
    usados?: number;
    country?: string | null;
    hiloPropio?: boolean;
  } = {},
) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        plan: opts.plan ?? Plan.PRO,
        profile: { timezone: null, country: opts.country ?? null },
      }),
    },
    subscription: { findUnique: vi.fn().mockResolvedValue(null) },
    ecoThread: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.hiloPropio === false ? null : { id: THREAD_ID },
        ),
      update: vi.fn().mockResolvedValue({}),
    },
    ecoMessage: {
      create: vi.fn().mockResolvedValue({ id: "msg-1" }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(opts.usados ?? 1),
    },
  };
  const usage = { invalidate: vi.fn().mockResolvedValue(undefined) };
  const embedding = { embed: vi.fn().mockResolvedValue([0.1]) };
  const vector = { searchSimilar: vi.fn().mockResolvedValue([]) };
  const service = new EcoService(
    prisma as never,
    usage as never,
    embedding as never,
    vector as never,
    {
      get: (k: string) => (k === "AI_MAX_CONTEXT_CHUNKS" ? 5 : "sk-ant-stub"),
    } as never,
  );
  const stream = (
    service as unknown as {
      anthropic: { messages: { stream: ReturnType<typeof vi.fn> } };
    }
  ).anthropic.messages.stream;
  return { service, prisma, usage, embedding, stream };
}

type Dobles = ReturnType<typeof doblar>;

function emitir(d: Dobles, texto = TEXTO, threadId = THREAD_ID) {
  return d.service.sendMessage(USER_ID, {
    threadId,
    textPlaintext: texto,
    textCiphertext: CIFRADO,
    textNonce: NONCE,
  });
}

async function enviar(d: Dobles, texto = TEXTO, threadId = THREAD_ID) {
  const eventos = await lastValueFrom(
    emitir(d, texto, threadId).pipe(toArray()),
  );
  return eventos.map((e) => e.data as unknown as Evento);
}

const nombres = (eventos: Evento[]) => eventos.map((e) => e.event);

/** Lo que se guardó, en el orden en que se guardó. */
const guardado = (d: Dobles) =>
  d.prisma.ecoMessage.create.mock.calls.map(
    (c) => (c[0] as { data: Record<string, unknown> }).data,
  );

const errores = vi.spyOn(Logger.prototype, "error");
const avisos = vi.spyOn(Logger.prototype, "warn");

beforeEach(() => {
  capturados.length = 0;
  errores.mockReset().mockImplementation(() => {});
  avisos.mockReset().mockImplementation(() => {});
});

/** Lo que puede romperse alrededor del aviso; guardarlo a él va aparte. */
const PASOS: ReadonlyArray<
  [string, (d: Dobles) => ReturnType<typeof vi.fn>, boolean]
> = [
  // nombre · qué se rompe · si deja un mensaje guardado
  ["leer plan y perfil", (d) => d.prisma.user.findUnique, true],
  ["buscar el hilo", (d) => d.prisma.ecoThread.findFirst, false],
  ["guardar el mensaje", (d) => d.prisma.ecoMessage.create, false],
  ["leer la suscripción", (d) => d.prisma.subscription.findUnique, true],
  ["contar los mensajes", (d) => d.prisma.ecoMessage.count, true],
  ["vaciar la caché de uso", (d) => d.usage.invalidate, true],
];

describe("sin mensajes por hoy, el aviso llega igual", () => {
  it.each([
    [Plan.FREE, 11],
    [Plan.PRO, 201],
    [Plan.ANNUAL, 201],
  ])("%s con la cuota agotada: aviso y cierre, sin error", async (plan, n) => {
    const d = doblar({ plan, usados: n, country: "EC" });
    const eventos = await enviar(d);

    expect(nombres(eventos)).toEqual(["crisis", "done"]);
    expect(eventos[0]!.data).toEqual(crisisNotice("EC"));
    // Uno más que el límite: lo que queda es cero, nunca menos.
    expect(eventos[1]!.data).toEqual({
      messageId: "msg-1",
      quotaRemaining: 0,
    });
  });

  it("y lo demás sigue cerrado: un mensaje corriente se niega", async () => {
    const d = doblar({ plan: Plan.FREE, usados: 10 });
    const eventos = await enviar(d, "hola");
    expect(nombres(eventos)).toEqual(["error"]);
    expect(eventos[0]!.data.code).toBe("ECO_QUOTA_EXCEEDED");
    expect(guardado(d)).toEqual([]);
  });

  it("se guardan los dos: el suyo cifrado, el aviso en claro", async () => {
    const d = doblar({ plan: Plan.FREE, usados: 11, country: "EC" });
    await enviar(d);
    expect(guardado(d)).toEqual([
      {
        threadId: THREAD_ID,
        kind: "USER",
        textCiphertext: CIFRADO,
        textNonce: NONCE,
      },
      {
        threadId: THREAD_ID,
        kind: "CRISIS",
        assistantText: crisisNotice("EC").text,
      },
    ]);
    expect(d.usage.invalidate).toHaveBeenCalledWith(USER_ID);
  });
});

describe("con mensajes, la cuota cuenta lo de siempre", () => {
  it.each([
    [Plan.FREE, 1, 9],
    [Plan.FREE, 10, 0],
    [Plan.PRO, 1, 199],
    [Plan.B2B, 0, null],
  ])("%s · %i usados → quedan %s", async (plan, usados, quedan) => {
    const eventos = await enviar(doblar({ plan, usados }));
    expect(nombres(eventos)).toEqual(["crisis", "done"]);
    expect(eventos[1]!.data.quotaRemaining).toBe(quedan);
  });
});

describe("el orden", () => {
  it("el aviso sale antes de escribir, de contar y de buscar el hilo", async () => {
    const d = doblar({ country: "EC" });
    const orden: string[] = [];
    const anotar = (
      fn: ReturnType<typeof vi.fn>,
      nombre: (arg: never) => string,
      valor: unknown,
    ) =>
      fn.mockImplementation(async (arg: never) => {
        orden.push(nombre(arg));
        return valor;
      });
    anotar(d.prisma.ecoThread.findFirst, () => "hilo", { id: THREAD_ID });
    anotar(d.prisma.subscription.findUnique, () => "suscripción", null);
    anotar(d.prisma.ecoMessage.count, () => "recuento", 1);
    anotar(
      d.prisma.ecoMessage.create,
      (arg: { data: { kind: string } }) => arg.data.kind,
      { id: "msg-1" },
    );

    await new Promise<void>((fin) =>
      emitir(d).subscribe({
        next: (e) => orden.push(`→ ${e.data.event}`),
        complete: () => fin(),
      }),
    );
    expect(orden).toEqual([
      "→ crisis",
      "hilo",
      "USER",
      "CRISIS",
      "suscripción",
      "recuento",
      "→ done",
    ]);
  });

  it("nunca se llama al modelo ni a los embeddings", async () => {
    const d = doblar({ plan: Plan.PRO });
    await enviar(d);
    expect(d.stream).not.toHaveBeenCalled();
    expect(d.embedding.embed).not.toHaveBeenCalled();
  });

  it("quien se suscribe tarde lo recibe entero", async () => {
    // Nest se suscribe unos ticks después de que el controlador devuelva. Por
    // HTTP llega hoy a tiempo con y sin repetición (medido); que llegue no
    // puede depender de cuántos ticks sean.
    const d = doblar();
    d.prisma.user.findUnique.mockRejectedValue(new Error("db"));
    const flujo = emitir(d);
    await new Promise((r) => setTimeout(r, 20));
    const eventos = await lastValueFrom(flujo.pipe(toArray()));
    expect(eventos.map((e) => e.data.event)).toEqual(["crisis"]);
  });
});

describe("falle lo que falle, el aviso llega y no lo tapa un error", () => {
  it.each(PASOS)("%s", async (_nombre, paso, dejaMensaje) => {
    const d = doblar({ country: "CO" });
    paso(d).mockRejectedValue(new Error("caída"));
    const eventos = await enviar(d);

    expect(eventos[0]!.event).toBe("crisis");
    expect(nombres(eventos)).not.toContain("error");
    // Sin poder decir qué mensaje es y cuántos quedan, no se dice nada.
    expect(nombres(eventos)).toEqual(["crisis"]);

    // El país del perfil, salvo cuando lo que falló es leerlo.
    const pais = paso(d) === d.prisma.user.findUnique ? null : "CO";
    expect(eventos[0]!.data).toEqual(crisisNotice(pais));

    const guardados = dejaMensaje ? ["USER", "CRISIS"] : [];
    const intentos = guardado(d).map((g) => g.kind);
    expect(paso(d) === d.prisma.ecoMessage.create ? [] : intentos).toEqual(
      guardados,
    );

    // Y queda constancia, una vez.
    expect(errores).toHaveBeenCalledTimes(1);
    expect(capturados).toHaveLength(1);
  });

  it("guardar el aviso, con el mensaje ya guardado", async () => {
    const d = doblar({ country: "EC" });
    d.prisma.ecoMessage.create
      .mockResolvedValueOnce({ id: "msg-1" })
      .mockRejectedValueOnce(new Error("caída"));
    const eventos = await enviar(d);
    expect(nombres(eventos)).toEqual(["crisis"]);
    expect(eventos[0]!.data).toEqual(crisisNotice("EC"));
    expect(errores).toHaveBeenCalledTimes(1);
  });

  it("todo a la vez", async () => {
    const d = doblar({ country: "EC" });
    for (const [, paso] of PASOS) paso(d).mockRejectedValue(new Error("caída"));
    const eventos = await enviar(d);
    expect(nombres(eventos)).toEqual(["crisis"]);
    expect(eventos[0]!.data).toEqual(crisisNotice(null));
  });
});

describe("y si algo no contesta, tampoco lo retiene", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Se suscribe y va anotando; el tiempo lo mueve cada prueba. */
  function escuchar(d: Dobles) {
    const visto: string[] = [];
    let cerrado = false;
    let aviso: unknown;
    emitir(d).subscribe({
      next: (e) => {
        visto.push(e.data.event);
        if (e.data.event === "crisis") aviso = e.data.data;
      },
      complete: () => {
        cerrado = true;
      },
    });
    return {
      visto,
      aviso: () => aviso,
      cerrado: () => cerrado,
    };
  }

  const nunca = () => new Promise<never>(() => {});

  it("la lectura del país: a lo sumo un segundo, y sale sin país", async () => {
    const d = doblar({ country: "CO" });
    d.prisma.user.findUnique.mockImplementation(nunca);
    const oido = escuchar(d);

    await vi.advanceTimersByTimeAsync(999);
    expect(oido.visto).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(oido.visto).toEqual(["crisis"]);
    expect(oido.aviso()).toEqual(crisisNotice(null));
    // Y mientras tanto se guarda: no depende de esa lectura.
    expect(guardado(d).map((g) => g.kind)).toEqual(["USER", "CRISIS"]);
  });

  it("una lectura lenta pero viva da el país", async () => {
    const d = doblar();
    d.prisma.user.findUnique.mockImplementation(
      () =>
        new Promise((r) =>
          setTimeout(
            () =>
              r({ plan: Plan.PRO, profile: { timezone: null, country: "CO" } }),
            800,
          ),
        ),
    );
    const oido = escuchar(d);
    await vi.advanceTimersByTimeAsync(800);
    expect(oido.aviso()).toEqual(crisisNotice("CO"));
  });

  it.each(PASOS.filter(([n]) => n !== "leer plan y perfil"))(
    "%s: el aviso ya salió, y el flujo se cierra solo",
    async (_nombre, paso) => {
      // Los clientes instalados pintan el aviso al CERRARSE el flujo: una base
      // que no contesta lo retendría igual que si no se hubiera mandado.
      const d = doblar({ country: "EC" });
      paso(d).mockImplementation(nunca);
      const oido = escuchar(d);

      await vi.advanceTimersByTimeAsync(0);
      expect(oido.visto).toEqual(["crisis"]);
      expect(oido.cerrado()).toBe(false);

      await vi.advanceTimersByTimeAsync(3_000);
      expect(oido.visto).toEqual(["crisis"]);
      expect(oido.cerrado()).toBe(true);
      expect(errores).toHaveBeenCalledTimes(1);
    },
  );

  it("en el peor caso, cuatro segundos de principio a fin", async () => {
    const d = doblar();
    for (const [, paso] of PASOS) paso(d).mockImplementation(nunca);
    const oido = escuchar(d);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(oido.visto).toEqual(["crisis"]);
    expect(oido.cerrado()).toBe(true);
  });

  it("lo que contesta tarde ya no escribe en un flujo cerrado", async () => {
    const d = doblar();
    let soltar!: (v: unknown) => void;
    d.prisma.ecoMessage.create.mockImplementationOnce(
      () => new Promise((r) => (soltar = r)),
    );
    const oido = escuchar(d);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(oido.cerrado()).toBe(true);

    soltar({ id: "msg-tarde" });
    await vi.advanceTimersByTimeAsync(0);
    expect(oido.visto).toEqual(["crisis"]);
    // Pero lo que quedaba por guardar se guarda.
    expect(guardado(d).map((g) => g.kind)).toEqual(["USER", "CRISIS"]);
  });

  it("no deja relojes encendidos cuando todo va bien", async () => {
    const oido = escuchar(doblar());
    await vi.advanceTimersByTimeAsync(0);
    expect(oido.visto).toEqual(["crisis", "done"]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("un hilo que no es suyo, o que no existe", () => {
  it("recibe el aviso, y en ese hilo no se escribe nada", async () => {
    const d = doblar({ hiloPropio: false, country: "EC" });
    const eventos = await enviar(d, TEXTO, "hilo-de-otra-persona");
    expect(nombres(eventos)).toEqual(["crisis"]);
    expect(eventos[0]!.data).toEqual(crisisNotice("EC"));
    expect(guardado(d)).toEqual([]);
    expect(d.usage.invalidate).not.toHaveBeenCalled();
    // La consulta sigue exigiendo que sea suyo.
    expect(d.prisma.ecoThread.findFirst).toHaveBeenCalledWith({
      where: { id: "hilo-de-otra-persona", userId: USER_ID },
      select: { id: true },
    });
    // Y el identificador que mandó no llega al registro.
    expect(
      JSON.stringify([errores.mock.calls, avisos.mock.calls]),
    ).not.toContain("hilo-de-otra-persona");
    expect(capturados).toEqual([]);
  });

  it("un mensaje corriente ahí sigue siendo un 404", async () => {
    const eventos = await enviar(doblar({ hiloPropio: false }), "hola");
    expect(nombres(eventos)).toEqual(["error"]);
    expect(eventos[0]!.data.code).toBe("ECO_THREAD_NOT_FOUND");
  });
});

describe("lo que se registra no lleva nada de la persona", () => {
  it.each(PASOS)(
    "%s, con un error que arrastra los datos",
    async (_n, paso) => {
      const d = doblar({ country: "EC" });
      const veneno = Object.assign(
        new Error(`Invalid create(): data: { ${TEXTO} ${CIFRADO} ${NONCE} }`),
        { meta: { texto: TEXTO, cifrado: CIFRADO }, cause: new Error(TEXTO) },
      );
      paso(d).mockRejectedValue(veneno);
      const eventos = await enviar(d);

      const todo = JSON.stringify({
        errores: errores.mock.calls,
        avisos: avisos.mock.calls,
        sentry: capturados.map((c) => ({
          mensaje: (c.err as Error).message,
          stack: (c.err as Error).stack,
          ctx: c.ctx,
        })),
        eventos,
      });
      expect(errores).toHaveBeenCalled();
      for (const dato of [TEXTO, CIFRADO, NONCE]) {
        expect(todo).not.toContain(dato);
      }
      // Ni dice qué se estaba haciendo: con el hilo al lado, sería contar de
      // alguien que pidió ayuda. (Los marcos llevan el nombre de este fichero.)
      for (const [linea] of errores.mock.calls) {
        expect(String(linea).split(" frames=")[0]).not.toMatch(/crisis/i);
      }
    },
  );
});

describe("la capa 2, la del modelo: el aviso tampoco espera a guardarse", () => {
  function conCentinela(d: Dobles) {
    d.stream.mockImplementation(() => {
      let oyente: ((c: string) => void) | null = null;
      const s = {
        on: (_e: string, cb: (c: string) => void) => {
          oyente = cb;
          return s;
        },
        controller: { abort: vi.fn() },
        finalMessage: vi.fn().mockResolvedValue({ usage: null }),
      };
      void Promise.resolve().then(() => oyente?.("[CRISIS]"));
      return s;
    });
    return d;
  }

  it("si guardarlo falla, llega igual y sin error", async () => {
    const d = conCentinela(doblar({ country: "EC" }));
    d.prisma.ecoMessage.create
      .mockResolvedValueOnce({ id: "msg-1" })
      .mockRejectedValueOnce(new Error("caída"));
    const eventos = await enviar(d, "no puedo más");
    expect(nombres(eventos)).toEqual(["crisis"]);
    expect(eventos[0]!.data).toEqual(crisisNotice("EC"));
    expect(errores).toHaveBeenCalledTimes(1);
  });

  it("si guardarlo no contesta, el flujo se cierra solo", async () => {
    vi.useFakeTimers();
    try {
      const d = conCentinela(doblar({ country: "EC" }));
      d.prisma.ecoMessage.create
        .mockResolvedValueOnce({ id: "msg-1" })
        .mockImplementationOnce(() => new Promise<never>(() => {}));
      const visto: string[] = [];
      let cerrado = false;
      emitir(d, "no puedo más").subscribe({
        next: (e) => visto.push(e.data.event),
        complete: () => {
          cerrado = true;
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(visto).toEqual(["crisis"]);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(cerrado).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("y cuando se guarda, los eventos son los de antes: sin `done`", async () => {
    const d = conCentinela(doblar({ country: "EC" }));
    const eventos = await enviar(d, "no puedo más");
    expect(nombres(eventos)).toEqual(["crisis"]);
    expect(guardado(d).map((g) => g.kind)).toEqual(["USER", "CRISIS"]);
  });

  it("con la cuota agotada no se llega al modelo", async () => {
    const d = conCentinela(doblar({ plan: Plan.FREE, usados: 10 }));
    const eventos = await enviar(d, "no puedo más");
    expect(nombres(eventos)).toEqual(["error"]);
    expect(d.stream).not.toHaveBeenCalled();
  });
});
