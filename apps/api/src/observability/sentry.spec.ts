import { randomBytes } from "node:crypto";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as SentryModule from "./sentry";

/**
 * El cliente de verdad, contra un receptor local.
 *
 * Simular el SDK probaría que le pasamos las opciones que creemos. Lo que
 * importa es lo que llega al otro lado del cable, así que esto levanta un
 * servidor HTTP en 127.0.0.1, apunta el DSN ahí y mira los bytes: el cuerpo
 * entero, las cabeceras y la ruta de cada petición.
 *
 * Los señuelos se generan al ejecutar y no son literales del fichero.
 */

interface Recibido {
  url: string;
  headers: string;
  body: string;
}

/** Lo que se lee de un evento recibido. */
interface Elemento {
  type: string;
  payload: {
    environment: string;
    release?: string;
    tags: Record<string, string>;
    exception: {
      values: {
        type: string;
        value: string;
        stacktrace: { frames: Record<string, unknown>[] };
      }[];
    };
  };
}

const recibidos: Recibido[] = [];
let receptor: Server;
let dsn: string;

const senuelo = () => `s${randomBytes(9).toString("hex")}`;

/** Los elementos de todos los sobres, por tipo. */
function elementos(): Elemento[] {
  return recibidos.flatMap(({ body }) => {
    const lineas = body.split("\n").filter(Boolean);
    const out: Elemento[] = [];
    for (let i = 1; i + 1 < lineas.length; i += 2) {
      out.push({
        type: (JSON.parse(lineas[i]!) as { type: string }).type,
        payload: JSON.parse(lineas[i + 1]!) as Elemento["payload"],
      });
    }
    return out;
  });
}

const crudo = () => JSON.stringify(recibidos);

let modulo: typeof SentryModule;

async function arrancar(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries({
    SENTRY_DSN: dsn,
    PSICO_ENV: "staging",
    SOURCE_COMMIT: "0123456789abcdef0123456789abcdef01234567",
    ...env,
  })) {
    vi.stubEnv(k, v as string);
    if (v === undefined) delete process.env[k];
  }
  modulo = await import("./sentry");
  modulo.initSentry("feelverse-api");
  return modulo;
}

const vaciar = () => Sentry.flush(3000);

beforeAll(async () => {
  receptor = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      recibidos.push({
        url: req.url ?? "",
        headers: JSON.stringify(req.rawHeaders),
        body,
      });
      res.end("{}");
    });
  });
  await new Promise<void>((r) => receptor.listen(0, "127.0.0.1", r));
  dsn = `http://publica@127.0.0.1:${(receptor.address() as AddressInfo).port}/1`;
});

afterAll(() => new Promise((r) => receptor.close(r)));

beforeEach(() => {
  recibidos.length = 0;
});

afterEach(async () => {
  await modulo?._resetSentryForTests();
  vi.unstubAllEnvs();
});

describe("sin DSN", () => {
  it.each([undefined, "", "   "])("%j: no abre ninguna conexión", async (v) => {
    const { captureException, isSentryInitialised } = await arrancar({
      SENTRY_DSN: v,
    });
    expect(isSentryInitialised()).toBe(true);
    captureException(new Error("x"), { path: "/x" });
    await vaciar();
    expect(recibidos).toHaveLength(0);
  });

  it("un DSN ilegible tampoco impide arrancar", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { captureException } = await arrancar({ SENTRY_DSN: "no-es-un-dsn" });
    captureException(new Error("x"));
    await vaciar();
    expect(recibidos).toHaveLength(0);
    expect(aviso).toHaveBeenCalledOnce();
    aviso.mockRestore();
    error.mockRestore();
  });
});

describe("un error llega con lo que hace falta para arreglarlo", () => {
  it("tipo, pila, entorno, servicio y versión", async () => {
    const { captureException } = await arrancar({ NODE_ENV: "production" });
    function laQueFalla() {
      return (undefined as unknown as { map: () => void }).map();
    }
    try {
      laQueFalla();
    } catch (err) {
      captureException(err, {
        method: "POST",
        path: "/api/:unmatched",
        statusCode: 500,
        code: "INTERNAL_ERROR",
      });
    }
    await vaciar();

    const { type, payload } = elementos()[0]!;
    expect(type).toBe("event");
    expect(payload.environment).toBe("staging");
    expect(payload.release).toBe("0123456789ab");
    expect(payload.tags).toEqual({
      service: "feelverse-api",
      runtime: "node",
      method: "POST",
      route: "/api/:unmatched",
      status: "500",
      code: "INTERNAL_ERROR",
    });
    const exc = payload.exception.values[0]!;
    expect(exc.type).toBe("TypeError");
    expect(exc.value).toBe(
      "Cannot read properties of undefined (reading 'map')",
    );
    const ultimo = exc.stacktrace.frames.at(-1)!;
    expect(ultimo).toMatchObject({
      filename: "apps/api/src/observability/sentry.spec.ts",
      function: "laQueFalla",
      in_app: true,
    });
    expect(ultimo.lineno).toBeGreaterThan(0);
    expect(ultimo.colno).toBeGreaterThan(0);
    expect(ultimo.context_line).toBeUndefined();
    expect(ultimo.vars).toBeUndefined();
  });

  it("sin commit, sale sin versión en vez de con una inventada", async () => {
    const { captureException } = await arrancar({ SOURCE_COMMIT: undefined });
    captureException(new Error("x"));
    await vaciar();
    expect(elementos()[0]!.payload.release).toBeUndefined();
  });

  it("el fallo de Eco apunta a donde ocurrió, no al `catch`", async () => {
    const { captureException } = await arrancar();
    captureException(new Error("eco.sendMessage stage=model"), {
      surface: "eco.sendMessage",
      stage: "model",
      dependency: "anthropic",
      category: "upstream_unavailable",
      upstreamStatus: 529,
      threadId: senuelo(),
      frames: ["src/observability/sentry.ts:12:3"],
    });
    await vaciar();
    const { payload } = elementos()[0]!;
    expect(payload.tags).toMatchObject({
      surface: "eco.sendMessage",
      stage: "model",
      dependency: "anthropic",
      category: "upstream_unavailable",
      upstream_status: "529",
    });
    expect(payload.tags.threadId).toBeUndefined();
    expect(payload.exception.values[0]!.stacktrace.frames).toEqual([
      {
        filename: "apps/api/src/observability/sentry.ts",
        in_app: true,
        lineno: 12,
        colno: 3,
      },
    ]);
  });
});

describe("Círculos credentials never leave the process", () => {
  it("finds none of them anywhere in the serialized event", async () => {
    const { captureException } = await arrancar();
    const s = Object.fromEntries(
      [
        "mensaje",
        "causa",
        "agregado",
        "propiedad",
        "nombre",
        "pila",
        "prisma",
        "authorization",
        "cookie",
        "invitada",
        "atestacion",
        "ruta",
        "query",
        "fragmento",
        "cuerpo",
        "ip",
        "usuario",
        "extra",
        "contexto",
        "etiqueta",
        "miga",
        "consola",
        "adjunto",
        "comentario",
        "texto",
        "transaccion",
        "baggage",
      ].map((k) => [k, senuelo()]),
    ) as Record<string, string>;

    Sentry.setUser({ id: s.usuario, ip_address: s.ip, email: s.usuario });
    Sentry.setExtra("e", s.extra);
    Sentry.setContext("c", { v: s.contexto });
    Sentry.setTag("t", s.etiqueta);
    Sentry.setTag(s.etiqueta!, s.etiqueta);
    Sentry.getCurrentScope().setTransactionName(`/compartir/${s.ruta}`);
    Sentry.getIsolationScope().setSDKProcessingMetadata({
      normalizedRequest: {
        url: `https://feelverse.test/compartir/${s.ruta}?t=${s.query}#${s.fragmento}`,
        query_string: `t=${s.query}`,
        data: JSON.stringify({ textPlaintext: s.cuerpo }),
        cookies: { psico_at: s.cookie! },
        headers: {
          authorization: `Bearer ${s.authorization}`,
          "X-Circle-Guest-Session": s.invitada!,
          "x-client-attestation": s.atestacion!,
          "x-forwarded-for": s.ip!,
        },
      },
    });
    Sentry.addBreadcrumb({ message: s.miga, data: { url: s.ruta } });
    console.log(s.consola!.slice(0, 0), s.consola);

    const err = Object.assign(
      new Error(s.mensaje, {
        cause: Object.assign(new Error(s.causa), { config: s.propiedad }),
      }),
      {
        name: s.nombre,
        response: { body: s.cuerpo },
        meta: { target: [s.prisma] },
        code: s.propiedad,
        errors: [new Error(s.agregado)],
      },
    );
    err.stack = `${err.stack}\n    at ${s.pila} (https://h/v1?token=${s.pila}:1:1)\n    at f (/tmp/${s.pila}.js:2:2)`;
    captureException(err, {
      path: `/compartir/${s.ruta}?t=${s.query}`,
      code: s.propiedad,
      method: s.propiedad,
      statusCode: s.propiedad,
      cualquiera: s.contexto,
    });
    captureException(
      Object.assign(
        new Error(
          `\nInvalid \`prisma.user.findUnique()\` invocation:\n{ email: "${s.prisma}" }\n    at ${s.prisma} (/x/${s.prisma}.js:1:1)`,
        ),
        { name: "PrismaClientKnownRequestError", code: "P2002" },
      ),
    );
    captureException(s.texto);
    captureException({ [s.propiedad!]: s.cuerpo, message: s.mensaje });

    // Y por los caminos que no pasan por nuestra función.
    Sentry.captureMessage(s.texto!);
    Sentry.captureException(new Error(s.mensaje), {
      attachments: [{ filename: s.adjunto!, data: s.adjunto! }],
      data: { __sentry__: true },
    } as never);
    Sentry.captureEvent({
      message: s.texto,
      type: "transaction",
      transaction: s.transaccion,
      spans: [],
    } as never);
    Sentry.captureFeedback({ message: s.comentario!, email: s.usuario });
    Sentry.captureCheckIn({ monitorSlug: s.texto!, status: "ok" });
    Sentry.startSession({ user: { ip_address: s.ip } } as never);
    Sentry.captureSession();
    Sentry.endSession();
    const cliente = Sentry.getClient()!;
    void cliente.sendEnvelope([
      { trace: { transaction: s.transaccion } },
      [[{ type: "statsd" }, s.texto]],
    ] as never);
    cliente.sendEvent?.({ message: s.texto, server_name: s.texto } as never);
    await vaciar();

    // Control: si no hubiera llegado nada, lo de abajo no probaría nada.
    expect(elementos().length).toBeGreaterThanOrEqual(6);
    const bruto = crudo();
    for (const [donde, valor] of Object.entries(s)) {
      expect(bruto, donde).not.toContain(valor);
    }
    expect(new Set(elementos().map((e) => e.type))).toEqual(new Set(["event"]));
    // El código de Prisma sí, que es una constante suya.
    expect(bruto).toContain("P2002");
  });
});

describe("sin trazas, ni siquiera cuando las pide quien llama", () => {
  const traza = `${"a".repeat(32)}-${"b".repeat(16)}-1`;
  const baggage =
    "sentry-sampled=true,sentry-sample_rate=1,sentry-trace_id=" +
    "a".repeat(32);

  it("N=60 con la decisión heredada, y con las variables que las encienden", async () => {
    await arrancar({
      NODE_ENV: "production",
      SENTRY_TRACES_SAMPLE_RATE: "1",
      SENTRY_TRACE: traza,
      SENTRY_BAGGAGE: baggage,
    });
    for (let i = 0; i < 60; i++) {
      Sentry.continueTrace({ sentryTrace: traza, baggage }, () =>
        Sentry.startSpan(
          { name: `POST /x/${i}`, op: "http.server" },
          (span) => {
            span.setAttribute("http.url", `/x/${i}`);
          },
        ),
      );
    }
    await vaciar();
    expect(recibidos).toHaveLength(0);
  });

  it("las peticiones salientes no llevan `sentry-trace` ni `baggage`", async () => {
    await arrancar({ SENTRY_TRACES_SAMPLE_RATE: "1" });
    const puerto = (receptor.address() as AddressInfo).port;
    await Sentry.continueTrace({ sentryTrace: traza, baggage }, () =>
      Sentry.startSpan({ name: "fuera" }, async () => {
        await fetch(`http://127.0.0.1:${puerto}/proveedor`);
        await new Promise<void>((resolve, reject) => {
          request(
            { host: "127.0.0.1", port: puerto, path: "/proveedor" },
            (res) => {
              res.resume();
              res.on("end", resolve);
            },
          )
            .on("error", reject)
            .end();
        });
      }),
    );
    const salientes = recibidos.filter((r) => r.url === "/proveedor");
    expect(salientes).toHaveLength(2);
    for (const r of salientes) {
      expect(r.headers.toLowerCase()).not.toMatch(/sentry-trace|baggage/);
    }
  });
});

describe("el cliente que se instala", () => {
  it("lleva tres piezas contadas, y ninguna recoge datos", async () => {
    await arrancar();
    const options = Sentry.getClient()!.getOptions();
    expect(options.integrations.map((i) => i.name)).toEqual([
      "LinkedErrors",
      "OnUncaughtException",
      "OnUnhandledRejection",
    ]);
    expect("tracesSampleRate" in options).toBe(false);
    expect("tracesSampler" in options).toBe(false);
  });

  it("nunca lanza hacia quien está gestionando otro fallo", async () => {
    const { captureException } = await arrancar();
    // `decodeURI` del analizador de pilas falla con un escape roto.
    const err = new Error("x");
    err.stack = "Error: x\n    at f (/a/%E0%A4%A.js:1:1)";
    expect(() => captureException(err)).not.toThrow();
  });
});
