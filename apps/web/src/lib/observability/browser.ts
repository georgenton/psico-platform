import {
  BrowserClient,
  Scope,
  dedupeIntegration,
  defaultStackParser,
  linkedErrorsIntegration,
  makeFetchTransport,
  type BrowserOptions,
} from "@sentry/browser";
import {
  closedEnvironment,
  closedRelease,
  guardTransport,
  guardedOptions,
  isMinifiedFunction,
  safeEvent,
  type ObservabilityPolicy,
} from "@psico/types/observability";
import { isErrorLike } from "./console-probe";

/**
 * Errores del navegador hacia Sentry.
 *
 * Es el proceso donde hay texto descifrado en pantalla, en los campos y en el
 * almacenamiento. Por eso no se instala NADA que mire la página: ni migas, ni
 * grabación de sesión, ni capturas, ni instrumentación de `fetch` o del DOM.
 * Entra un objeto de error y sale su tipo y su pila.
 *
 * Este módulo es un fragmento aparte que sólo existe si la construcción tuvo
 * `NEXT_PUBLIC_SENTRY_DSN`.
 */

/** Cuántos errores manda una página antes de callarse. */
const MAX_PER_PAGE = 20;

/**
 * Las salas de Círculos, la puerta de invitación y la ayuda en crisis no cargan
 * nada de terceros: es lo que promete su CSP. Aquí se respeta por decisión, no
 * porque la CSP lo bloquee —que sólo lo hace si se entró por ahí y no navegando
 * desde otra—. En la ayuda, además, nadie tiene por qué enterarse de que alguien
 * la abrió.
 */
const SILENT_PATHS = ["/i", "/compartir", "/ayuda"];

function isSilent(pathname: string): boolean {
  return SILENT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Los ficheros de guion que esta página ha cargado de verdad.
 *
 * Un marco sólo conserva su fichero si está aquí. Así no hay forma de que la
 * dirección de la página —que en `/compartir/<id>` nombra una sala— salga como
 * «fichero» de un guion en línea.
 */
const loaded = new Set<string>();

function remember(url: string): void {
  try {
    const { origin, pathname } = new URL(url, window.location.origin);
    if (
      origin === window.location.origin &&
      pathname.startsWith("/_next/static/")
    ) {
      loaded.add(pathname);
    }
  } catch {
    // Una URL que no se puede leer no es un guion nuestro.
  }
}

function watchScripts(): void {
  try {
    // `buffered` entrega también los que se cargaron antes de empezar.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) remember(entry.name);
    }).observe({ type: "resource", buffered: true });
  } catch {
    // Sin la API, quedan los que están en el documento.
  }
}

function rememberDocument(): void {
  for (const s of Array.from(document.scripts)) if (s.src) remember(s.src);
}

export function browserPolicy(): ObservabilityPolicy {
  return {
    service: "feelverse-web-browser",
    environment: closedEnvironment(process.env.NEXT_PUBLIC_PSICO_ENV),
    release: closedRelease(process.env.NEXT_PUBLIC_RELEASE_SHA),
    platform: "javascript",
    file: (raw) => {
      try {
        const { origin, pathname } = new URL(raw, window.location.origin);
        if (origin !== window.location.origin) return null;
        if (!loaded.has(pathname)) rememberDocument();
        if (!loaded.has(pathname)) return null;
        return {
          name: pathname,
          inApp: !/\/(?:framework|main|polyfills|webpack)-/.test(pathname),
        };
      } catch {
        return null;
      }
    },
    fn: (name) => isMinifiedFunction(name),
    types: new Set(["GuidePresentationError", "GuideReaderCopyError"]),
  };
}

/** Arranca y devuelve por dónde se informa, o `null` si no hay destino. */
export function startBrowserObservability(): ((error: unknown) => void) | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;

  watchScripts();
  rememberDocument();
  const policy = browserPolicy();
  const client = new BrowserClient({
    ...(guardedOptions(policy) as Partial<BrowserOptions>),
    dsn,
    stackParser: defaultStackParser,
    transport: guardTransport(makeFetchTransport, policy),
    transportOptions: {
      // Ni cookies, ni la dirección de la página de la que se sale.
      fetchOptions: { credentials: "omit", referrerPolicy: "no-referrer" },
    },
    integrations: [linkedErrorsIntegration(), dedupeIntegration()],
    beforeSend: ((event: unknown, hint?: { originalException?: unknown }) => {
      const safe = safeEvent(event, policy, hint);
      // Si ningún marco es nuestro, es una extensión o un guion ajeno.
      const ours = safe?.exception?.values.some((v) =>
        v.stacktrace?.frames.some((f) => f.in_app),
      );
      return ours ? safe : null;
    }) as BrowserOptions["beforeSend"],
  });
  if (!client.getDsn()) return null;
  client.init();

  let left = MAX_PER_PAGE;
  return (error) => {
    if (left <= 0 || isSilent(window.location.pathname)) return;
    if (!isErrorLike(error) && !(error instanceof DOMException)) return;
    // Con `digest` es de Next: o un error que el servidor ya informó, o una
    // redirección, que además lleva dentro la dirección de destino.
    if (typeof (error as { digest?: unknown }).digest === "string") return;
    left--;
    client.captureException(
      error,
      { mechanism: { handled: false, type: "onerror" } } as never,
      new Scope(),
    );
  };
}
