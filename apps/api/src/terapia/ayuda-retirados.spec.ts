import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RECURSOS_RETIRADOS,
  type RecursoRetirado,
} from "../../../../packages/types/src/ayuda-retirados";

/**
 * Un recurso retirado no vuelve sin decisión.
 *
 * El registro de retirados trae cómo se reconoce cada uno, y esto recorre todo
 * el código que llega a alguien —API, prompts, semillas, web, móvil, paquetes,
 * contenido y el paquete ya construido— buscándolos. Uno de ellos era la
 * central de un ministerio de agricultura, puesta ahí para alguien en crisis.
 *
 * Fuera quedan las pruebas, que los usan como caso, y el propio registro, que
 * no va en ningún paquete. La documentación los nombra para explicarlos.
 */

const RAIZ = join(__dirname, "..", "..", "..", "..");
const REGISTRO = "packages/types/src/ayuda-retirados.ts";

const AMBITOS = [
  "apps/api/src",
  "apps/api/prisma",
  "apps/api/scripts",
  "apps/api/content",
  "apps/api/openapi.json",
  "apps/web/src",
  "apps/web/public",
  "apps/web/next.config.js",
  "apps/mobile/app",
  "apps/mobile/src",
  "packages/types/src",
  "packages/types/dist",
  "packages/api-client/src",
  "packages/ui/src",
];

const LEIBLE = /\.(tsx?|jsx?|[mc]js|json|sql|html|md|css)$/;
const ES_PRUEBA = /[.-](test|spec)\.[a-z]+$|\/(test|__tests__)\//;
const FUERA = new Set(["node_modules", ".next", ".turbo"]);

function ficheros(ruta: string, acc: string[] = []): string[] {
  if (statSync(ruta).isDirectory()) {
    for (const e of readdirSync(ruta)) {
      if (!FUERA.has(e)) ficheros(join(ruta, e), acc);
    }
  } else if (LEIBLE.test(ruta) && !ES_PRUEBA.test(ruta)) {
    acc.push(ruta);
  }
  return acc;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Sólo cifras: ese número con cualquier separador. Lo demás: ese texto. */
function patron(huella: string): RegExp {
  if (/^\d+$/.test(huella)) {
    return new RegExp(`${huella.split("").join("[ \\t().·–-]{0,3}")}(?!\\d)`);
  }
  const texto = sinTildes(huella).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\d])${texto}(?![\\p{L}\\d])`, "iu");
}

const PATRONES = RECURSOS_RETIRADOS.flatMap((r) =>
  r.huellas.map((huella) => ({ id: r.id, huella, re: patron(huella) })),
);

const huellasEn = (texto: string) => {
  const t = sinTildes(texto);
  return PATRONES.filter((p) => p.re.test(t)).map(
    (p) => `${p.id}: ${p.huella}`,
  );
};

const rutas = AMBITOS.flatMap((a) => ficheros(join(RAIZ, a)));

describe("un recurso retirado no vuelve", () => {
  it("no aparece en nada de lo que se sirve", () => {
    const hallados = rutas
      .filter((f) => !f.endsWith(REGISTRO))
      .flatMap((f) =>
        huellasEn(readFileSync(f, "utf8")).map(
          (h) => `${f.slice(RAIZ.length + 1)} → ${h}`,
        ),
      );
    expect(hallados).toEqual([]);
  });

  it("la búsqueda mira donde tiene que mirar", () => {
    const relativas = rutas.map((f) => f.slice(RAIZ.length + 1));
    expect(rutas.length).toBeGreaterThan(1000);
    for (const esperado of [
      "packages/types/src/crisis-catalog.ts",
      "packages/types/dist/index.js",
      "packages/types/dist/index.mjs",
      "apps/api/src/eco/crisis.ts",
      "apps/api/src/eco/persona.ts",
      "apps/api/src/ai/ai.service.ts",
      "apps/api/src/onboarding/constants.ts",
      "apps/web/src/components/ayuda/AyudaInmediata.tsx",
      "apps/web/src/components/dashboard/eco/CrisisModal.tsx",
      "apps/mobile/src/components/dashboard/eco/CrisisModal.tsx",
      "apps/mobile/app/(tabs)/terapia/crisis.tsx",
    ]) {
      expect(relativas).toContain(esperado);
    }
    // El registro se lee —es de donde salen las huellas— y se excluye por su
    // nombre, no por caer fuera del recorrido.
    expect(relativas).toContain(REGISTRO);
  });

  it("el registro no viaja a nadie: ni el índice lo exporta ni se construye", () => {
    const indice = readFileSync(
      join(RAIZ, "packages/types/src/index.ts"),
      "utf8",
    );
    expect(indice).not.toContain("ayuda-retirados");
    const paquete = readFileSync(
      join(RAIZ, "packages/types/package.json"),
      "utf8",
    );
    expect(paquete).not.toContain("ayuda-retirados");
  });
});

describe("y la búsqueda los reconoce escritos de otra manera", () => {
  it.each([
    ["+593-2-3960-100", "ec-cetad"],
    ["(02) 396-0100", "ec-cetad"],
    ["tel:+59323960100", "ec-cetad"],
    ["Centro de escucha telefonica", "ec-cetad"],
    ["el CETAD de Quito", "ec-cetad"],
    ["02 256 3141", "ec-telefono-amistad"],
    ["TELÉFONO DE LA AMISTAD", "ec-telefono-amistad"],
    ["1800-4-Salud", "ec-1800-4-salud"],
    ["1800 472 583", "ec-1800-4-salud"],
    ["Línea de crisis Ecuador", "ec-1800-4-salud"],
    ["1 (800) 273-8255", "intl-iasp-telefono"],
    ["SAS · 911 Salud Mental", "ec-sas-911"],
    ["911 salud mental", "ec-sas-911"],
  ])("%s", (texto, id) => {
    expect(huellasEn(texto).some((h) => h.startsWith(`${id}:`))).toBe(true);
  });

  it.each([
    // Lo publicado y lo que espera.
    "ECU 911 · Emergencias",
    "Línea 106 · Ministerio de Salud",
    "+52-55-5259-8121",
    "800 911 2000",
    "171 (opción 6)",
    "https://www.iasp.info/crisis-centres-helplines/",
    // Palabras que contienen una huella sin serlo.
    "una medicación recetada por su médico",
  ])("control: «%s» no es ninguno", (texto) => {
    expect(huellasEn(texto)).toEqual([]);
  });

  it.each(RECURSOS_RETIRADOS.map((r) => [r.id, r] as const))(
    "%s: se reconoce por lo que se publicaba, y dice por qué se retiró",
    (_id, r: RecursoRetirado) => {
      expect(r.estado).toBe("retirado");
      expect(r.motivo).not.toBe("");
      expect(r.comprobado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(huellasEn(r.nombre).length).toBeGreaterThan(0);
      if (r.telefono !== null) {
        expect(huellasEn(r.telefono).length).toBeGreaterThan(0);
      }
    },
  );
});
