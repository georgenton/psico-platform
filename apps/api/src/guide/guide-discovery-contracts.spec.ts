import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_LEGACY_GUIDE_PINS,
  productionGuideDiscoveryCatalog,
} from "./guide-discovery-catalog";

/**
 * Two discovery contracts, and the rule about who may use which.
 *
 * `getExactContext` answers the MATERIALIZED V1 binary. `listContext` and
 * `offersPin` answer everything written since. They look interchangeable —
 * same catalog, same shape of answer — and that is exactly the trap: keeping
 * the signature while changing the meaning is how five of seven mixed-fleet
 * tests started failing, with the old binary reserving and publishing MG01
 * under the pilot's lineage.
 *
 * A comment cannot stop the next person from reaching for the shorter method.
 * This can.
 */

const SRC = join(process.cwd(), "src");

/** Files that may legitimately mention the compatibility adapter. */
const COMPAT_CALLERS = [
  // The CMS fallback for "the chapter's own pin". It answered with the pilot
  // before the route existed and still does; an editor who wants a microguide
  // picks it from the selectable list, which offers all of them.
  "experience/experience-admin.service.ts",
  // The catalog itself.
  "guide/guide-discovery-catalog.ts",
];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (
        e.name.endsWith(".ts") &&
        !/\.(spec|pg-spec|e2e-spec)\.ts$/.test(e.name)
      ) {
        out.push(p);
      }
    }
  };
  walk(SRC);
  return out;
}

describe("guarda · quién puede usar el adaptador V1", () => {
  it("nobody new calls getExactContext", () => {
    const offenders = sourceFiles()
      // A CALL, not a mention: the discovery service names the method in a
      // comment explaining why it does not use it, and that comment is the
      // opposite of the mistake this guards against.
      .filter((f) => /\.getExactContext\(/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1))
      .filter((rel) => !COMPAT_CALLERS.includes(rel));
    // Adding a file here is the decision. Adding a call and not noticing is
    // what this refuses.
    expect(offenders).toEqual([]);
  });

  it("the reader's discovery service reads the route, not the legacy pin", () => {
    const src = readFileSync(
      join(SRC, "guide/guide-discovery.service.ts"),
      "utf8",
    );
    expect(src).toContain("listContext(");
    expect(src).not.toMatch(/\.getExactContext\(/);
  });
});

describe("contrato · la ruta V2 y el pin legado no se mezclan", () => {
  const EEC = ["emociones-en-construccion", 1] as const;
  const PILOT = "eec-c1-cuerpo-antes-que-mente";

  it("listContext gives exactly the five microguides, in order", () => {
    expect(
      productionGuideDiscoveryCatalog
        .listContext(...EEC)
        .map((i) => i.pin.guideKey),
    ).toEqual([
      "eec-c1-teorias-como-lentes",
      "eec-c1-rostro-como-pista",
      "eec-c1-alarma-antes-del-relato",
      "eec-c1-emocion-informa-no-manda",
      "eec-c1-construida-no-significa-falsa",
    ]);
  });

  it("the pilot is not a sixth card and cannot be started through the route", () => {
    const route = productionGuideDiscoveryCatalog.listContext(...EEC);
    expect(route).toHaveLength(5);
    expect(route.map((i) => i.pin.guideKey)).not.toContain(PILOT);
    expect(
      productionGuideDiscoveryCatalog.offersPin(...EEC, {
        guideKey: PILOT,
        guideVersion: 1,
      }),
    ).toBe(false);
  });

  it("the legacy adapter still answers with the pilot", () => {
    expect(productionGuideDiscoveryCatalog.getExactContext(...EEC)).toEqual({
      guideKey: PILOT,
      guideVersion: 1,
    });
  });

  it("every declared legacy pin is a definition this build ships", () => {
    // Enforced at construction too; asserted here so the list itself is read.
    for (const legacy of PRODUCTION_LEGACY_GUIDE_PINS) {
      expect(
        productionGuideDiscoveryCatalog.getExactContext(
          legacy.bookSlug,
          legacy.chapterOrder,
        ),
      ).toEqual(legacy.pin);
    }
  });

  it("an unknown context has neither a route nor a legacy pin", () => {
    expect(productionGuideDiscoveryCatalog.listContext("libro-x", 1)).toEqual(
      [],
    );
    expect(
      productionGuideDiscoveryCatalog.getExactContext("libro-x", 1),
    ).toBeNull();
  });
});
