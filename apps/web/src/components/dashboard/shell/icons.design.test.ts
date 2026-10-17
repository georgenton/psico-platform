import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Los iconos de la barra, contra el sistema de diseño aprobado.
 *
 * El set vive en `docs/design/assets/icons.jsx` y la aplicación lo reimplementa
 * como componentes de React. Reimplementar invita a la deriva: un icono se
 * retoca «un poco» en una pantalla y deja de ser el mismo del sistema. Eso ya
 * había pasado con dos —salir dibujaba otra puerta, y el diario tenía dos
 * renglones en vez de tres—, y no se vio hasta compararlos trazado a trazado.
 *
 * Esta prueba compara geometría, no apariencia: lee los dos archivos y exige
 * que, para cada icono presente en ambos, las formas coincidan exactamente.
 *
 * Lo que NO exige: que el producto tenga todos los del diseño, ni al revés. El
 * set del diseño cubre barras laterales; la aplicación necesita además mapa,
 * ánimos o flechas. Añadir uno nuevo no rompe nada; separarse de uno que sí
 * existe en el sistema, sí.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const DISENO = resolve(AQUI, "../../../../../../docs/design/assets/icons.jsx");
const PRODUCTO = resolve(AQUI, "icons.tsx");

/** Las formas de cada icono, por nombre y en orden de aparición. */
function formasPorIcono(fuente: string, patron: RegExp): Map<string, string> {
  const texto = readFileSync(fuente, "utf8");
  const nombres = [...texto.matchAll(patron)];
  const salida = new Map<string, string>();

  nombres.forEach((m, i) => {
    const inicio = m.index! + m[0].length;
    const fin = i + 1 < nombres.length ? nombres[i + 1].index! : texto.length;
    const cuerpo = texto.slice(inicio, fin);
    // Coordenadas y trazados: lo que define la forma. Fuera queda todo lo
    // demás —tamaño, clases, props—, que es decisión de cada uso.
    const formas = [
      ...cuerpo.matchAll(
        /\s(?:d|points|cx|cy|r|x1|y1|x2|y2|rx|opacity)="([^"]+)"/g,
      ),
    ].map((x) => x[1]);
    salida.set(m[1].toLowerCase(), formas.join(" "));
  });

  return salida;
}

/** Nombres distintos para el mismo icono. */
const EQUIVALENCIAS: Record<string, string> = {
  reflections: "diary",
  patterns: "patrones",
};

describe("los iconos de la barra siguen el sistema de diseño", () => {
  const diseno = formasPorIcono(DISENO, /function Icon([A-Za-z]+)\s*\(/g);
  const producto = formasPorIcono(
    PRODUCTO,
    /export function Icon([A-Za-z]+)\s*\(/g,
  );

  it("el archivo del diseño sigue ahí y tiene iconos", () => {
    // Si el espejo de `docs/design` desaparece, esta prueba pasaría vacía y
    // dejaría de proteger nada. Mejor que falle.
    expect(diseno.size).toBeGreaterThanOrEqual(15);
    expect(producto.size).toBeGreaterThanOrEqual(15);
  });

  const comunes = [...producto.keys()]
    .map((n) => [n, EQUIVALENCIAS[n] ?? n] as const)
    .filter(([, d]) => diseno.has(d));

  it("hay iconos que comparar", () => {
    expect(comunes.length).toBeGreaterThanOrEqual(5);
  });

  for (const [enProducto, enDiseno] of comunes) {
    it(`«${enProducto}» conserva la geometría del sistema`, () => {
      expect(producto.get(enProducto)).toBe(diseno.get(enDiseno));
    });
  }
});
