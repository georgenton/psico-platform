import { describe, expect, it } from "vitest";
import { chapterHeading, chapterPartEyebrow } from "./chapter-label";

/**
 * A chapter number is a claim about the book, not about our database.
 *
 * `Chapter.order` orders the reading sequence. In a book whose `order = 1` is a
 * preface, the editorial chapter 1 sits at `order = 2` — and the reader was
 * being told «Cap. 2». These pin the rule that replaced it: name the chapter by
 * its title, and print a number only when a book actually declares one.
 */

describe("chapterHeading", () => {
  it("PLATFORM_ORDER_NEVER_PRESENTED_AS_EDITORIAL_NUMBER — the title carries the heading", () => {
    expect(chapterHeading({ title: "Cuando amar también sana" })).toBe(
      "Cuando amar también sana",
    );
  });

  it("uses an explicit editorial label when a book supplies one", () => {
    expect(
      chapterHeading({ editorialLabel: "Capítulo 1", title: "El primer paso" }),
    ).toBe("Capítulo 1 · El primer paso");
  });

  it("treats a blank label as no label — whitespace is not a claim", () => {
    expect(
      chapterHeading({ editorialLabel: "   ", title: "El primer paso" }),
    ).toBe("El primer paso");
    expect(
      chapterHeading({ editorialLabel: null, title: "El primer paso" }),
    ).toBe("El primer paso");
  });

  it("NUMBER_OMITTED — no heading invents a number from anything", () => {
    for (const title of ["Prefacio e introducción", "Amenazas silenciosas"]) {
      expect(chapterHeading({ title })).not.toMatch(/\d/);
    }
  });
});

describe("chapterPartEyebrow", () => {
  it("shows the part when the book really declares one", () => {
    expect(
      chapterPartEyebrow({
        title: "t",
        partNumber: 1,
        partTitle: "Deconstruyendo lo que sabíamos",
      }),
    ).toBe("Parte 1 — Deconstruyendo lo que sabíamos");
  });

  it("is null for a book with no parts — a single-part book gets no eyebrow", () => {
    expect(chapterPartEyebrow({ title: "t" })).toBeNull();
    expect(
      chapterPartEyebrow({ title: "t", partNumber: 1, partTitle: null }),
    ).toBeNull();
    expect(
      chapterPartEyebrow({ title: "t", partNumber: null, partTitle: "Parte" }),
    ).toBeNull();
  });
});
