/**
 * Dónde corre el tour en móvil.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 *
 * Igual que en web: quien elige un libro al terminar el onboarding aterriza en
 * ese libro —y eso se conserva, porque es lo que pidió—, pero el tour se monta
 * en el layout de las pestañas, que envuelve TODAS. Así que el paso 1, que
 * dice «Tu Inicio», aparecía encima de la pantalla del libro.
 *
 * ── Por qué una lista de una sola ruta, y no «empieza por» ────────────────
 *
 * `expo-router` quita los segmentos de grupo del camino: `app/(tabs)/index.tsx`
 * es `/`, y `app/(tabs)/books/[slug].tsx` es `/books/…`. Comparar con `/` es
 * entonces exacto y no hace falta nada más.
 *
 * Y si una versión futura de `expo-router` empezara a exponer el grupo, esto
 * **falla hacia el lado seguro**: el tour no se mostraría todavía, seguiría
 * pendiente —nadie lo marca visto desde aquí— y aparecería en cuanto la
 * persona volviera a Inicio por una navegación que sí coincida. Un tour que
 * espera es un inconveniente; uno que se marca como visto sin que nadie lo vea
 * es una pérdida.
 */

/** La pestaña de la que habla el primer paso del tour. */
export const TOUR_ROUTE = "/";

export function tourFitsRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const normalizado =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.replace(/\/+$/, "")
      : pathname;
  return normalizado === TOUR_ROUTE;
}
