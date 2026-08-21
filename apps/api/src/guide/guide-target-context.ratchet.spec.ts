import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * C.3R (#639) — ratchets on the ONE authority for what a pin targets.
 *
 * Two of these exist because the property they protect was broken once, in a
 * way a green suite did not notice.
 */

const SERVICE = join(
  process.cwd(),
  "src/guide/guide-target-context.service.ts",
);
const APPLICABILITY = join(
  process.cwd(),
  "src/guide/guide-reader-applicability.service.ts",
);

const code = (p: string): string =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe("ratchet · the pin registry is not a per-call argument", () => {
  it("resolveMany takes pins and a db, and nothing else", () => {
    // The bypass this forbids: `resolveMany(pins, db, registryOverride)` let
    // ANY caller hand the authority a catalog of its own. It was introduced to
    // make a cost test possible and is exactly the shape a production caller
    // must not have.
    const src = code(SERVICE);
    const sig = src.slice(
      src.indexOf("async resolveMany("),
      src.indexOf("): Promise<TargetContextResult[]>"),
    );
    expect(sig).toMatch(/pins: readonly GuidePin\[\]/);
    expect(sig).toMatch(/db\?: LearningCatalogDb/);
    // No third parameter of any name.
    expect(sig).not.toMatch(/registry/);
    expect(sig).not.toMatch(/catalog/);
    // And the lookup goes through the field the CONSTRUCTOR set.
    expect(src).toMatch(/this\.registry\.getExact\(/);
  });

  it("the registry is fixed at construction, with production as the default", () => {
    const src = code(SERVICE);
    expect(src).toMatch(/@Inject\(GUIDE_PIN_REGISTRY\)/);
    expect(src).toMatch(
      /this\.registry = registry \?\? productionGuideRegistry;/,
    );
    // Assigned in the BODY, not as a parameter default: a default on a
    // decorated parameter did not survive one of this repo's two compilers and
    // arrived as undefined, which silently made every pin unknown.
    expect(src).not.toMatch(
      /registry: GuidePinRegistry = productionGuideRegistry/,
    );
  });

  it("resolve() delegates — there is no second implementation", () => {
    const src = code(SERVICE);
    const resolve = src.slice(src.indexOf("async resolve("));
    const body = resolve.slice(0, resolve.indexOf("\n  }"));
    expect(body).toMatch(/this\.resolveDefinitions\(\[definition\], db\)/);
    // The rules live in the core, so the single-pin path must not walk steps.
    expect(body).not.toMatch(/for \(const step of/);
    expect(body).not.toMatch(/resolveStep\(/);
  });

  it("applicability owns no target rule and no catalog SQL", () => {
    const src = code(APPLICABILITY);
    // It may resolve the reader's own unit; it may not resolve targets.
    expect(src).toMatch(/this\.targetContext\.resolveMany\(/);
    for (const forbidden of [
      "conceptKey",
      "exerciseKey",
      "itemKey",
      "parseRecallCatalogContent",
      "unitKeyFromLegacyChapterId",
      "productionGuideRegistry",
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });
});
