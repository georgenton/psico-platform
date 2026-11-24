import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SENSITIVE_HEADERS } from "@psico/types";

/**
 * Cómo está cableada la observabilidad de Web, y qué no puede volver.
 *
 * Esta prueba comprobaba antes que tres configuraciones del SDK instalaran el
 * mismo redactor. Pasaba, y la Web no enviaba nada: `instrumentation.ts` estaba
 * en la raíz, donde Next no lo mira, y nada inyectaba el cliente. Que un fichero
 * diga lo correcto no prueba que se ejecute; eso lo hace el ensayo de
 * `scripts/sentry-sumidero`, sobre la aplicación construida. Aquí queda lo que
 * el código fuente sí puede responder.
 */

const WEB = resolve(__dirname, "../../..");
const SRC = join(WEB, "src");
const lee = (f: string) => readFileSync(join(WEB, f), "utf8");
const codigo = (f: string) =>
  lee(f).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");

const fuentes = (dir = SRC): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return fuentes(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });

describe("se carga de verdad en Next 14.2", () => {
  it("el gancho está en `src/` y activado", () => {
    expect(existsSync(join(SRC, "instrumentation.ts"))).toBe(true);
    expect(existsSync(join(WEB, "instrumentation.ts"))).toBe(false);
    expect(lee("next.config.js")).toContain("instrumentationHook: true");
  });

  it("el import del servidor va DENTRO de la condición de entorno", () => {
    // Salir antes no basta: el empaquetador de Edge sólo descarta la rama si la
    // condición la envuelve, y sin eso el build muere con `node:fs`.
    expect(codigo("src/instrumentation.ts")).toMatch(
      /if \(process\.env\.NEXT_RUNTIME === "nodejs"\) \{[\s\S]*import\("\.\/lib\/observability\/server"\)/,
    );
  });

  it("el navegador arranca desde el layout raíz", () => {
    expect(lee("src/app/layout.tsx")).toContain("<ObservabilityBoot />");
  });

  it("y sin DSN en la construcción no queda el SDK: la condición se incrusta", () => {
    expect(lee("next.config.js")).toMatch(
      /NEXT_PUBLIC_SENTRY_DSN: process\.env\.NEXT_PUBLIC_SENTRY_DSN\?\.trim\(\) \|\| ""/,
    );
    expect(
      codigo("src/components/observability/ObservabilityBoot.tsx"),
    ).toMatch(
      /if \(process\.env\.NEXT_PUBLIC_SENTRY_DSN && [\s\S]*import\("@\/lib\/observability\/browser"\)/,
    );
  });

  it("el middleware informa y relanza", () => {
    expect(codigo("src/middleware.ts")).toMatch(
      /import\("@\/lib\/observability\/edge"\)[\s\S]{0,200}throw error;/,
    );
  });
});

describe("lo que no puede volver", () => {
  it("ni los ficheros de configuración del SDK, ni su envoltorio de construcción", () => {
    for (const f of [
      "sentry.client.config.ts",
      "sentry.server.config.ts",
      "sentry.edge.config.ts",
    ]) {
      expect(existsSync(join(WEB, f)), f).toBe(false);
    }
    expect(codigo("next.config.js")).not.toContain("withSentryConfig");
    // Trae un binario que habla con sentry.io durante la construcción.
    expect(lee("package.json")).not.toContain("@sentry/nextjs");
  });

  it("nadie más importa el SDK", () => {
    const fuera = fuentes().filter(
      (f) =>
        !f.startsWith(join(SRC, "lib/observability")) &&
        /["']@sentry\//.test(readFileSync(f, "utf8")),
    );
    expect(fuera).toEqual([]);
  });

  it("ningún proceso usa Sentry.init, trazas, repetición, migas ni perfiles", () => {
    for (const f of ["server", "edge", "browser"]) {
      const src = codigo(`src/lib/observability/${f}.ts`);
      expect(src, f).not.toMatch(/Sentry\.init\w*\(|\binit\w*WithDefault/);
      expect(src, f).not.toMatch(
        /tracesSample|enableTracing|replay|Tracing|profil|feedbackIntegration|breadcrumbsIntegration|httpContext|captureConsole/i,
      );
      expect(src, f).not.toMatch(/NODE_ENV/);
    }
  });

  it("la lista blanca es la compartida, en los tres", () => {
    for (const f of ["server", "edge", "browser"]) {
      expect(lee(`src/lib/observability/${f}.ts`), f).toContain(
        'from "@psico/types/observability"',
      );
    }
    // Y los dos que usan un transporte del SDK lo envuelven.
    for (const f of ["server", "browser"]) {
      expect(codigo(`src/lib/observability/${f}.ts`), f).toMatch(
        /transport: guardTransport\(/,
      );
    }
  });
});

describe("una sola lista de cabeceras que son credenciales", () => {
  it("nombra las de Círculos", () => {
    for (const h of [
      "x-circle-guest-session",
      "x-client-attestation",
      "set-cookie",
      "cookie",
      "authorization",
    ]) {
      expect(SENSITIVE_HEADERS).toContain(h);
    }
  });
});
