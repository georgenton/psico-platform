import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CRISIS_COUNTRIES } from "@psico/types";

import { closeE2EApp, createE2EApp, type E2EHarness } from "../test/e2e-app";
import { getCrisisFor } from "./crisis-catalog";

/**
 * `GET /api/terapia/crisis` sirve EXACTAMENTE esto, y sin sesión.
 *
 * ── Por qué el catálogo está escrito dos veces ────────────────────────────
 *
 * Los literales de abajo no se derivan del módulo que se comprueba: si se
 * derivaran, estropear un teléfono por el camino pasaría en verde. Tocar un
 * número, un horario, un orden o una frase obliga a tocarlo también aquí, a la
 * vista. Es deliberado: son los datos que alguien lee en el peor momento, y un
 * cambio tiene que ser una decisión y no un efecto lateral.
 *
 * ── Qué cambió el 2026-11-24, y por qué ───────────────────────────────────
 *
 * Los literales anteriores eran los que el catálogo traía de origen, sin
 * fuente. Contrastados uno a uno con las páginas de cada organismo
 * (`docs/product/ayuda-evidencia.md`):
 *
 *   · EC — salen CETAD (su número es la central de un ministerio) y Teléfono de
 *     la Amistad (sin fuente). El 911 se queda como lo que es, emergencias, y
 *     pierde el rótulo «SAS · 911 Salud Mental».
 *   · CO — la 106 deja de decirse «anónima»: el Ministerio dice confidencial.
 *   · MX — SAPTEL deja de decirse «24/7»: su sitio publica dos horarios.
 *   · Internacional — sale el teléfono, que es de Estados Unidos y no de IASP.
 *     Queda un directorio, en su propio campo, y las frases en español.
 *
 * ── Lo que NO cambió ──────────────────────────────────────────────────────
 *
 * La forma. Hay aplicaciones instaladas que leen `phone`, `availability`,
 * `languages`, `lines`, `safetyTipsShort` y `nextSteps`; siguen siendo lo que
 * eran. `notes`, `source` y `directory` son nuevos y opcionales.
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
      id: "ec-911",
      name: "ECU 911 · Emergencias",
      phone: "911",
      availability: "24 horas, todos los días",
      languages: ["es"],
      notes: ["Gratuito", "Todo Ecuador"],
      source: {
        label: "gob.ec",
        url: "https://www.gob.ec/ecu-911/tramites/solicitud-atencion-emergencia-traves-diferentes-mecanismos-alerta",
        checkedOn: "2026-11-24",
      },
    },
  ],
  safetyTipsShort: [
    "Respira lento. 4 segundos al inhalar, 6 al exhalar.",
    "Estás en un cuerpo. Mira un objeto y nómbralo en voz alta.",
    "Si tienes a alguien cerca, dile lo que sientes.",
    "Si el impulso está fuerte, aleja objetos peligrosos y llama al 911.",
  ],
  nextSteps: [
    "Si hay peligro, llama al 911. Estás haciendo lo correcto.",
    "Si estás bajo medicación, no la dejes sin hablar con tu médico.",
    "Mañana, agenda una consulta. Hoy alcanzaste a pedir ayuda.",
  ],
};

const CO = {
  country: "CO",
  lines: [
    {
      id: "co-106",
      name: "Línea 106 · Ministerio de Salud",
      phone: "106",
      availability: "24 horas, todos los días",
      languages: ["es"],
      notes: [
        "Gratuita y confidencial, según el Ministerio de Salud",
        "Algunos territorios tienen su propia 106, que puede tener otro horario",
      ],
      source: {
        label: "minsalud.gov.co",
        url: "https://www.minsalud.gov.co/salud/publica/salud-mental/Paginas/linea-106.aspx",
        checkedOn: "2026-11-24",
      },
    },
  ],
  safetyTipsShort: [
    "Respira lento.",
    "Llama a la línea 106. Es gratuita y confidencial, según el Ministerio de Salud.",
  ],
  nextSteps: [
    "Llama a la línea 106. Si tu territorio tiene la suya, puede tener otro horario.",
    "Si nadie contesta o hay peligro, llama al número de emergencias de tu país.",
  ],
};

const MX = {
  country: "MX",
  lines: [
    {
      id: "mx-saptel",
      name: "SAPTEL",
      phone: "+52-55-5259-8121",
      availability: "Horario sin confirmar",
      languages: ["es"],
      notes: [
        "Servicio gratuito",
        "Su sitio publica dos horarios: 24 horas y de 9:00 a 21:00",
      ],
      source: {
        label: "saptel.org.mx",
        url: "https://www.saptel.org.mx/",
        checkedOn: "2026-11-24",
      },
    },
  ],
  safetyTipsShort: [
    "Respira lento.",
    "SAPTEL es un servicio gratuito. Su horario está sin confirmar.",
  ],
  nextSteps: [
    "Llama a SAPTEL.",
    "Si nadie contesta o hay peligro, llama al número de emergencias de tu país.",
  ],
};

const INTL = {
  country: "INTL",
  lines: [],
  safetyTipsShort: [
    "Respira lento. 4 segundos al inhalar, 6 al exhalar.",
    "Busca a alguien de confianza.",
    "Si tienes objetos peligrosos cerca, aléjalos.",
  ],
  nextSteps: [
    "Busca una línea de tu país en findahelpline.com. Es un directorio, no un chat.",
    "Si hay peligro, llama al número de emergencias de tu país.",
    "Cuéntale a una persona lo que sientes.",
  ],
  directory: {
    id: "intl-findahelpline",
    name: "findahelpline.com",
    url: "https://findahelpline.com",
    note: "Es un directorio de líneas por país, de ThroughLine. No es un chat ni atiende llamadas.",
    source: {
      label: "iasp.info",
      url: "https://www.iasp.info/crisis-centres-helplines/",
      checkedOn: "2026-11-24",
    },
  },
};

/**
 * Lo que hoy NO se puede servir, escrito a mano: lo retirado y lo que está en
 * validación. Publicar una de las segundas es borrarla de aquí, a la vista.
 */
const NO_SE_SIRVE: ReadonlyArray<string | RegExp> = [
  // Retirado.
  /3960-?100/,
  /2563-?141/,
  /472583/,
  /273-?8255/,
  "CETAD",
  "Teléfono de la Amistad",
  "4-SALUD",
  "Salud Mental",
  // En validación.
  /\b171\b/,
  /800 ?911 ?2000/,
  /\b123\b/,
  "mx-911",
  "Línea de la Vida",
];

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

describe("el catálogo de ayuda es exactamente éste", () => {
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

  it.each(CASOS)("?country=%j no sirve nada sin publicar", async (pais) => {
    const res = await request(h.app.getHttpServer())
      .get("/api/terapia/crisis")
      .query(pais === undefined ? {} : { country: pais });
    const cuerpo = JSON.stringify(res.body);
    for (const huella of NO_SE_SIRVE) {
      if (typeof huella === "string") expect(cuerpo).not.toContain(huella);
      else expect(cuerpo).not.toMatch(huella);
    }
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
