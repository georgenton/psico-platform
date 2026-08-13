import { describe, expect, it } from "vitest";
import { anyUnitMoved } from "./published-structure-history";

/**
 * Whether a payload carrying only a position can still be trusted.
 *
 * The rule has to be conservative in one direction and precise in the other:
 * miss a real move and an old client silently completes the wrong chapter;
 * report a move that never happened and every legacy client on a book that was
 * only ever appended to stops working for no reason.
 */

const at = (unitId: string, order: number) => ({ unitId, order });

describe("anyUnitMoved", () => {
  it("a book with no published history has moved nothing", () => {
    expect(anyUnitMoved([])).toBe(false);
  });

  it("republishing the same structure is not a move", () => {
    // Two text-only publishes: same units, same positions, new versions.
    expect(anyUnitMoved([at("A", 1), at("B", 2), at("A", 1), at("B", 2)])).toBe(
      false,
    );
  });

  it("appending a chapter is not a move", () => {
    // r1: A1 B2 · r2: A1 B2 C3. No existing identity changed position, so
    // "position 1" has still only ever meant A.
    expect(
      anyUnitMoved([
        at("A", 1),
        at("B", 2),
        at("A", 1),
        at("B", 2),
        at("C", 3),
      ]),
    ).toBe(false);
  });

  it("a unit published at two different positions is a move", () => {
    expect(anyUnitMoved([at("A", 1), at("B", 2), at("B", 1), at("A", 2)])).toBe(
      true,
    );
  });

  it("moving back does NOT clear it", () => {
    // r1 A1 B2 · r2 B1 A2 · r3 A1 B2. The book reads as it originally did, but
    // the tab opened during r1 is still out there and its payload is still
    // ambiguous. The answer is monotonic on purpose.
    expect(
      anyUnitMoved([
        at("A", 1),
        at("B", 2),
        at("B", 1),
        at("A", 2),
        at("A", 1),
        at("B", 2),
      ]),
    ).toBe(true);
  });

  it("a later text-only publish does not clear it either", () => {
    expect(
      anyUnitMoved([
        at("A", 1),
        at("B", 2),
        at("B", 1),
        at("A", 2),
        at("B", 1),
        at("A", 2),
      ]),
    ).toBe(true);
  });

  it("a discard that leaves a gap is not a move", () => {
    // r1: A1 B2 C3 · r2: A1 C3 — B is gone, but nothing that remains moved.
    expect(
      anyUnitMoved([
        at("A", 1),
        at("B", 2),
        at("C", 3),
        at("A", 1),
        at("C", 3),
      ]),
    ).toBe(false);
  });
});
