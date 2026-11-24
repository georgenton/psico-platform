/**
 * La puntuación de una ficha, o nada.
 *
 * Nada cuando la API no da el dato y nada cuando no hay reseñas: un «⭐ 0.0 (0)»
 * se lee como una mala nota, y es que nadie ha opinado.
 */
export function ratingLabel(t: {
  avgRating: number | null;
  reviewsCount: number | null;
}): string | null {
  if (typeof t.avgRating !== "number") return null;
  if (typeof t.reviewsCount !== "number" || t.reviewsCount < 1) return null;
  return `${t.avgRating.toFixed(1)} (${t.reviewsCount})`;
}
