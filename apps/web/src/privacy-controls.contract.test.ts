import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un interruptor de privacidad en pantalla tiene que mover algo.
 *
 * Perfil ofrecía tres —compartir el Diario con un terapeuta, analíticas
 * anónimas y correos de novedades— y los tres sólo guardaban un valor: ningún
 * código de la API, del worker ni de los clientes lo leía para decidir nada.
 * Prometían un efecto que no existía, así que se retiraron de la pantalla. Los
 * valores guardados y el contrato de la API siguen donde estaban.
 *
 * Esto impide que vuelva a pasar con ésos o con uno nuevo. Para cada campo que
 * la API deja escribir (`UpdatePrivacyDto`) se busca quién lo LEE, fuera de la
 * fontanería que lo guarda y lo devuelve. Si nadie lo lee, ninguna pantalla
 * puede nombrarlo.
 *
 * Lo que esto no sabe: si la lectura hace de verdad lo que dice el texto del
 * interruptor. Eso sigue siendo cosa de quien lo escribe. Y mira sólo los
 * ajustes de privacidad, no los de avisos ni las preferencias.
 */

const RAIZ = join(__dirname, "..", "..", "..");
const DTO = "apps/api/src/users/dto/update-privacy.dto.ts";

/**
 * Dónde puede vivir una lectura con efecto: la API y el worker —que salen del
 * mismo código—, y los clientes fuera de sus pantallas, porque el análisis
 * local ocurre en el dispositivo.
 */
const LECTORES = ["apps/api/src", "apps/web/src/lib", "apps/mobile/src/lib"];
/** Guardar y devolver un valor no es leerlo. `test/` son dobles de pruebas. */
const FONTANERIA = /^apps\/api\/src\/(users|test)\//;
const PANTALLAS = [
  "apps/web/src/app",
  "apps/web/src/components",
  "apps/mobile/app",
  "apps/mobile/src/components",
];

function fuentes(dir: string): string[] {
  return readdirSync(join(RAIZ, dir)).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(join(RAIZ, ruta)).isDirectory()) return fuentes(ruta);
    return /\.tsx?$/.test(nombre) && !/[.-](test|spec)\.tsx?$/.test(nombre)
      ? [ruta]
      : [];
  });
}

/** Sin comentarios: nombrar un campo en uno no es leerlo ni ofrecerlo. */
function codigo(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const nombra = (campo: string, rutas: string[]) =>
  rutas.filter((r) => new RegExp(`\\b${campo}\\b`).test(codigo(r)));

const campos = [...codigo(DTO).matchAll(/^\s*(\w+)\?:/gm)].map((m) => m[1]!);
const rutasLectores = LECTORES.flatMap(fuentes).filter(
  (r) => !FONTANERIA.test(r),
);
const rutasPantallas = PANTALLAS.flatMap(fuentes);

describe("los interruptores de privacidad", () => {
  it.each(campos)("%s: si está en una pantalla, alguien lo lee", (campo) => {
    const loLeen = nombra(campo, rutasLectores);
    const loOfrecen = nombra(campo, rutasPantallas);

    expect(loLeen.length > 0 ? [] : loOfrecen).toEqual([]);
  });

  it("el análisis local sí tiene efecto y sigue en Seguridad, en las dos apps", () => {
    // El control que de verdad gobierna algo no se puede perder por el camino.
    expect(nombra("localTextAnalysis", rutasLectores)).toEqual(
      expect.arrayContaining([
        "apps/api/src/emotional-map/emotional-map.service.ts",
        "apps/mobile/src/lib/text-analysis-consent.ts",
        "apps/web/src/lib/text-analysis-consent.ts",
      ]),
    );
    expect(nombra("localTextAnalysis", rutasPantallas)).toEqual(
      expect.arrayContaining([
        "apps/mobile/src/components/dashboard/security/LocalTextAnalysisCard.tsx",
        "apps/web/src/app/dashboard/security/page.tsx",
        "apps/web/src/components/dashboard/security/LocalTextAnalysisCard.tsx",
      ]),
    );
    for (const pantalla of [
      "apps/web/src/app/dashboard/security/page.tsx",
      "apps/mobile/app/(tabs)/security.tsx",
    ]) {
      expect(codigo(pantalla)).toContain("<LocalTextAnalysisCard");
    }
  });

  it("control: lee los campos del DTO y recorre lo que dice recorrer", () => {
    expect(campos).toEqual(
      expect.arrayContaining([
        "shareDiaryWithTherapist",
        "anonymizedAnalytics",
        "marketingEmail",
        "localTextAnalysis",
      ]),
    );
    expect(rutasLectores.length).toBeGreaterThan(200);
    expect(rutasPantallas.length).toBeGreaterThan(200);
    // Y sabe ver un campo donde lo hay: `weeklyReport` gobierna el digest.
    expect(nombra("weeklyReport", rutasLectores)).toContain(
      "apps/api/src/jobs/processors/weekly-digest.processor.ts",
    );
  });
});
