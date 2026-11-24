import {
  UNMATCHED_API_PATH,
  UNMATCHED_PATH,
} from "../shared/filters/safe-request-path";

/**
 * Las plantillas de ruta que el enrutador tiene registradas de verdad.
 *
 * `safeRequestPath` ya entrega la plantilla y no la URL. Esto es la
 * comprobación de que lo que llega como «ruta» ES una plantilla: por su forma
 * no se distingue de una URL corta —`/api/x/alicia` encaja en cualquier patrón
 * razonable—, y la única lista fiable es la del propio enrutador.
 *
 * Hasta que se registra, ninguna ruta se acepta: el evento sale sin ella.
 */
const templates = new Set<string>([UNMATCHED_API_PATH, UNMATCHED_PATH]);

interface ExpressLayer {
  route?: { path?: unknown };
}

/** Lee las plantillas de la instancia de Express. Devuelve cuántas hay. */
export function registerRouteTemplates(express: unknown): number {
  const stack = (express as { _router?: { stack?: ExpressLayer[] } })._router
    ?.stack;
  for (const layer of stack ?? []) {
    const path = layer.route?.path;
    if (typeof path === "string" && path.startsWith("/")) templates.add(path);
  }
  return templates.size;
}

export function isRouteTemplate(path: string): boolean {
  return templates.has(path);
}
