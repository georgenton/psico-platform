import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { declaredEnvironment, prototypeRoutesHidden } from "./deploy-env";

/**
 * El gate de `/prototipos/*` decidía con `VERCEL_ENV`, que sólo Vercel define.
 * Con el runtime en Coolify esa variable no existe, así que la condición
 * desaparecía con la plataforma y la ruta quedaba accesible en producción
 * (ADR 0024). Lo que estas pruebas fijan son las dos mitades del contrato:
 *
 * - en Vercel el comportamiento es **exactamente** el de antes, porque Vercel
 *   sigue encendido como rollback y no se puede regresar ahí;
 * - fuera de Vercel, ante la duda se oculta.
 */

const CLAVES = [
  "PSICO_ENV",
  "VERCEL_ENV",
  "PSICO_DEPLOYED",
  "COOLIFY_RESOURCE_UUID",
  "COOLIFY_CONTAINER_NAME",
  "COOLIFY_URL",
] as const;

const guardado = new Map<string, string | undefined>();

beforeEach(() => {
  for (const k of CLAVES) {
    guardado.set(k, process.env[k]);
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of CLAVES) {
    const v = guardado.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("declaredEnvironment", () => {
  it("devuelve null cuando nadie lo declaró — un portátil no afirma un entorno", () => {
    expect(declaredEnvironment()).toBeNull();
  });

  it("prefiere PSICO_ENV, que es el nombre que la API ya usa", () => {
    process.env.PSICO_ENV = "staging";
    process.env.VERCEL_ENV = "production";
    expect(declaredEnvironment()).toBe("staging");
  });

  it("cae a VERCEL_ENV mientras Vercel siga encendido", () => {
    process.env.VERCEL_ENV = "preview";
    expect(declaredEnvironment()).toBe("preview");
  });

  it("normaliza espacios y mayúsculas, porque una variable la escribe una persona", () => {
    process.env.PSICO_ENV = "  Production  ";
    expect(declaredEnvironment()).toBe("production");
  });
});

describe("prototypeRoutesHidden", () => {
  // ── Vercel, sin cambios respecto a antes de ADR 0024 ──────────────────────

  it("oculta en producción de Vercel", () => {
    process.env.VERCEL_ENV = "production";
    expect(prototypeRoutesHidden()).toBe(true);
  });

  it("muestra en preview de Vercel — es la superficie de revisión de diseño", () => {
    process.env.VERCEL_ENV = "preview";
    expect(prototypeRoutesHidden()).toBe(false);
  });

  // ── Entorno declarado explícitamente ──────────────────────────────────────

  it("oculta cuando el entorno declarado es producción", () => {
    process.env.PSICO_ENV = "production";
    expect(prototypeRoutesHidden()).toBe(true);
  });

  it("muestra en staging declarado, igual que en un preview", () => {
    process.env.PSICO_ENV = "staging";
    process.env.COOLIFY_RESOURCE_UUID = "abc123";
    expect(prototypeRoutesHidden()).toBe(false);
  });

  it("PSICO_ENV manda sobre VERCEL_ENV", () => {
    process.env.PSICO_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    expect(prototypeRoutesHidden()).toBe(true);
  });

  // ── La fila que este cambio añade ─────────────────────────────────────────

  it("oculta en una caja desplegada que no declara su entorno", () => {
    // Antes, «nadie lo declaró» sólo pasaba en local. En Coolify pasaría en
    // producción si alguien olvida la variable, y el gate se habría abierto solo.
    // El coste de equivocarse debe ser un 404 molesto, no una ruta publicada.
    process.env.COOLIFY_RESOURCE_UUID = "abc123";
    expect(prototypeRoutesHidden()).toBe(true);
  });

  it("oculta con PSICO_DEPLOYED, que funciona en una plataforma que nadie le enseñó", () => {
    process.env.PSICO_DEPLOYED = "1";
    expect(prototypeRoutesHidden()).toBe(true);
  });

  // ── Controles negativos ───────────────────────────────────────────────────

  it("muestra en un portátil sin ninguna variable", () => {
    expect(prototypeRoutesHidden()).toBe(false);
  });

  it("NO toma un CLIENTE de Coolify por una caja desplegada", () => {
    // `COOLIFY_URL` y `COOLIFY_TOKEN` son cómo se configura una máquina para
    // HABLAR con un Coolify: cualquier portátil con el CLI o el MCP las lleva.
    // Si contaran, los prototipos desaparecerían en local.
    process.env.COOLIFY_URL = "https://coolify.example";
    expect(prototypeRoutesHidden()).toBe(false);
  });

  it("no toma un PSICO_DEPLOYED vacío por una caja desplegada", () => {
    process.env.PSICO_DEPLOYED = "   ";
    expect(prototypeRoutesHidden()).toBe(false);
  });
});
