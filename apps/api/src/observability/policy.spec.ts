import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_CODES, API_TAGS, API_TYPES, nodePolicy } from "./policy";
import { isRouteTemplate, registerRouteTemplates } from "./route-templates";

/**
 * Las listas cerradas de la API, para que no envejezcan en silencio.
 *
 * Que falte un nombre aquí no abre ningún hueco —el valor no sale—, pero sí
 * deja el informe de un error con menos de lo que podía decir. Estas pruebas
 * son las que avisan.
 */

const SRC = resolve(__dirname, "..");

const fuentes = (dir = SRC): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return fuentes(p);
    return /\.ts$/.test(e.name) && !/(spec|testing|fixture)\b/.test(e.name)
      ? [p]
      : [];
  });

/** Herramientas de línea de comandos: no corren en ningún proceso servido. */
const ES_CLI = /(-cli|-main|-backfill|authorship-|markdown-repair)/;

describe("las clases de error propias", () => {
  it("están todas en la lista, salvo las de las herramientas de consola", () => {
    const faltan: string[] = [];
    let vistas = 0;
    for (const f of fuentes()) {
      if (ES_CLI.test(f)) continue;
      for (const m of readFileSync(f, "utf8").matchAll(
        /\bclass (\w+) extends \w*(?:Error|Exception)\b/g,
      )) {
        vistas++;
        if (!API_TYPES.has(m[1]!)) faltan.push(`${m[1]} (${f})`);
      }
    }
    // Control: si el recorrido deja de encontrar clases, esto no prueba nada.
    expect(vistas).toBeGreaterThan(25);
    expect(faltan).toEqual([]);
  });
});

describe("los códigos de las respuestas 5xx", () => {
  it("están todos en la lista", () => {
    const faltan: string[] = [];
    let vistos = 0;
    const patron =
      /new (?:ServiceUnavailable|InternalServerError|BadGateway|GatewayTimeout|NotImplemented|ExpectedUnavailable)Exception\(\s*(?:"([A-Z][A-Z0-9_]+)"|\{[^}]*?code:\s*"([A-Z][A-Z0-9_]+)")/g;
    for (const f of fuentes()) {
      for (const m of readFileSync(f, "utf8").matchAll(patron)) {
        vistos++;
        const code = (m[1] ?? m[2])!;
        if (!API_CODES.has(code)) faltan.push(`${code} (${f})`);
      }
    }
    expect(vistos).toBeGreaterThan(10);
    expect(faltan).toEqual([]);
  });
});

describe("las etiquetas", () => {
  it("una cola o un trabajo ajenos no pasan", () => {
    expect(API_TAGS.queue!("email")).toBe(true);
    expect(API_TAGS.queue!("otra")).toBe(false);
    expect(API_TAGS.job!("send-email")).toBe(true);
    expect(API_TAGS.job!("ana@ejemplo.test")).toBe(false);
  });

  it("una etapa de Eco heredada de Object no pasa", () => {
    expect(API_TAGS.stage!("model")).toBe(true);
    expect(API_TAGS.stage!("constructor")).toBe(false);
    expect(API_TAGS.category!("toString")).toBe(false);
  });

  it("una ruta sólo pasa si el enrutador la tiene", () => {
    expect(isRouteTemplate("/api/compartir/cmu123")).toBe(false);
    registerRouteTemplates({
      _router: {
        stack: [
          { route: { path: "/api/books/:idOrSlug" } },
          { route: { path: /regex/ } },
          {},
        ],
      },
    });
    expect(isRouteTemplate("/api/books/:idOrSlug")).toBe(true);
    expect(isRouteTemplate("/api/books/emociones-en-construccion")).toBe(false);
    expect(API_TAGS.route!("/api/:unmatched")).toBe(true);
  });
});

describe("la política del proceso", () => {
  it("toma el entorno de PSICO_ENV y nunca de NODE_ENV", () => {
    const antes = { psico: process.env.PSICO_ENV, node: process.env.NODE_ENV };
    try {
      process.env.NODE_ENV = "production";
      process.env.PSICO_ENV = "staging";
      expect(nodePolicy("feelverse-api").environment).toBe("staging");
      delete process.env.PSICO_ENV;
      expect(nodePolicy("feelverse-api").environment).toBe("undeclared");
    } finally {
      process.env.NODE_ENV = antes.node;
      if (antes.psico === undefined) delete process.env.PSICO_ENV;
      else process.env.PSICO_ENV = antes.psico;
    }
  });

  it("reconoce un fichero de este despliegue", () => {
    const p = nodePolicy("feelverse-api");
    expect(p.file(__filename)).toEqual({
      name: "apps/api/src/observability/policy.spec.ts",
      inApp: true,
    });
    expect(p.file("/etc/hosts")).toBeNull();
  });
});

describe("sólo hay un sitio que arranca un SDK de errores", () => {
  it("nadie más importa @sentry en la API", () => {
    const fuera = fuentes().filter(
      (f) =>
        !f.startsWith(join(SRC, "observability")) &&
        /from "@sentry\/|require\("@sentry\//.test(readFileSync(f, "utf8")),
    );
    expect(fuera).toEqual([]);
  });

  it("y ese sitio no usa Sentry.init", () => {
    const src = readFileSync(join(SRC, "observability", "sentry.ts"), "utf8");
    const codigo = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/Sentry\.init\w*\(/);
    expect(codigo).not.toMatch(/traces|enableTracing|Replay|profil/i);
    // Que un fallo sin atrapar termine el proceso como lo haría Node. El modo
    // por defecto del SDK avisa y deja el proceso vivo: medido, con una promesa
    // rechazada, «sigue vivo» donde Node sale con 1.
    expect(codigo).toContain('mode: "strict"');
    expect(codigo).toContain("exitEvenIfOtherHandlersAreRegistered: false");
  });
});
