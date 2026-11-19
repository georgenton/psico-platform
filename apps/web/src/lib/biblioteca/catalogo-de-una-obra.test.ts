import { describe, expect, it } from "vitest";

import { esCatalogoDeUnaObra } from "@psico/types";

/**
 * La regla vive en `@psico/types` porque la usan DOS pantallas —la Biblioteca
 * de web y la de móvil— y la sutileza que tiene (un uno que viene de un filtro
 * no es un catálogo de una obra) es la misma en las dos. La prueba vive aquí,
 * en el consumidor, que es donde corre: misma convención que `text-features`.
 */

const CATALOGO = { view: "catalogo", total: 1 } as const;

describe("esCatalogoDeUnaObra", () => {
  it("sí: catálogo entero, sin filtros, una obra", () => {
    expect(esCatalogoDeUnaObra(CATALOGO)).toBe(true);
  });

  describe("no, cuando el uno viene de un filtro y no del catálogo", () => {
    it("una búsqueda que deja un resultado", () => {
      // El caso que hace falsa la nota: el catálogo puede tener diez.
      expect(esCatalogoDeUnaObra({ ...CATALOGO, q: "familias" })).toBe(false);
    });

    it("un filtro de categoría", () => {
      expect(esCatalogoDeUnaObra({ ...CATALOGO, categoryId: "cat-1" })).toBe(
        false,
      );
    });

    it("un filtro de autoría", () => {
      expect(esCatalogoDeUnaObra({ ...CATALOGO, authorId: "aut-1" })).toBe(
        false,
      );
    });
  });

  describe("no, en las vistas que no son el catálogo entero", () => {
    it.each(["mis", "recos", "favoritos", "guardados"])("%s", (view) => {
      // «Tienes un libro empezado» no dice nada sobre cuántos hay publicados.
      expect(esCatalogoDeUnaObra({ view, total: 1 })).toBe(false);
    });
  });

  describe("no, cuando el catálogo no tiene exactamente una", () => {
    it.each([0, 2, 3, 10])("total %i", (total) => {
      expect(esCatalogoDeUnaObra({ ...CATALOGO, total })).toBe(false);
    });
  });

  it("una cadena vacía no es un filtro", () => {
    // `?q=` llega así desde un formulario enviado en blanco, y no filtra nada.
    expect(
      esCatalogoDeUnaObra({ ...CATALOGO, q: "", categoryId: "", authorId: "" }),
    ).toBe(true);
  });
});
