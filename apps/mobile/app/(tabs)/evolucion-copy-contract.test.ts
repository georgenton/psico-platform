/**
 * Mi Evolución dice qué pasó, no qué hizo de ti — también en nativo.
 *
 * La web cerró este contrato primero; esta prueba lo fija en la pantalla nativa
 * para que las dos superficies no vuelvan a divergir. «transformación» y «cómo
 * fuiste cambiando» afirman un cambio interior que esta pantalla no puede
 * sostener: cuenta capítulos, prácticas e intentos de recuerdo.
 *
 * Se lee el fuente en vez de montar la pantalla porque es un screen de
 * expo-router con hooks de sesión y navegación; el copy se puede fijar hoy sin
 * esperar a ese arnés.
 *
 * `@types/node` no está instalado en este workspace (las demás pruebas montan
 * componentes y no tocan el sistema de archivos), así que se declara aquí lo
 * mínimo que Jest ya provee en tiempo de ejecución, en lugar de sumar una
 * dependencia por una sola prueba.
 */
// `export {}` mantiene el archivo como módulo: sin él, estas declaraciones
// serían globales y le cambiarían el tipo de `require` al resto del workspace.
export {};

declare const __dirname: string;
declare function require(id: "fs"): {
  readFileSync(path: string, encoding: "utf8"): string;
};

const raw = require("fs").readFileSync(`${__dirname}/evolucion.tsx`, "utf8");

// El JSX parte los párrafos en varias líneas, así que se compara sobre el
// texto con espacios colapsados.
const flat = raw.replace(/\s+/g, " ");

describe("Mi Evolución nativa · contrato de copy", () => {
  it("titula la pantalla «Tu recorrido, registrado»", () => {
    expect(flat).toContain("Tu recorrido, registrado");
  });

  it("titula la línea de tiempo «Hitos de tu recorrido»", () => {
    expect(flat).toContain("Hitos de tu recorrido");
  });

  it("describe el registro sin prometer un cambio interior", () => {
    expect(flat).toContain(
      "Aquí puedes ver lo que has leído, practicado y completado.",
    );
    expect(flat).toContain(
      "El Mapa Emocional se alimenta solo de señales que tú decides registrar.",
    );
  });

  it("no afirma transformación en ninguna parte de la pantalla", () => {
    expect(flat).not.toMatch(/transformaci/i);
    expect(flat).not.toMatch(/cómo fuiste cambiando/i);
  });
});
