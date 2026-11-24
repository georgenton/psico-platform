// Módulo, para que estas declaraciones no sean de toda la aplicación, que no
// carga los tipos de Node.
export {};

declare const __dirname: string;
declare function require(id: "fs"): {
  readdirSync(
    dir: string,
    opciones: { withFileTypes: true },
  ): { name: string; isDirectory(): boolean }[];
  readFileSync(ruta: string, codificacion: "utf8"): string;
};
const { readdirSync, readFileSync } = require("fs");

/**
 * La longitud de la clave maestra la dice `MASTER_KEY_LEN`, no un número.
 *
 * Aquí hubo un 32 —la longitud de la v1— que dejó de cumplirse el día que el
 * esquema pasó a 16, y ninguna prueba lo vio: las que había sustituían la
 * criptografía. Las de al lado ya la usan de verdad; ésta es para que tampoco
 * vuelva escrito como 16, que hoy pasaría y el próximo cambio no.
 */

const RAIZ = `${__dirname}/../..`;
const A_MANO =
  /\.(?:byteLength|length)\s*[!=]==?\s*(?:16|32)\b|\b(?:16|32)\s*[!=]==?\s*[\w.]+\.(?:byteLength|length)\b/;

function fuentes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return fuentes(ruta);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
      ? [ruta]
      : [];
  });
}

describe("nadie compara una longitud con 16 o 32 escritos a mano", () => {
  const ficheros = ["app", "src"].flatMap((d) => fuentes(`${RAIZ}/${d}`));

  it("recorre la aplicación entera", () => {
    expect(ficheros.length).toBeGreaterThan(80);
    expect(ficheros.some((f) => f.endsWith("diary-key-context.tsx"))).toBe(
      true,
    );
  });

  it("no hay ninguna", () => {
    const culpables = ficheros.filter((f) =>
      A_MANO.test(readFileSync(f, "utf8")),
    );
    expect(culpables.map((f) => f.slice(RAIZ.length))).toEqual([]);
  });

  it.each([
    "if (nextMaster.length !== 32) {",
    "if (clave.length === 16) return;",
    "if (32 !== nextMaster.byteLength) {",
    "clave.length != 16",
  ])("y las reconocería: %s", (linea) => {
    expect(linea).toMatch(A_MANO);
  });

  it.each([
    "if (nextMaster.length !== MASTER_KEY_LEN) {",
    "style={{ width: 32, height: 16 }}",
    "if (lista.length === 160) return;",
    "new Uint8Array(32)",
  ])("sin confundirlas con otra cosa: %s", (linea) => {
    expect(linea).not.toMatch(A_MANO);
  });
});
