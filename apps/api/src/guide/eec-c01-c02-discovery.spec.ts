import { afterEach, describe, expect, it } from "vitest";
import { productionGuideRegistry } from "./guide-catalog";
import { productionGuideDiscoveryCatalog } from "./guide-discovery-catalog";
import { EEC_C02_DISCOVERY_ENTRIES } from "./eec-c02-discovery";

/**
 * The first two chapters' guided routes, as the reader is OFFERED them.
 *
 * Both had all five Experiences PUBLISHED and neither was reachable, for two
 * different reasons: C01's route sits behind a kill switch that was off, and
 * C02 simply had no entries. The distinction matters, so it is tested rather
 * than collapsed — the switch stays a switch, and C02 gets a route.
 */

const BOOK = "emociones-en-construccion";
const PILOT = { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 };

/** The flag is read from the environment on every call, so this is enough. */
function withC01Gate<T>(on: boolean, run: () => T): T {
  const before = process.env.EEC_C01_GUIDED_SUITE_V1;
  process.env.EEC_C01_GUIDED_SUITE_V1 = on ? "on" : "off";
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.EEC_C01_GUIDED_SUITE_V1;
    else process.env.EEC_C01_GUIDED_SUITE_V1 = before;
  }
}

afterEach(() => {
  delete process.env.EEC_C01_GUIDED_SUITE_V1;
});

describe("EEC-C01 · the route behind its kill switch", () => {
  it("offers nothing while the switch is off", () => {
    // The switch is not decoration. Turning C01 on is an operational act, and
    // this half of the pair is what keeps the rollback real.
    withC01Gate(false, () => {
      expect(productionGuideDiscoveryCatalog.listContext(BOOK, 1)).toEqual([]);
    });
  });

  it("offers exactly its five, in order, once the switch is on", () => {
    withC01Gate(true, () => {
      const list = productionGuideDiscoveryCatalog.listContext(BOOK, 1);
      expect(list).toHaveLength(5);
      expect(list.map((i) => i.order)).toEqual([1, 2, 3, 4, 5]);
      for (const item of list) {
        expect(() =>
          productionGuideRegistry.getExact(
            item.pin.guideKey,
            item.pin.guideVersion,
          ),
        ).not.toThrow();
      }
    });
  });

  it("never offers the historical pilot, switch on or off", () => {
    // Its sessions still resolve by exact pin; what must not happen is a NEW
    // reader being handed a guide whose anchor no longer resolves.
    for (const on of [false, true]) {
      withC01Gate(on, () => {
        expect(
          productionGuideDiscoveryCatalog.offersPin(BOOK, 1, PILOT),
          `gate=${on}`,
        ).toBe(false);
      });
    }
  });

  it("still answers the V1 adapter with the pilot, unchanged", () => {
    // `getExactContext` is the previous binary's contract and is deliberately
    // NOT gated: a rollback must keep working.
    for (const on of [false, true]) {
      withC01Gate(on, () => {
        expect(
          productionGuideDiscoveryCatalog.getExactContext(BOOK, 1),
        ).toEqual(PILOT);
      });
    }
  });
});

describe("EEC-C02 · the route it never had", () => {
  it("offers five readings, numbered 1..5", () => {
    const list = productionGuideDiscoveryCatalog.listContext(BOOK, 2);
    expect(list).toHaveLength(5);
    expect(list.map((i) => i.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it("offers the five approved pins, in the approved order", () => {
    const list = productionGuideDiscoveryCatalog.listContext(BOOK, 2);
    expect(list.map((i) => i.pin.guideKey)).toEqual([
      "eec-c2-universal-no-significa-uniforme",
      "eec-c2-cultura-gramatica-no-destino",
      "eec-c2-gesto-necesita-contexto",
      "eec-c2-palabras-dan-contorno",
      "eec-c2-rituales-dan-marco-no-guion",
    ]);
    expect(list.map((i) => i.title)).toEqual([
      "Lo universal no significa uniforme",
      "La cultura es gramática, no destino",
      "Un gesto necesita contexto",
      "Las palabras dan contorno",
      "Los rituales dan marco, no guion",
    ]);
  });

  it("offers only pins this build can actually start", () => {
    for (const item of productionGuideDiscoveryCatalog.listContext(BOOK, 2)) {
      expect(() =>
        productionGuideRegistry.getExact(
          item.pin.guideKey,
          item.pin.guideVersion,
        ),
      ).not.toThrow();
      expect(productionGuideDiscoveryCatalog.offersPin(BOOK, 2, item.pin)).toBe(
        true,
      );
    }
  });

  it("carries the approved copy, not a placeholder", () => {
    for (const entry of EEC_C02_DISCOVERY_ENTRIES) {
      expect(entry.bookSlug).toBe(BOOK);
      expect(entry.chapterOrder).toBe(2);
      expect(entry.description.length).toBeGreaterThan(60);
      expect(entry.estimatedMinutes).toMatch(/^\d+–\d+$/);
    }
    expect(EEC_C02_DISCOVERY_ENTRIES).toHaveLength(5);
  });

  it("teaches the V1 adapter nothing", () => {
    // The previous binary never knew a C02 route. Answering it with a pin
    // would invent a compatibility claim rather than honour one.
    expect(productionGuideDiscoveryCatalog.getExactContext(BOOK, 2)).toBeNull();
  });
});

describe("EEC · the whole book on offer", () => {
  it("offers fifty guided readings across ten chapters", () => {
    withC01Gate(true, () => {
      const counts = Array.from(
        { length: 10 },
        (_, i) =>
          productionGuideDiscoveryCatalog.listContext(BOOK, i + 1).length,
      );
      expect(counts).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(50);
    });
  });

  it("never offers one reading from two chapters", () => {
    withC01Gate(true, () => {
      const seen = new Set<string>();
      for (let order = 1; order <= 10; order++) {
        for (const item of productionGuideDiscoveryCatalog.listContext(
          BOOK,
          order,
        )) {
          const key = `${item.pin.guideKey}@${item.pin.guideVersion}`;
          expect(seen.has(key), `${key} offered twice`).toBe(false);
          seen.add(key);
        }
      }
      expect(seen.size).toBe(50);
    });
  });

  it("leaves Parejas and unknown contexts exactly as they were", () => {
    const parejas = productionGuideDiscoveryCatalog.listContext(
      "parejas-que-perduran",
      2,
    );
    expect(parejas).toHaveLength(1);
    expect(parejas[0].pin.guideKey).toBe("pqp-c1-contacto-sostenido");
    expect(productionGuideDiscoveryCatalog.listContext(BOOK, 99)).toEqual([]);
    expect(
      productionGuideDiscoveryCatalog.listContext("no-such-book", 2),
    ).toEqual([]);
  });
});
