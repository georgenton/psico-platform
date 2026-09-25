import { describe, expect, it } from "vitest";
import { validateBootstrapInput } from "../content-core/bootstrap-book";
import {
  FIXTURE_AUTHOR_SLUG,
  FIXTURE_BOOKS,
  buildBootstrapInput,
} from "./visual-fixture-content";

/**
 * The fixture builds its manifests in code rather than reading a file, so the
 * usual "the JSON is malformed" failure would only surface against a live
 * database. Running the REAL validator over the same input here catches it in
 * CI instead — and, because the validator is the one the bootstrap calls, a
 * change to its rules breaks this suite rather than the QA environment.
 */
describe("fixture book material", () => {
  it("is accepted by the real bootstrap validator", () => {
    for (const spec of FIXTURE_BOOKS) {
      expect(() =>
        validateBootstrapInput(buildBootstrapInput(spec)),
      ).not.toThrow();
    }
  });

  it("gives every book at least two chapters, so navigation has somewhere to go", () => {
    for (const spec of FIXTURE_BOOKS) {
      expect(spec.chapters.length).toBeGreaterThanOrEqual(2);
      for (const ch of spec.chapters) {
        expect(ch.blocks.length).toBeGreaterThan(0);
      }
    }
  });

  it("covers one free book and one reserved book", () => {
    expect(FIXTURE_BOOKS.map((b) => b.plan).sort()).toEqual(["FREE", "PRO"]);
  });

  it("exercises every block kind the reader can draw", () => {
    const kinds = new Set(
      FIXTURE_BOOKS.flatMap((b) => b.chapters).flatMap((c) =>
        c.blocks.map((bl) => bl.kind),
      ),
    );
    for (const kind of [
      "HEADING",
      "PARAGRAPH",
      "QUOTE",
      "PAUSE",
      "EXERCISE",
      "VIDEO",
    ]) {
      expect(kinds).toContain(kind);
    }
  });

  it("keeps every slug namespaced, so a fixture row is recognisable on sight", () => {
    for (const spec of FIXTURE_BOOKS) {
      expect(spec.slug.startsWith("qa-visual-")).toBe(true);
    }
    expect(FIXTURE_AUTHOR_SLUG.startsWith("qa-visual-")).toBe(true);
  });
});
