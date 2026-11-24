import { readFileSync, realpathSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import * as Sentry from "@sentry/node";
import {
  guardTransport,
  guardedOptions,
  nodeFrames,
  type ObservabilityPolicy,
} from "@psico/types/observability";
import { probeConsole } from "./console-probe";
import { serverIdentity } from "./identity";

/**
 * Errores del servidor de Web hacia Sentry.
 *
 * El cliente se construye a mano y con una sola integración, por las mismas
 * razones que en la API (`apps/api/src/observability/sentry.ts`): `Sentry.init`
 * instala OpenTelemetry, recoge la petición entera y lee variables de entorno
 * que encienden trazas. Nada de eso hace falta para informar de un error.
 *
 * Y no se instalan manejadores de excepciones sin atrapar. Next ya tiene los
 * suyos —que NO terminan el proceso— y los escribe con `console.error`, que es
 * donde escucha la sonda. Añadir los del SDK cambiaría qué hace el servidor ante
 * un fallo.
 *
 * Este módulo sólo se carga si hay DSN (`src/instrumentation.ts`).
 */

let started = false;

export function startServerObservability(): void {
  if (started) return;
  started = true;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  try {
    const policy = serverPolicy();
    const client = new Sentry.NodeClient({
      ...(guardedOptions(policy) as Partial<Sentry.NodeOptions>),
      dsn,
      stackParser: Sentry.defaultStackParser,
      transport: guardTransport(Sentry.makeNodeTransport, policy),
      integrations: [Sentry.linkedErrorsIntegration()],
    });
    if (!client.getDsn()) {
      console.warn(
        "[observabilidad] SENTRY_DSN no es un DSN: no se envía nada.",
      );
      return;
    }
    Sentry.getCurrentScope().setClient(client);
    client.init();
    probeConsole((error) => {
      Sentry.captureException(error, { mechanism: { handled: false } });
    });
  } catch {
    // La observabilidad no puede impedir que el servidor arranque.
    console.warn("[observabilidad] No se pudo iniciar: no se envía nada.");
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** La raíz del despliegue: donde están también los `node_modules`. */
function deploymentRoot(): string {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    if (isFile(join(dir, "pnpm-workspace.yaml"))) return realpathSync(dir);
    if (dirname(dir) === dir) return realpathSync(process.cwd());
  }
}

const BUILTINS = new Set(builtinModules);

export function serverPolicy(): ObservabilityPolicy {
  return {
    service: "feelverse-web-server",
    ...serverIdentity(),
    platform: "node",
    ...nodeFrames({
      root: deploymentRoot(),
      exists: isFile,
      read: (path) => {
        try {
          return readFileSync(path, "utf8");
        } catch {
          return null;
        }
      },
      isBuiltin: (name) => BUILTINS.has(name),
    }),
  };
}
