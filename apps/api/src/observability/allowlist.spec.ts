import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EXTERNAL_FILE,
  OMITTED_MESSAGE,
  UNLISTED_ERROR,
  closedEnvironment,
  closedRelease,
  guardTransport,
  guardedOptions,
  isMinifiedFunction,
  nodeFrames,
  safeEnvelope,
  safeEvent,
  safeMessage,
  type ObservabilityPolicy,
} from "@psico/types";

/**
 * La lista blanca, por separado de cualquier SDK.
 *
 * `@psico/types` no tiene ejecutor de pruebas: las suyas viven en el workspace
 * que las consume. Los señuelos se generan al EJECUTAR; uno escrito en el
 * fichero podría aparecer en una pila y acusar una fuga que no lo es.
 */

const senuelo = () => `s${randomBytes(9).toString("hex")}`;

const policy = (
  over: Partial<ObservabilityPolicy> = {},
): ObservabilityPolicy => ({
  service: "feelverse-api",
  environment: "staging",
  release: "0123456789ab",
  platform: "node",
  file: (raw) =>
    raw === "dist/a.js" ? { name: "dist/a.js", inApp: true } : null,
  fn: (name) => name === "conocida",
  ...over,
});

describe("identidad", () => {
  it("el entorno es el declarado, y si nadie lo dijo se dice", () => {
    expect(closedEnvironment(" Staging ")).toBe("staging");
    expect(closedEnvironment("production")).toBe("production");
    expect(closedEnvironment(undefined)).toBe("undeclared");
    expect(closedEnvironment("preview")).toBe("undeclared");
    expect(closedEnvironment(senuelo())).toBe("undeclared");
  });

  it("la versión es un SHA o no es", () => {
    expect(closedRelease("6521DC6F0123456789abcdef0123456789abcdef")).toBe(
      "6521dc6f0123",
    );
    for (const raw of ["", "HEAD", "unknown", "v1.2.3", senuelo(), null]) {
      expect(closedRelease(raw), String(raw)).toBeNull();
    }
  });
});

describe("el evento se reconstruye, no se redacta", () => {
  it("ningún campo que no esté enumerado sobrevive", () => {
    const s = senuelo();
    const out = safeEvent(
      {
        event_id: "a".repeat(32),
        timestamp: 1,
        level: "fatal",
        platform: s,
        environment: s,
        release: s,
        dist: s,
        server_name: s,
        transaction: `/compartir/${s}`,
        logger: s,
        fingerprint: [s],
        modules: { [s]: s },
        user: { id: s, ip_address: s, email: s },
        request: {
          url: `https://h/i?t=${s}#${s}`,
          headers: { authorization: s, "x-forwarded-for": s, "user-agent": s },
          cookies: { psico_at: s },
          data: { textPlaintext: s },
          query_string: s,
        },
        breadcrumbs: [{ message: s, data: { url: s } }],
        extra: { [s]: s },
        contexts: {
          trace: { trace_id: s, data: { "http.url": s } },
          custom: { path: s },
          runtime: { name: "node", version: "v20.11.1", build: s },
          [s]: { a: s },
        },
        tags: { [s]: s, service: s, method: s, status: s, code: s },
        debug_meta: { images: [{ code_file: s }] },
        exception: {
          values: [
            {
              type: s,
              value: s,
              module: s,
              thread_id: s,
              mechanism: {
                type: s,
                handled: false,
                data: { [s]: s },
                source: s,
              },
              stacktrace: {
                frames: [
                  {
                    filename: `https://h/v1?token=${s}`,
                    function: s,
                    lineno: 1,
                  },
                  {
                    filename: "dist/a.js",
                    abs_path: s,
                    module: s,
                    function: s,
                    lineno: 7,
                    colno: 3,
                    in_app: true,
                    vars: { x: s },
                    context_line: s,
                    pre_context: [s],
                    post_context: [s],
                    [s]: s,
                  },
                ],
              },
              [s]: s,
            },
          ],
        },
        sdk: {
          name: "sentry.javascript.node",
          version: "8.55.2",
          integrations: [s],
          packages: [{ name: s }],
        },
        [s]: s,
      },
      policy(),
    );

    expect(JSON.stringify(out)).not.toContain(s);
    // Y lo que hace falta para arreglar algo, está.
    expect(out).toEqual({
      event_id: "a".repeat(32),
      timestamp: 1,
      level: "fatal",
      platform: "node",
      environment: "staging",
      release: "0123456789ab",
      tags: { service: "feelverse-api", runtime: "node" },
      contexts: { runtime: { name: "node", version: "v20.11.1" } },
      sdk: {
        name: "sentry.javascript.node",
        version: "8.55.2",
        settings: { infer_ip: "never" },
      },
      exception: {
        values: [
          {
            type: UNLISTED_ERROR,
            value: expect.stringMatching(/^\[mensaje omitido\] #[0-9a-f]{8}$/),
            mechanism: { type: "generic", handled: false },
            stacktrace: {
              frames: [
                { filename: EXTERNAL_FILE, in_app: false },
                { filename: "dist/a.js", in_app: true, lineno: 7, colno: 3 },
              ],
            },
          },
        ],
      },
    });
  });

  it("lo que no es un error no es nada: trazas, comentarios, repeticiones", () => {
    for (const type of [
      "transaction",
      "feedback",
      "replay_event",
      "profile",
      "default",
    ]) {
      expect(safeEvent({ type, message: "x" }, policy()), type).toBeNull();
    }
    expect(safeEvent(null, policy())).toBeNull();
    expect(safeEvent("texto", policy())).toBeNull();
  });

  it("un getter que lanza no se convierte en otro evento", () => {
    const trampa = Object.defineProperty({}, "exception", {
      enumerable: true,
      get() {
        throw new Error(senuelo());
      },
    });
    expect(safeEvent(trampa, policy())).toBeNull();
  });

  it("es idempotente: la segunda puerta devuelve lo mismo", () => {
    const una = safeEvent(
      {
        event_id: "b".repeat(32),
        timestamp: 2,
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot read properties of null (reading 'map')",
            },
            { type: "Error", value: senuelo() },
            { type: "Error", value: "connect ECONNREFUSED 10.0.0.1:5432" },
            { type: "Error", value: "connect ESENUELO 10.0.0.1:5432" },
          ],
        },
        tags: { method: "POST", status: 503, code: "P2002" },
        contexts: { runtime: { name: "node", version: "v20.1.2" } },
        sdk: { name: "sentry.javascript.node", version: "8.55.2" },
      },
      policy(),
    );
    expect(safeEvent(una, policy())).toEqual(una);
  });

  it("el código sale del error original sólo si está en la lista", () => {
    const conCodigo = (code: unknown) =>
      safeEvent({ exception: { values: [] } }, policy(), {
        originalException: Object.assign(new Error("x"), { code }),
      })?.tags.error_code;
    expect(conCodigo("P2002")).toBe("P2002");
    expect(conCodigo("ECONNREFUSED")).toBe("ECONNREFUSED");
    expect(conCodigo("23505")).toBe("23505");
    for (const ajeno of [senuelo(), "AYUDA_POR_FAVOR", "K7QX9", 42, {}]) {
      expect(conCodigo(ajeno), String(ajeno)).toBeUndefined();
    }
    // O el de su causa, que es donde lo deja `fetch`.
    expect(
      safeEvent({}, policy(), {
        originalException: new Error("fetch failed", {
          cause: Object.assign(new Error("x"), { code: "ECONNRESET" }),
        }),
      })?.tags.error_code,
    ).toBe("ECONNRESET");
  });

  it("una etiqueta propia se contrasta con SU conjunto", () => {
    const p = policy({ tags: { queue: (v) => v === "email" } });
    expect(safeEvent({ tags: { queue: "email" } }, p)?.tags.queue).toBe(
      "email",
    );
    expect(
      safeEvent({ tags: { queue: senuelo() } }, p)?.tags.queue,
    ).toBeUndefined();
    // Y no se acepta una etiqueta que la política no declaró.
    expect(
      safeEvent({ tags: { queue: "email" } }, policy())?.tags.queue,
    ).toBeUndefined();
  });

  it("conserva la causa y el grupo de errores, sin su contenido", () => {
    const s = senuelo();
    const out = safeEvent(
      {
        exception: {
          values: [
            {
              type: "Error",
              value: s,
              mechanism: {
                type: "chained",
                source: "cause",
                exception_id: 1,
                parent_id: 0,
              },
            },
            {
              type: "AggregateError",
              value: s,
              mechanism: {
                type: "generic",
                exception_id: 0,
                is_exception_group: true,
                source: `errors[${s}]`,
              },
            },
          ],
        },
      },
      policy(),
    );
    expect(JSON.stringify(out)).not.toContain(s);
    expect(out?.exception?.values.map((v) => v.mechanism)).toEqual([
      { type: "chained", source: "cause", exception_id: 1, parent_id: 0 },
      { type: "generic", exception_id: 0, is_exception_group: true },
    ]);
  });
});

describe("el mensaje", () => {
  const casos: [string, string][] = [
    [
      "Cannot read properties of undefined (reading 'map')",
      "Cannot read properties of undefined (reading 'map')",
    ],
    ["connect ECONNREFUSED 10.0.1.9:5432", "connect ECONNREFUSED"],
    ["getaddrinfo ENOTFOUND db.interno", "getaddrinfo ENOTFOUND"],
    ["ENOENT: no such file or directory, open '/x'", "ENOENT"],
    ["Request failed with status code 429", "HTTP 429"],
    ["Status code: 401", "HTTP 401"],
    ["timeout of 5000ms exceeded", "timeout exceeded"],
    ["GUIDE_UNAVAILABLE", "GUIDE_UNAVAILABLE"],
    ["P2025", "P2025"],
  ];
  it.each(casos)("%s", (entra, sale) => {
    const p = policy({ codes: new Set(["GUIDE_UNAVAILABLE"]) });
    expect(safeMessage(entra, p)).toBe(sale);
    expect(safeMessage(sale, p)).toBe(sale);
  });

  it("de los mensajes que llevan contenido, el contenido no pasa", () => {
    const s = senuelo();
    for (const entra of [
      `Cannot read properties of undefined (reading '${s}')`,
      `Cannot destructure property '${s}' of 'x' as it is undefined.`,
      `${s} is not a function`,
      `${s} is not defined`,
      `Unexpected token 'h', "${s}" is not valid JSON`,
      `Expected ',' or '}' after property value in JSON at position 3 ${s}`,
      `connect ECONNREFUSED ${s}:5432`,
      `connect E${s.toUpperCase()} ${s}`,
      `ENOENT: no such file or directory, open '/tmp/${s}'`,
      `\nInvalid \`prisma.user.findUnique()\` invocation:\n{ where: { email: "${s}" } }`,
      `Unique constraint failed on the fields: (\`${s}\`)`,
      `duplicate key value violates unique constraint "${s}"`,
      `relation "${s}" does not exist`,
      `Request failed with status code 400 ${s}`,
      `Minified React error #31; visit https://reactjs.org/?args[]=${s}`,
      `Loading chunk ${s} failed.`,
      `Cannot find module '${s}'`,
      `eco.sendMessage threadId=${s}`,
      `Failed to execute 'setItem' on 'Storage': ${s}`,
      `Invalid URL: ${s}`,
      `jwt expired ${s}`,
      `GUIDE_${s.toUpperCase()}`,
      s,
      `Hoy me siento muy mal y ${s}`,
    ]) {
      const sale = safeMessage(entra, policy());
      expect(sale ?? "", entra).not.toContain(s);
      expect(sale ?? "", entra).not.toContain(s.toUpperCase());
    }
  });

  it("un mensaje desconocido deja una marca que agrupa por SITIO, no por texto", () => {
    const con = (value: string, lineno: number) =>
      safeEvent(
        {
          exception: {
            values: [
              {
                type: "Error",
                value,
                stacktrace: { frames: [{ filename: "dist/a.js", lineno }] },
              },
            ],
          },
        },
        policy(),
      )?.exception?.values[0]?.value;
    expect(con("una cosa", 7)).toBe(con("otra distinta", 7));
    expect(con("una cosa", 7)).not.toBe(con("una cosa", 8));
    expect(con("una cosa", 7)).toContain(OMITTED_MESSAGE);
  });
});

describe("los marcos se comprueban contra el despliegue", () => {
  const textos: Record<string, string> = {
    "/app/apps/api/dist/eco/eco.service.js":
      "class EcoService { async runSendMessage() {} }",
    "/app/node_modules/.pnpm/bullmq@5/node_modules/bullmq/dist/worker.js":
      "class Worker { processJob() {} }",
  };
  const io = nodeFrames({
    root: "/app",
    exists: (p) => p in textos,
    read: (p) => textos[p] ?? null,
    isBuiltin: (n) => n === "http",
  });

  it("acepta un fichero real, y lo entrega relativo", () => {
    expect(io.file("/app/apps/api/dist/eco/eco.service.js")).toEqual({
      name: "apps/api/dist/eco/eco.service.js",
      inApp: true,
    });
    expect(io.file("file:///app/apps/api/dist/eco/eco.service.js")?.name).toBe(
      "apps/api/dist/eco/eco.service.js",
    );
    const dep = io.file(
      "/app/node_modules/.pnpm/bullmq@5/node_modules/bullmq/dist/worker.js",
    );
    expect(dep).toEqual({
      name: "node_modules/bullmq/dist/worker.js",
      inApp: false,
    });
    // La segunda puerta vuelve a preguntar por el nombre publicado.
    expect(io.file(dep!.name)).toEqual(dep);
  });

  it("rechaza lo que tiene forma de ruta y no es del despliegue", () => {
    const s = senuelo();
    for (const raw of [
      `/tmp/${s}.js`,
      `/app/${s}.js`,
      `/app/../etc/${s}`,
      "/app/apps/api/dist/../dist/eco/eco.service.js",
      `https://proveedor/v1?token=${s}`,
      `webpack://${s}`,
      s,
    ]) {
      expect(io.file(raw), raw).toBeNull();
    }
    expect(io.file(`node:${s}`)).toEqual({
      name: "node:internal",
      inApp: false,
    });
    expect(io.file("node:http")).toEqual({ name: "node:http", inApp: false });
  });

  it("la función tiene que constar en el fichero", () => {
    const f = "/app/apps/api/dist/eco/eco.service.js";
    expect(io.fn("EcoService.runSendMessage", f)).toBe(true);
    expect(io.fn("Object.<anonymous>", f)).toBe(true);
    expect(io.fn(`EcoService.${senuelo()}`, f)).toBe(false);
    expect(io.fn(senuelo(), f)).toBe(false);
    expect(io.fn("me siento mal", f)).toBe(false);
    // También con el nombre ya publicado.
    expect(
      io.fn("EcoService.runSendMessage", "apps/api/dist/eco/eco.service.js"),
    ).toBe(true);
  });

  it("sin acceso al fichero, sólo nombres de código minificado", () => {
    expect(isMinifiedFunction("aB")).toBe(true);
    expect(isMinifiedFunction("Object.a")).toBe(true);
    expect(isMinifiedFunction(senuelo())).toBe(false);
    expect(isMinifiedFunction("miSecreto")).toBe(false);
  });
});

describe("la puerta del transporte", () => {
  const sobre = (items: unknown[], cabeceras: unknown = {}) => [
    cabeceras,
    items,
  ];

  it("rehace las cabeceras del sobre: `trace` y `dsn` no existen", () => {
    const s = senuelo();
    const out = safeEnvelope(
      sobre([[{ type: "event", length: 9, [s]: s }, { message: s }]], {
        event_id: "c".repeat(32),
        dsn: `https://k@h/${s}`,
        sdk: { name: s },
        trace: { transaction: s, user_segment: s, public_key: s },
        [s]: s,
      }),
      policy(),
    );
    expect(JSON.stringify(out)).not.toContain(s);
    expect(Object.keys(out![0])).toEqual(["sent_at"]);
    expect(out![1][0][0]).toEqual({ type: "event" });
  });

  it("sólo salen elementos `event`", () => {
    for (const type of [
      "transaction",
      "session",
      "sessions",
      "client_report",
      "replay_event",
      "replay_recording",
      "profile",
      "profile_chunk",
      "attachment",
      "feedback",
      "user_report",
      "check_in",
      "span",
      "statsd",
      "log",
      "raw_security",
    ]) {
      expect(
        safeEnvelope(sobre([[{ type }, { message: "x" }]]), policy()),
        type,
      ).toBeNull();
    }
  });

  it("un sobre mezclado sale sólo con su evento", () => {
    const s = senuelo();
    const out = safeEnvelope(
      sobre([
        [{ type: "attachment", filename: s }, s],
        [{ type: "event" }, { message: s }],
        [{ type: "session" }, { sid: s }],
      ]),
      policy(),
    );
    expect(out![1]).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain(s);
  });

  it("el transporte envuelto ni llama al de dentro cuando no hay nada que mandar", async () => {
    const enviados: unknown[] = [];
    const t = guardTransport(
      () => ({
        send: async (e: unknown) => {
          enviados.push(e);
          return {};
        },
        flush: async () => true,
      }),
      policy(),
    )({});
    await t.send(sobre([[{ type: "transaction" }, {}]]) as never);
    await t.send("basura" as never);
    expect(enviados).toHaveLength(0);
    await t.send(sobre([[{ type: "event" }, { message: "x" }]]) as never);
    expect(enviados).toHaveLength(1);
    expect(await t.flush(1)).toBe(true);
  });
});

describe("las opciones comunes", () => {
  it("no nombran el trazado: con que la clave exista ya se activa", () => {
    const options = guardedOptions(policy());
    expect("tracesSampleRate" in options).toBe(false);
    expect("tracesSampler" in options).toBe(false);
    expect("enableTracing" in options).toBe(false);
    expect(options.beforeSendTransaction()).toBeNull();
    expect(options.beforeBreadcrumb()).toBeNull();
    expect(options.tracePropagationTargets).toEqual([]);
    expect(options.sendClientReports).toBe(false);
  });
});
