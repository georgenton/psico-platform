import { readFileSync, realpathSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, resolve } from "node:path";
import {
  closedEnvironment,
  closedRelease,
  nodeFrames,
  type ObservabilityPolicy,
} from "@psico/types";
import type {
  EcoDependency,
  EcoFailureCategory,
  EcoStage,
} from "../eco/eco-failure";
import { JobName, QueueName } from "../jobs/queue-names";
import { releaseSha } from "../shared/release-sha";
import { isRouteTemplate } from "./route-templates";

/**
 * Los conjuntos cerrados de la API y del worker.
 *
 * Todo lo que puede acompañar a un error además de su pila está aquí escrito.
 * Lo que falte no sale: se pierde una etiqueta, no se abre un hueco. Dos de
 * estas listas tienen trinquete (`policy.spec.ts`) para que no envejezcan en
 * silencio.
 */

/** Los dos procesos que salen de este código. */
export type NodeService = "feelverse-api" | "feelverse-worker";

/**
 * Códigos máquina de las respuestas 5xx, más los de una caída de proveedor.
 *
 * Sólo los 5xx llegan a Sentry —lo decide `HttpExceptionFilter`—, así que sólo
 * ellos hacen falta. No basta con aceptar «MAYÚSCULAS_CON_GUIONES»: un código
 * de invitación también puede tener esa forma.
 */
export const API_CODES: ReadonlySet<string> = new Set([
  "AI_PROVIDER_UNAVAILABLE",
  "CIRCLES_UNAVAILABLE",
  "CIRCLE_STORAGE_FAILURE",
  "CONTENT_CORE_INTEGRITY_ERROR",
  "DAILY_WEBHOOK_NOT_CONFIGURED",
  "DEEPGRAM_INVALID_RESPONSE",
  "EMOTIONAL_MAP_UNAVAILABLE",
  "ERROR",
  "GUIDE_STORAGE_FAILURE",
  "GUIDE_UNAVAILABLE",
  "INTERNAL_ERROR",
  "MARK_IDENTITY_INTEGRITY_ERROR",
  "MEDIA_PROVIDER_UNAVAILABLE",
  "PAYMENT_PROVIDER_ERROR",
  "PAYMENT_PROVIDER_UNAVAILABLE",
  "PROVIDER_NO_SESSION_LOOKUP",
  "PURCHASES_CLOSED",
  "RATE_LIMIT_UNAVAILABLE",
  "SCHEMA_NOT_READY",
  "SERVICE_UNAVAILABLE",
  "SWITCH_PLAN_NOT_AVAILABLE",
  "VIDEO_UPLOAD_UNAVAILABLE",
  "VOICE_PROVIDER_NOT_CONFIGURED",
  "WHISPER_INVALID_RESPONSE",
]);

/** Clases de error propias que puede lanzar un proceso servido. */
export const API_TYPES: ReadonlySet<string> = new Set([
  "ChapterIdentityError",
  "ChapterMediaCatalogError",
  "CircleCatalogError",
  "CircleStorageError",
  "CirclesCryptoError",
  "CirclesError",
  "CodeOwnedIdentityError",
  "ConceptIngestError",
  "EcoStageError",
  "ExerciseIngestError",
  "ExpectedUnavailableException",
  "ExperienceBindingError",
  "ExperienceCatalogError",
  "GuideCardStatesBodyError",
  "GuideCatalogError",
  "GuideCommandIdempotencyConflictError",
  "GuideCommandInvalidInputError",
  "GuideCommandStorageError",
  "GuideDiscoveryCatalogError",
  "GuideDiscoveryParamsError",
  "GuideLifecycleError",
  "GuideReaderContextStaleError",
  "GuideRecoveryQueryError",
  "GuideRolloutConfigError",
  "GuideSessionStorageError",
  "GuideStateError",
  "GuideStateQueryError",
  "GuideStepConflictError",
  "GuideStepInvalidInputError",
  "GuideStepStorageError",
  "LearningEventIdempotencyConflictError",
  "LearningEventInvalidInputError",
  "LearningEventStorageError",
  "ProviderCapabilityUnsupportedError",
]);

// `Record<…, true>` y no una lista: si Eco gana una etapa, esto deja de
// compilar en vez de empezar a perderla.
const ECO_STAGES: Record<EcoStage, true> = {
  quota: true,
  persistence: true,
  embeddings: true,
  retrieval: true,
  model: true,
  finalize: true,
  unknown: true,
};
const ECO_DEPENDENCIES: Record<EcoDependency, true> = {
  anthropic: true,
  voyage: true,
  database: true,
  internal: true,
};
const ECO_CATEGORIES: Record<EcoFailureCategory, true> = {
  upstream_auth: true,
  upstream_rate_limit: true,
  upstream_unavailable: true,
  upstream_rejected: true,
  internal: true,
  deliberate_refusal: true,
};
const QUEUES = new Set<string>(Object.values(QueueName));
const JOBS = new Set<string>(Object.values(JobName));

const has = (set: Record<string, true>) => (value: string) =>
  Object.prototype.hasOwnProperty.call(set, value);

/** Etiquetas propias. Cada una se contrasta con su conjunto. */
export const API_TAGS: NonNullable<ObservabilityPolicy["tags"]> = {
  // La ruta PLANTILLA, y sólo si el enrutador la tiene registrada.
  route: isRouteTemplate,
  surface: (value) => value === "eco.sendMessage",
  stage: has(ECO_STAGES),
  dependency: has(ECO_DEPENDENCIES),
  category: has(ECO_CATEGORIES),
  upstream_status: (value) => /^[1-5]\d\d$/.test(value),
  queue: (value) => QUEUES.has(value),
  job: (value) => JOBS.has(value),
};

/** `apps/api`, tanto desde `src/observability` como desde `dist/observability`. */
export const API_ROOT = resolve(__dirname, "..", "..");

/** La raíz del despliegue: donde están también los `node_modules`. */
function deploymentRoot(): string {
  for (let dir = API_ROOT; ; dir = dirname(dir)) {
    if (isFile(join(dir, "pnpm-workspace.yaml"))) return realpathSync(dir);
    if (dirname(dir) === dir) return realpathSync(API_ROOT);
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const BUILTINS = new Set(builtinModules);

export function nodePolicy(service: NodeService): ObservabilityPolicy {
  return {
    service,
    environment: closedEnvironment(process.env.PSICO_ENV),
    release: closedRelease(releaseSha()),
    platform: "node",
    tags: API_TAGS,
    types: API_TYPES,
    codes: API_CODES,
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
