import {
  isMinifiedFunction,
  safeEnvelope,
  safeEvent,
  type ObservabilityPolicy,
} from "@psico/types/observability";
import { serverIdentity } from "./identity";

/**
 * Errores del middleware, que corre en Edge, hacia Sentry.
 *
 * Aquí no hay SDK. El middleware pasa por cada petición y en Edge todo va en un
 * solo fichero: el SDK lo llevaba de 73 a 177 KB para un módulo que sólo se
 * ejecuta cuando algo falla. Lo que hace falta es poco —leer una pila de V8,
 * escribir un sobre, hacer un POST— y lo que sale lo decide la misma lista
 * blanca que en los demás procesos.
 *
 * No recibe la petición: no hay forma de que algo de ella acabe en el informe.
 */

/** Los únicos ficheros que un marco de Edge puede nombrar. */
const EDGE_FILE =
  /(?:^|\/)(\.next\/server\/(?:src\/middleware|middleware|edge-runtime-webpack)\.js)$/;

export function edgePolicy(): ObservabilityPolicy {
  return {
    service: "feelverse-web-edge",
    ...serverIdentity(),
    platform: "javascript",
    file: (raw) => {
      const name = raw.match(EDGE_FILE)?.[1];
      return name ? { name, inApp: true } : null;
    },
    fn: (name) => isMinifiedFunction(name),
  };
}

/** `https://clave@host/prefijo/7` → la dirección de sobres, o `null`. */
export function envelopeUrl(dsn: string | undefined): string | null {
  try {
    const { protocol, host, username, pathname } = new URL(dsn?.trim() ?? "");
    const parts = pathname.split("/").filter(Boolean);
    const project = parts.pop();
    if (
      !/^https?:$/.test(protocol) ||
      !username ||
      !/^\d+$/.test(project ?? "")
    )
      return null;
    const prefix = parts.length > 0 ? `/${parts.join("/")}` : "";
    return `${protocol}//${host}${prefix}/api/${project}/envelope/?sentry_key=${username}&sentry_version=7`;
  } catch {
    return null;
  }
}

interface RawFrame {
  filename: string;
  function?: string;
  lineno: number;
  colno: number;
}

/** Los marcos de una pila de V8, del más antiguo al más reciente. */
function frames(stack: unknown): RawFrame[] {
  if (typeof stack !== "string") return [];
  const out: RawFrame[] = [];
  for (const line of stack.split("\n").slice(0, 60)) {
    if (line.length > 500) continue;
    const m = line.match(
      /^\s*at (?:async )?(?:([^()]+) \()?([^()\s]+):(\d+):(\d+)\)?\s*$/,
    );
    if (!m) continue;
    out.push({
      filename: m[2]!,
      ...(m[1] ? { function: m[1] } : {}),
      lineno: Number(m[3]),
      colno: Number(m[4]),
    });
  }
  return out.reverse();
}

/** El error y sus causas, de la más profunda al que se lanzó. */
function exceptions(error: unknown) {
  const values: object[] = [];
  let current: unknown = error;
  for (let i = 0; i < 5 && typeof current === "object" && current; i++) {
    const { name, message, stack, cause } = current as Error & {
      cause?: unknown;
    };
    values.unshift({
      type: name,
      value: message,
      stacktrace: { frames: frames(stack) },
      mechanism: { type: i === 0 ? "middleware" : "chained", handled: false },
    });
    current = cause;
  }
  return values.length > 0
    ? values
    : [{ type: "NonErrorRejection", mechanism: { type: "middleware" } }];
}

/** Hasta cuándo no mandar nada, si el receptor pidió calma. */
let pausedUntil = 0;

/** Manda el error. Nunca rechaza: quien llama va a relanzar el suyo. */
export async function reportEdgeError(error: unknown): Promise<void> {
  try {
    const url = envelopeUrl(process.env.SENTRY_DSN);
    if (!url || Date.now() < pausedUntil) return;

    const policy = edgePolicy();
    const event = safeEvent(
      {
        event_id: crypto.randomUUID().replace(/-/g, ""),
        timestamp: Date.now() / 1000,
        exception: { values: exceptions(error) },
      },
      policy,
      { originalException: error },
    );
    const envelope = safeEnvelope([{}, [[{ type: "event" }, event]]], policy);
    if (!envelope) return;

    const [headers, [[itemHeaders, payload]]] = envelope;
    const response = await fetch(url, {
      method: "POST",
      body: [headers, itemHeaders, payload]
        .map((part) => JSON.stringify(part))
        .join("\n"),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after")) || 60;
      pausedUntil = Date.now() + Math.min(seconds, 3600) * 1000;
    }
  } catch {
    // Perder un informe es mejor que cambiar el error que ve la persona.
  }
}
