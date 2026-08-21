import { describe, expect, it } from "vitest";

import { GuideTargetContextService } from "./guide-target-context.service";
import { GuideCatalogError, productionGuideRegistry } from "./guide-catalog";
import { GuideLifecycleError } from "./guide-errors";
import type { GuideDefinition } from "@psico/types";

/**
 * C.3R (#639) — the boundary between "that pin does not exist" and "the
 * catalog is broken".
 *
 * These are two different facts and only one of them may make a card inert. A
 * `catch { return null }` collapses them, and the collapse is invisible: a
 * registry that throws `TypeError` because it was constructed wrong would make
 * every pin unknown, and every card in every chapter would read as "not for
 * here" while the build quietly disagreed with itself.
 *
 * No database is needed to prove any of this: the boundary is crossed before a
 * query runs.
 */

const PIN = { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 };

/** A registry whose `getExact` does exactly one thing. */
const registryThat = (fn: () => GuideDefinition) => ({ getExact: fn });

/** No database: every case here fails before the first query. */
const noDb = {} as never;

function serviceWith(fn: () => GuideDefinition): GuideTargetContextService {
  return new GuideTargetContextService({} as never, registryThat(fn) as never);
}

describe("registry boundary · only not-found is inert", () => {
  it("an exact definition that does not exist is inert, and the batch survives", async () => {
    const svc = serviceWith(() => {
      throw new GuideCatalogError("GUIDE_CATALOG_UNKNOWN_DEFINITION");
    });
    const [r] = await svc.resolveMany([PIN], noDb);
    expect(r!.ok).toBe(false);
    if (!r!.ok) expect(r!.code).toBe("GUIDE_CATALOG_UNKNOWN_DEFINITION");
    // The pin it answers about is the pin it was asked about.
    expect(r!.pin).toEqual(PIN);
  });

  it("a TypeError from a broken registry PROPAGATES", async () => {
    const boom = new TypeError("registry is not a function");
    const svc = serviceWith(() => {
      throw boom;
    });
    await expect(svc.resolveMany([PIN], noDb)).rejects.toBe(boom);
  });

  it("another GuideCatalogError propagates with its class and code intact", async () => {
    const other = new GuideCatalogError("GUIDE_CATALOG_INVALID_DEFINITION");
    const svc = serviceWith(() => {
      throw other;
    });
    await expect(svc.resolveMany([PIN], noDb)).rejects.toBe(other);
    // Not silently downgraded to "unknown pin".
    await svc.resolveMany([PIN], noDb).catch((e: unknown) => {
      expect(e).toBeInstanceOf(GuideCatalogError);
      expect((e as GuideCatalogError).code).toBe(
        "GUIDE_CATALOG_INVALID_DEFINITION",
      );
      // The message IS the code — no received value leaks.
      expect((e as Error).message).toBe("GUIDE_CATALOG_INVALID_DEFINITION");
    });
  });

  it("a GuideLifecycleError propagates rather than becoming not-found", async () => {
    const lifecycle = new GuideLifecycleError("GUIDE_STORAGE_FAILURE");
    const svc = serviceWith(() => {
      throw lifecycle;
    });
    await expect(svc.resolveMany([PIN], noDb)).rejects.toBe(lifecycle);
  });

  it("a registry error yields NO partial batch", async () => {
    // Two pins, the second broken: the caller gets an error, never one answer
    // and one silence.
    let calls = 0;
    const svc = serviceWith(() => {
      calls += 1;
      if (calls === 1) {
        return productionGuideRegistry.getExact(PIN.guideKey, PIN.guideVersion);
      }
      throw new TypeError("second pin explodes");
    });
    await expect(
      svc.resolveMany([PIN, { guideKey: "other", guideVersion: 1 }], noDb),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("the production registry is installed when none is supplied", async () => {
    // The default lives in the CONSTRUCTOR BODY, not on a decorated parameter:
    // a decorated-parameter default did not survive one of this repo's two
    // compilers and arrived as `undefined`, which made every pin unknown. This
    // file runs under the unit config; `guide-reader-applicability.pg-spec.ts`
    // exercises the same construction under the locks config.
    const svc = new GuideTargetContextService({} as never);
    const installed = (svc as unknown as { registry: unknown }).registry;
    expect(installed).toBe(productionGuideRegistry);
  });

  it("a test registry is bound at construction, and there is no per-call door", async () => {
    const svc = serviceWith(() =>
      productionGuideRegistry.getExact(PIN.guideKey, PIN.guideVersion),
    );
    expect((svc as unknown as { registry: unknown }).registry).not.toBe(
      productionGuideRegistry,
    );
    // `resolveMany` accepts two arguments; a third is not part of the surface.
    expect(svc.resolveMany.length).toBeLessThanOrEqual(2);
  });
});
