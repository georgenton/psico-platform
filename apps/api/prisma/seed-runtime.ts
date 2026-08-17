import { assertSeedAllowed, type SeedGuardEnv } from "./seed-guard";

/**
 * C.0A1 — the order in which a seed run is allowed to do anything.
 *
 * The guard existed before this module, but the Prisma client, its adapter and
 * the pg `Pool` were module-level constants: built at import time, before the
 * refusal could possibly run. Today `Pool` is lazy and opens no socket, so
 * nothing leaked — but "fail closed" that depends on a constructor staying
 * lazy is a promise about somebody else's implementation, not about ours.
 *
 * Client construction is now behind a factory this function calls, so the
 * ordering is a property of the code rather than of where a `const` happens to
 * sit. It is also testable behaviourally: a spy factory that is never invoked
 * is stronger evidence than a regex over the source.
 */

/** Whatever a run needs to clean up, however it was built. */
export interface SeedClientHandle {
  dispose: () => Promise<void>;
}

export interface RunGuardedSeedOptions<T extends SeedClientHandle> {
  env: SeedGuardEnv & { PRISMA_SKIP_SEED?: string };
  /** Builds the client. NOT called when the run is skipped or refused. */
  createClient: () => T;
  seed: (client: T) => Promise<void>;
  log?: (message: string) => void;
}

/**
 * Skip → refuse → build → seed → dispose.
 *
 * `PRISMA_SKIP_SEED` is checked first and deliberately needs no production
 * authorization: pg-specs chain the seed through `migrate deploy` and only
 * need the schema, so making them carry a production token would be absurd.
 *
 * `dispose` runs only if the client was actually created — there is nothing to
 * close on a refusal, and calling `dispose` on a handle that does not exist
 * would turn a clean refusal into a crash.
 */
export async function runGuardedSeed<T extends SeedClientHandle>(
  opts: RunGuardedSeedOptions<T>,
): Promise<void> {
  const log = opts.log ?? ((m: string) => console.log(m));

  if (opts.env.PRISMA_SKIP_SEED === "1") {
    log("↩︎ PRISMA_SKIP_SEED=1 — skipping seed (schema-only run).");
    return;
  }

  // Throws before anything is constructed.
  assertSeedAllowed(opts.env);

  const client = opts.createClient();
  try {
    await opts.seed(client);
  } finally {
    await client.dispose();
  }
}
