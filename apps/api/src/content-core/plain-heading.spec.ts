import { describe, expect, it } from "vitest";

// @ts-expect-error — `.mjs` sin tipos: es un guion de ingesta, no un paquete.
import { plainHeading } from "../../scripts/plain-heading.mjs";

/**
 * Un encabezado citado dentro de una frase generada no lleva marcadores.
 *
 * ── El defecto ────────────────────────────────────────────────────────────
 *
 * El guion de ingesta interpola un encabezado del manuscrito en dos frases que
 * LEE una persona: la tarjeta de actividad y el pie de la cápsula de video. Un
 * encabezado es Markdown de origen, así que lleva `**` con todo derecho — y
 * copiarlo tal cual imprime los asteriscos en pantalla. Así acabó visible en el
 * capítulo 5 de *Emociones en Construcción*:
 *
 *     «**El ejercicio no se aprueba sintiéndote mejor.**»
 *
 * ── Por qué AQUÍ se tiran los marcadores ──────────────────────────────────
 *
 * En todo el resto del flujo el énfasis se CONSERVA: la reparación del
 * 2026-10-26 lo sacó del texto y lo puso en `meta.inlineMarks`, porque el
 * contrato es que el contenido es exactamente lo que se lee. Este caso es la
 * excepción y conviene decir por qué: el texto no es prosa del manuscrito, es
 * una frase que escribe el propio flujo citando un encabezado. Las comillas
 * angulares ya marcan el énfasis, y `EXERCISE` no tiene dónde guardar marcas
 * —que es exactamente la razón por la que esa reparación tuvo que EXCLUIR este
 * bloque en vez de arreglarlo.
 */

describe("plainHeading", () => {
  it("quita la negrita que dejó los cuatro asteriscos en el capítulo 5", () => {
    expect(
      plainHeading("**El ejercicio no se aprueba sintiéndote mejor.**"),
    ).toBe("El ejercicio no se aprueba sintiéndote mejor.");
  });

  it("quita la cursiva sin comerse una negrita vecina", () => {
    expect(plainHeading("*en cursiva*")).toBe("en cursiva");
    expect(plainHeading("**mezcla** y *otra*")).toBe("mezcla y otra");
  });

  it("quita el código en línea, que ninguna marca del repositorio representa", () => {
    // El otro bloque excluido por la reparación lo era por un acento invertido.
    expect(plainHeading("antes de `TEXT_LOCKED`")).toBe("antes de TEXT_LOCKED");
  });

  it("quita el subrayado doble", () => {
    expect(plainHeading("__doble__")).toBe("doble");
  });

  it("deja intacto un encabezado sin marcadores", () => {
    expect(plainHeading("Una escena, muchas preguntas")).toBe(
      "Una escena, muchas preguntas",
    );
  });

  it("no se rompe con un asterisco suelto ni con nada", () => {
    // Un marcador sin cerrar no es énfasis; quitarlo cambiaría el texto por
    // adivinar una intención.
    expect(plainHeading("3 * 4 son doce")).toBe("3 * 4 son doce");
    expect(plainHeading("")).toBe("");
    expect(plainHeading(null)).toBe("");
  });

  it("recorta los espacios de los extremos", () => {
    expect(plainHeading("  **x**  ")).toBe("x");
  });
});
