import { join } from "node:path";
import * as Sentry from "@sentry/node";
import { guardTransport, guardedOptions } from "@psico/types";
import { API_ROOT, nodePolicy, type NodeService } from "./policy";

/**
 * Errores de la API y del worker hacia Sentry. Inerte sin `SENTRY_DSN`.
 *
 * ── Por qué NO se usa `Sentry.init()` ──────────────────────────────────────
 *
 * `init()` instala el SDK entero: parchea `http` y `fetch` con OpenTelemetry,
 * guarda cabeceras y cuerpo de cada petición, adjunta líneas de código y
 * variables locales, abre sesiones y lee una docena de variables de entorno.
 * Dos de ellas cambian lo que sale sin que nadie toque el código:
 * `SENTRY_TRACES_SAMPLE_RATE` enciende las trazas y `SENTRY_SPOTLIGHT` manda una
 * copia de cada sobre por un camino que no es el transporte.
 *
 * Aquí se construye el cliente a mano, con tres integraciones y nada más:
 * encadenar causas, y las dos que ven una excepción que nadie atrapó. Sin
 * OpenTelemetry registrado no hay trazas que muestrear, ni cabeceras
 * `sentry-trace`/`baggage` en las peticiones salientes.
 *
 * Lo que sale, además, pasa dos veces por la lista blanca
 * (`@psico/types/observability-allowlist`): en `beforeSend` y en el transporte,
 * que es la puerta que cubre lo que `beforeSend` no ve.
 *
 * Qué sale y qué no, cómo se activa y qué falta: `README.md`, al lado.
 */

let initialised = false;
// `initialised` sólo dice que `initSentry` corrió. Sin DSN corre y no hace
// nada, y `captureException` tiene que saber distinguirlo.
let client: Sentry.NodeClient | null = null;

export function initSentry(service: NodeService): void {
  // Idempotente: los tests importan el módulo varias veces por proceso.
  if (initialised) return;
  initialised = true;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  try {
    const policy = nodePolicy(service);
    const candidate = new Sentry.NodeClient({
      ...(guardedOptions(policy) as Partial<Sentry.NodeOptions>),
      dsn,
      stackParser: Sentry.defaultStackParser,
      transport: guardTransport(Sentry.makeNodeTransport, policy),
      integrations: [
        Sentry.linkedErrorsIntegration(),
        // Como haría Node por su cuenta: si nadie más escucha, el proceso
        // termina con código 1. Si alguien más escucha, no se le quita la
        // decisión.
        Sentry.onUncaughtExceptionIntegration({
          exitEvenIfOtherHandlersAreRegistered: false,
        }),
        // `strict`, y es lo que hace falta: el modo por defecto de esta
        // integración AVISA y sigue, que es justo lo que Node no hace. Un
        // arranque fallido acabaría con código 0.
        Sentry.onUnhandledRejectionIntegration({ mode: "strict" }),
      ],
    });
    // Un DSN ilegible deja el cliente sin destino.
    if (!candidate.getDsn()) {
      console.warn(
        "[observabilidad] SENTRY_DSN no es un DSN: no se envía nada.",
      );
      return;
    }
    Sentry.getCurrentScope().setClient(candidate);
    candidate.init();
    client = candidate;
  } catch {
    // La observabilidad no puede impedir que el servicio arranque.
    console.warn("[observabilidad] No se pudo iniciar: no se envía nada.");
  }
}

/** Nombre de la etiqueta por cada campo del contexto que se acepta. */
const TAG_OF: Readonly<Record<string, string>> = {
  method: "method",
  path: "route",
  statusCode: "status",
  code: "code",
  surface: "surface",
  stage: "stage",
  dependency: "dependency",
  category: "category",
  upstreamStatus: "upstream_status",
  queue: "queue",
  job: "job",
};

/**
 * Manda un error. No hace nada sin DSN, y nunca lanza: quien llama está
 * gestionando ya un fallo.
 *
 * Del contexto sólo se usan los campos de `TAG_OF`, y cada uno se contrasta con
 * su conjunto cerrado antes de salir. Lo demás se ignora.
 */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!client) return;
  try {
    Sentry.withScope((scope) => {
      for (const [field, tag] of Object.entries(TAG_OF)) {
        const value = context?.[field];
        if (typeof value === "string" || typeof value === "number") {
          scope.setTag(tag, value);
        }
      }
      Sentry.captureException(relocate(err, context?.frames));
    });
  } catch {
    // Nada que hacer: perder un informe es mejor que romper la respuesta.
  }
}

/**
 * Eco no manda el error original sino uno sintético, y aparte los marcos ya
 * verificados de dónde ocurrió de verdad (`eco-failure.ts`). Sin esto, todos los
 * fallos de Eco señalarían al mismo `catch`.
 */
function relocate(err: unknown, frames: unknown): unknown {
  if (!(err instanceof Error) || !Array.isArray(frames)) return err;
  const lines = frames
    .filter((f): f is string => typeof f === "string" && !f.includes("\n"))
    .map((f) => `    at ${join(API_ROOT, f)}`);
  if (lines.length === 0) return err;
  const moved = new Error(err.message);
  moved.name = err.name;
  moved.stack = `${err.name}\n${lines.join("\n")}`;
  return moved;
}

/** Si el arranque ya pasó por aquí, con DSN o sin él. */
export function isSentryInitialised(): boolean {
  return initialised;
}

/** SÓLO PARA TESTS. */
export async function _resetSentryForTests(): Promise<void> {
  await client?.close(1000);
  initialised = false;
  client = null;
}
