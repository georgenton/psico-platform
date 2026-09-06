import { describe, expect, it } from "vitest";
import { productionGuideRegistry } from "./guide-catalog";
import { productionGuideDiscoveryCatalog } from "./guide-discovery-catalog";
import { EEC_C03_C10_DISCOVERY_ENTRIES } from "./eec-c03-c10-discovery";

/**
 * The forty guided readings of C03–C10, as the ROUTE offers them.
 *
 * Publishing an Experience and offering it are two different gates, and this
 * file is about the second. What it protects is the pairing: every pin the
 * route offers must be a definition this build actually ships, each context
 * must be a complete 1..5 route, and no pin may be offered from two chapters —
 * because "which chapter am I in" is what progress and resonance are keyed on.
 */

const BOOK = "emociones-en-construccion";
const ORDERS = [3, 4, 5, 6, 7, 8, 9, 10] as const;

describe("EEC-C03 → C10 · the guided routes on offer", () => {
  it("offers five readings in each of the eight chapters", () => {
    for (const order of ORDERS) {
      const list = productionGuideDiscoveryCatalog.listContext(BOOK, order);
      expect(list, `C${order}`).toHaveLength(5);
    }
    const total = ORDERS.reduce(
      (n, o) => n + productionGuideDiscoveryCatalog.listContext(BOOK, o).length,
      0,
    );
    expect(total).toBe(40);
  });

  it("numbers each route 1..5, contiguous and in order", () => {
    for (const order of ORDERS) {
      const list = productionGuideDiscoveryCatalog.listContext(BOOK, order);
      expect(
        list.map((i) => i.order),
        `C${order}`,
      ).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("offers only pins this build can actually start", () => {
    for (const order of ORDERS) {
      for (const item of productionGuideDiscoveryCatalog.listContext(
        BOOK,
        order,
      )) {
        // Throws if the definition is not registered — the failure this
        // pairing exists to prevent is a card that opens onto nothing.
        expect(() =>
          productionGuideRegistry.getExact(
            item.pin.guideKey,
            item.pin.guideVersion,
          ),
        ).not.toThrow();
        expect(
          productionGuideDiscoveryCatalog.offersPin(BOOK, order, item.pin),
        ).toBe(true);
      }
    }
  });

  it("never offers the same reading from two chapters", () => {
    const seen = new Map<string, number>();
    for (const order of ORDERS) {
      for (const item of productionGuideDiscoveryCatalog.listContext(
        BOOK,
        order,
      )) {
        const key = `${item.pin.guideKey}@${item.pin.guideVersion}`;
        expect(seen.has(key), `${key} already offered`).toBe(false);
        seen.set(key, order);
      }
    }
    expect(seen.size).toBe(40);
  });

  it("carries the manifests' own copy, not a placeholder", () => {
    for (const entry of EEC_C03_C10_DISCOVERY_ENTRIES) {
      expect(entry.bookSlug).toBe(BOOK);
      expect(entry.title.length).toBeGreaterThan(10);
      // The description is the microguide's opening paragraph; a one-liner
      // here would mean the generator fell back to something invented.
      expect(entry.description.length).toBeGreaterThan(60);
      expect(entry.estimatedMinutes).toMatch(/^\d+–\d+$/);
    }
    expect(EEC_C03_C10_DISCOVERY_ENTRIES).toHaveLength(40);
  });
});

describe("EEC-C03 → C10 · what the route must NOT disturb", () => {
  // C01's gate and C02's route are asserted in `eec-c01-c02-discovery.spec.ts`,
  // which owns both states of the kill switch. What matters HERE is only that
  // adding those two did not disturb C03–C10 — so this file no longer pins
  // their emptiness, which stopped being true when they were offered.

  it("Parejas keeps its single guided reading", () => {
    const list = productionGuideDiscoveryCatalog.listContext(
      "parejas-que-perduran",
      2,
    );
    expect(list).toHaveLength(1);
    expect(list[0].pin.guideKey).toBe("pqp-c1-contacto-sostenido");
  });

  it("the retired C01 pilot is not newly offered anywhere", () => {
    for (const order of [1, 2, ...ORDERS]) {
      expect(
        productionGuideDiscoveryCatalog.offersPin(BOOK, order, {
          guideKey: "eec-c1-cuerpo-antes-que-mente",
          guideVersion: 1,
        }),
        `C${order}`,
      ).toBe(false);
    }
  });

  it("the V1 adapter learns nothing about C03–C10", () => {
    // The previous binary never knew these chapters. Answering it with a pin
    // would be inventing a compatibility claim rather than honouring one.
    for (const order of ORDERS) {
      expect(
        productionGuideDiscoveryCatalog.getExactContext(BOOK, order),
        `C${order}`,
      ).toBeNull();
    }
    // …while the two contexts it does know keep their exact answers.
    expect(productionGuideDiscoveryCatalog.getExactContext(BOOK, 1)).toEqual({
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
    expect(
      productionGuideDiscoveryCatalog.getExactContext(
        "parejas-que-perduran",
        2,
      ),
    ).toEqual({ guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 });
  });

  it("an unknown context is empty, not a guess", () => {
    expect(productionGuideDiscoveryCatalog.listContext(BOOK, 99)).toEqual([]);
    expect(
      productionGuideDiscoveryCatalog.listContext("no-such-book", 3),
    ).toEqual([]);
  });
});
