import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The generated Prisma client must survive a cache hit.
 *
 * ── The defect this closes ────────────────────────────────────────────────
 *
 * On 2026-11-06 three API deployments in a row produced an image that would
 * not boot:
 *
 *     Error: Cannot find module '.prisma/client/default'
 *
 * The two images — built from the SAME commit — differed in exactly one thing.
 * Same `node_modules` (2 074 packages in `.pnpm`), same `prisma` CLI, same
 * `dist/main.js`; the working one had `.prisma/client` and the broken one did
 * not. So it was never a pruned devDependency, which is the usual suspect.
 *
 * The cause is here, in `turbo.json`. `apps/api`'s build script is
 * `prisma generate && nest build`, and the `build` task declares its outputs as
 * `dist/**`. But `prisma generate` writes to
 * `node_modules/.pnpm/@prisma+client@…/node_modules/.prisma` — OUTSIDE the
 * package, so Turbo cannot declare it as an output and does not track it.
 *
 * The consequence: on a cache hit Turbo restores `dist/**` and never re-runs
 * the script, so the generated client is simply absent. Railpack then builds
 * the runtime image with `copy /app/node_modules`, and the absence ships.
 *
 * Reproduced in 64 ms: warm the cache, delete the generated directory, build
 * again. Turbo answers `FULL TURBO`, 3 of 3 cached — and the directory stays
 * gone.
 *
 * ── A diagnostic trap worth knowing ──────────────────────────────────────
 *
 * **Turbo replays the cached task's log.** A build log containing
 * «✔ Generated Prisma Client» does NOT prove anything was generated: on a
 * cache hit those exact lines are printed again from the cache. What
 * distinguishes them is the timing — a real generation reports seconds, a
 * replay reports none — and, in BuildKit, the step saying `CACHED`.
 *
 * ── Why the fix is this one and not a refactor ────────────────────────────
 *
 * The obvious alternative is to give `generator client` an explicit `output`
 * inside the source tree, which would make the client an ordinary build
 * artefact. That is probably where this should end up, but it rewrites every
 * Prisma import in the project, and the reproduction does not require it: the
 * task simply must not be skippable. So `prisma:generate` becomes its own
 * task with `cache: false`, and `build` depends on it. Cost measured: a warm
 * build goes from `FULL TURBO` in 64 ms to 3-of-4 cached in 1.8 s.
 *
 * The script keeps its own `prisma generate` on purpose. The Turbo task
 * guarantees it under `turbo`; the script guarantees it for anyone who runs
 * `pnpm build` inside `apps/api` and bypasses Turbo entirely. Two independent
 * guarantees, for something whose absence produces an image that does not boot
 * — and whose cost is under two seconds.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");

interface TurboTask {
  cache?: boolean;
  dependsOn?: string[];
  outputs?: string[];
}

const turbo = JSON.parse(readFileSync(join(ROOT, "turbo.json"), "utf8")) as {
  tasks: Record<string, TurboTask>;
};

const apiPkg = JSON.parse(
  readFileSync(join(ROOT, "apps/api/package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("la generación del cliente de Prisma no se puede saltar", () => {
  it("prisma:generate existe como tarea propia", () => {
    expect(turbo.tasks["prisma:generate"]).toBeDefined();
  });

  it("y NO se cachea", () => {
    // Si se cacheara, volvería a ser salteable y el defecto regresaría entero:
    // una caché caliente restauraría `dist` y el cliente no existiría.
    expect(turbo.tasks["prisma:generate"]?.cache).toBe(false);
  });

  it("build depende de ella", () => {
    // Sin esto la tarea existe y nadie la invoca, que es lo mismo que no
    // existir — sólo más difícil de ver.
    expect(turbo.tasks.build?.dependsOn ?? []).toContain("prisma:generate");
  });

  it("apps/api conserva el script que la tarea invoca", () => {
    expect(apiPkg.scripts["prisma:generate"]).toContain("prisma generate");
  });

  it("y su build sigue generando por su cuenta, para quien no pase por turbo", () => {
    // La segunda garantía. Alguien que corra `pnpm build` dentro de apps/api no
    // pasa por turbo y no dispararía la tarea de arriba.
    expect(apiPkg.scripts.build).toContain("prisma generate");
  });

  it("los outputs de build siguen sin poder declarar el cliente generado", () => {
    // El porqué del arreglo, fijado como hecho y no como comentario: la ruta
    // de generación está FUERA del paquete, así que ningún `outputs` de este
    // `build` puede capturarla. Si algún día se declara un `output` dentro del
    // árbol de fuentes, esta prueba es el sitio donde decidirlo de nuevo.
    const outputs = turbo.tasks.build?.outputs ?? [];
    expect(outputs.some((o) => o.includes("node_modules"))).toBe(false);
    expect(outputs.some((o) => o.startsWith(".."))).toBe(false);
  });
});
