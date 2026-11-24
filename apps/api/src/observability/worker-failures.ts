import type { Job } from "bullmq";
import { captureException } from "./sentry";

/**
 * Los trabajos que fallaron, hacia Sentry.
 *
 * Un error dentro de un procesador no es una excepción que nadie atrapó: BullMQ
 * la atrapa, reintenta y, al final, deja el trabajo en la lista de fallidos. Sin
 * esto, el único proceso que no tiene pantalla sería también el único que falla
 * sin que nadie lo vea.
 *
 * Sólo se informa del intento DEFINITIVO: un reintento que sale bien no es nada
 * que mirar. Y sólo viajan el nombre de la cola y el del trabajo; `job.data`
 * lleva direcciones y contenidos, y no se toca.
 */

/** Lo que hace falta de un `Worker` de BullMQ. */
export interface FailableWorker {
  readonly name: string;
  on(
    event: "failed",
    listener: (job: Job | undefined, error: Error) => void,
  ): unknown;
}

export function reportWorkerFailures(worker: FailableWorker): void {
  worker.on("failed", (job, error) => {
    if (!isFinalAttempt(job, error)) return;
    captureException(error, { queue: worker.name, job: job?.name });
  });
}

export function isFinalAttempt(
  job: Pick<Job, "attemptsMade" | "opts"> | undefined,
  error: Error,
): boolean {
  // Sin trabajo —se perdió su bloqueo— no habrá otro intento del que enterarse.
  if (!job) return true;
  if (error.name === "UnrecoverableError") return true;
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}
