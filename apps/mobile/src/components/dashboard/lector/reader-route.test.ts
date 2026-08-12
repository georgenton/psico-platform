import { readerRefKindFromSegment, readerRoutePath } from "./reader-route";

/**
 * Mobile reader navigation is built from identity, never from position.
 *
 * These are the semantics a reorder would break, pinned without implementing
 * reorder: the same chapter keeps the same route however the book is
 * rearranged around it.
 */
describe("readerRoutePath", () => {
  it("addresses a native chapter by unit id", () => {
    expect(readerRoutePath("libro", { kind: "unit", id: "u-b" })).toBe(
      "/books/libro/lector/u/u-b",
    );
  });

  it("addresses a legacy chapter by chapter id", () => {
    expect(readerRoutePath("libro", { kind: "chapter", id: "ch-c" })).toBe(
      "/books/libro/lector/c/ch-c",
    );
  });

  it("a native chapter moved from position 2 to 5 keeps its route", () => {
    // The ref is what Home and Book Detail carry; neither is rebuilt from the
    // order, so moving the chapter cannot change where these links go.
    const before = readerRoutePath("libro", { kind: "unit", id: "u-b" });
    const after = readerRoutePath("libro", { kind: "unit", id: "u-b" });
    expect(after).toBe(before);
    expect(before).not.toMatch(/\/lector\/\d+$/);
  });

  it("a legacy chapter moved from position 3 to 1 keeps its route", () => {
    const before = readerRoutePath("libro", { kind: "chapter", id: "ch-c" });
    const after = readerRoutePath("libro", { kind: "chapter", id: "ch-c" });
    expect(after).toBe(before);
    expect(before).not.toMatch(/\/lector\/\d+$/);
  });

  it("escapes a slug that would otherwise break the path", () => {
    expect(readerRoutePath("a/b", { kind: "unit", id: "x/y" })).toBe(
      "/books/a%2Fb/lector/u/x%2Fy",
    );
  });
});

describe("readerRefKindFromSegment", () => {
  it("maps the two discriminators", () => {
    expect(readerRefKindFromSegment("u")).toBe("unit");
    expect(readerRefKindFromSegment("c")).toBe("chapter");
  });

  it("refuses anything else rather than guessing a chapter", () => {
    // A number here is an old positional link that reached the wrong route.
    // Opening "some chapter" would be worse than not opening one.
    for (const bad of ["3", "unit", "", undefined, "x"]) {
      expect(readerRefKindFromSegment(bad)).toBeNull();
    }
  });
});
