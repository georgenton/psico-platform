/**
 * ¿El catálogo COMPLETO disponible tiene una sola obra?
 *
 * ── Por qué no es `total === 1` ───────────────────────────────────────────
 *
 * «Este listado trae un resultado» y «el catálogo tiene una obra» son dos
 * cosas distintas, y la pantalla sólo puede decir la segunda. Quien busca
 * «familias» y recibe un resultado está viendo un filtro, no el catálogo; una
 * nota que dijera ahí «por ahora una obra publicada» sería sencillamente
 * falsa, y además aparecería y desaparecería al teclear.
 *
 * Así que la condición es triple: la vista del catálogo entero, sin ningún
 * filtro aplicado, y el total en uno. Sólo entonces `total` es el tamaño del
 * catálogo y no el de una consulta.
 *
 * ── Por qué la nota existe ────────────────────────────────────────────────
 *
 * Una pantalla con buscador, filtros, paginación y una rejilla de una sola
 * tarjeta se lee como algo que falló al cargar. Decir lo que pasa cuesta una
 * línea; la alternativa es que cada persona nueva se pregunte si la
 * biblioteca se rompió.
 *
 * La función vive fuera de la página porque la página es un Server Component
 * que hace `serverFetch` y lee cookies: no se monta en una prueba. La regla
 * sí, y tiene cuatro entradas que conviene enumerar.
 */

export interface EstadoDelListado {
  /** La pestaña activa: sólo «catalogo» muestra el catálogo entero. */
  view: string;
  /** Término de búsqueda, si lo hay. */
  q?: string;
  /** Filtro de categoría, si lo hay. */
  categoryId?: string;
  /** Filtro de autoría, si lo hay. */
  authorId?: string;
  /** Total que informa la paginación PARA ESTA consulta. */
  total: number;
}

export function esCatalogoDeUnaObra(estado: EstadoDelListado): boolean {
  if (estado.view !== "catalogo") return false;
  if (estado.q || estado.categoryId || estado.authorId) return false;
  return estado.total === 1;
}

/**
 * Lo que dice la nota. Compartido para que web y móvil no acaben con dos
 * frases parecidas: sin fecha y sin lista, porque prometer un calendario de
 * publicación es exactamente lo que no se puede hacer desde aquí.
 */
export const CATALOGO_UNA_OBRA_NOTA =
  "Por ahora una obra publicada. Estamos preparando las siguientes.";
