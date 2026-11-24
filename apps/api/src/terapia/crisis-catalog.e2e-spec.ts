import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CRISIS_COUNTRIES } from "@psico/types";

import { closeE2EApp, createE2EApp, type E2EHarness } from "../test/e2e-app";
import { getCrisisFor } from "./crisis-catalog";

/**
 * `GET /api/terapia/crisis` sirve EXACTAMENTE este catálogo, y sin sesión.
 *
 * ── Por qué el catálogo está escrito dos veces ────────────────────────────
 *
 * Los literales de abajo se generaron ejecutando el catálogo ANTERIOR, cuando
 * vivía dentro de la API, antes de mover una sola línea a `@psico/types`. No
 * se derivan del módulo que se comprueba: si se derivaran, mover el catálogo y
 * estropear un teléfono por el camino pasaría en verde.
 *
 * Así que tocar un número, un horario, un orden o una frase obliga a tocarlo
 * también aquí, a la vista. Es deliberado: son los datos que alguien lee en el
 * peor momento, y un cambio tiene que ser una decisión y no un efecto lateral.
 *
 * ── Y por qué sobre HTTP ──────────────────────────────────────────────────
 *
 * La prueba del servicio llama al método; no puede decir si la ruta exige
 * sesión. Aquí se arranca la aplicación entera y se pide sin cabecera alguna.
 */

const EC = {
  country: "EC",
  lines: [
    {
      id: "ec-sas-911",
      name: "SAS · 911 Salud Mental",
      phone: "911",
      availability: "24/7",
      languages: ["es"],
    },
    {
      id: "ec-cetad",
      name: "CETAD · Centro de Escucha Telefónica",
      phone: "+593-2-3960-100",
      availability: "Lun–Vie 08:00–20:00",
      languages: ["es"],
    },
    {
      id: "ec-telefono-amistad",
      name: "Teléfono de la Amistad Quito",
      phone: "+593-2-2563-141",
      availability: "Diario 16:00–22:00",
      languages: ["es"],
    },
  ],
  safetyTipsShort: [
    "Respira lento. 4 segundos al inhalar, 6 al exhalar.",
    "Estás en un cuerpo. Mira un objeto y nómbralo en voz alta.",
    "Si tienes a alguien cerca, dile lo que sientes.",
    "Si el impulso está fuerte, aleja objetos peligrosos y llama al 911.",
  ],
  nextSteps: [
    "Llama a una línea de la lista de arriba. Estás haciendo lo correcto.",
    "Si estás bajo medicación, no la dejes sin hablar con tu médico.",
    "Mañana, agenda una consulta. Hoy alcanzaste a pedir ayuda.",
  ],
};

const CO = {
  country: "CO",
  lines: [
    {
      id: "co-linea-106",
      name: "Línea 106 · Apoyo Emocional",
      phone: "106",
      availability: "24/7",
      languages: ["es"],
    },
  ],
  safetyTipsShort: [
    "Respira lento.",
    "Llama a la línea 106 — es gratis y anónima.",
  ],
  nextSteps: ["Llama a la línea 106."],
};

const MX = {
  country: "MX",
  lines: [
    {
      id: "mx-saptel",
      name: "SAPTEL",
      phone: "+52-55-5259-8121",
      availability: "24/7",
      languages: ["es"],
    },
  ],
  safetyTipsShort: ["Respira lento.", "SAPTEL responde 24/7."],
  nextSteps: ["Llama a SAPTEL."],
};

const INTL = {
  country: "INTL",
  lines: [
    {
      id: "intl-iasp",
      name: "IASP · Directorio internacional",
      phone: "+1-800-273-8255",
      chatUrl: "https://findahelpline.com",
      availability: "24/7",
      languages: ["es", "en"],
    },
  ],
  safetyTipsShort: [
    "Breathe slow. 4 seconds in, 6 seconds out.",
    "Reach out to someone you trust.",
    "If you have access, remove dangerous objects from reach.",
  ],
  nextSteps: [
    "Visit findahelpline.com to find a local line.",
    "Tell one person what you are feeling.",
  ],
};

/** [lo que se pide, lo que se responde]. `undefined` es pedir sin país. */
const CASOS: ReadonlyArray<[string | undefined, unknown]> = [
  [undefined, EC],
  ["", EC],
  ["EC", EC],
  ["ec", EC],
  ["CO", CO],
  ["co", CO],
  ["MX", MX],
  ["mx", MX],
  ["PE", INTL],
  ["ZZ", INTL],
  ["INTL", INTL],
  ["constructor", INTL],
  ["__proto__", INTL],
];

describe("el catálogo de crisis no cambió al mudarse de paquete", () => {
  it.each(CASOS)("getCrisisFor(%j)", (pais, esperado) => {
    expect(getCrisisFor(pais)).toStrictEqual(esperado);
  });

  it("los países son los que había, en el orden en que estaban", () => {
    expect([...CRISIS_COUNTRIES]).toStrictEqual(["EC", "CO", "MX"]);
  });
});

describe("GET /api/terapia/crisis", () => {
  let h: E2EHarness;

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    h = await createE2EApp();
  }, 30_000);

  afterAll(async () => {
    await closeE2EApp(h);
  });

  it.each(CASOS)("?country=%j responde sin sesión", async (pais, esperado) => {
    const ruta =
      pais === undefined
        ? "/api/terapia/crisis"
        : `/api/terapia/crisis?country=${encodeURIComponent(pais)}`;
    const res = await request(h.app.getHttpServer()).get(ruta);

    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual(esperado);
  });

  it("no consulta la base: una base caída no puede dejar a nadie sin líneas", async () => {
    await h.resetMocks();
    await request(h.app.getHttpServer()).get("/api/terapia/crisis?country=EC");

    const llamadas: string[] = [];
    for (const [modelo, api] of Object.entries(
      h.prisma as unknown as Record<string, unknown>,
    )) {
      if (typeof api !== "object" || api === null) continue;
      for (const [metodo, fn] of Object.entries(
        api as Record<string, unknown>,
      )) {
        const mock = (fn as { mock?: { calls: unknown[] } } | null)?.mock;
        if (mock && mock.calls.length > 0) llamadas.push(`${modelo}.${metodo}`);
      }
    }
    expect(llamadas).toStrictEqual([]);
  });
});
