import { describe, expect, it } from "vitest";
import {
  BOOK_EDITORIAL_STRUCTURES,
  bookEditionLabel,
  bookEditorialStructure,
  bookOutline,
  chapterEditorialLabel,
  numberedChapterCount,
} from "@psico/types";

/**
 * The editorial structure catalog, and the two properties that matter most:
 * a declared book reads the way its edition prints, and an undeclared book is
 * left exactly as it was.
 */

const pqpChapters = [
  { n: 1, title: "Prefacio e introducción" },
  { n: 2, title: "Cuando amar también sana" },
  { n: 3, title: "Amenazas silenciosas en la relación" },
  { n: 4, title: "Elegirse cada día" },
  { n: 5, title: "Puentes que nos acercan" },
  { n: 6, title: "Conflictos que revelan" },
  { n: 7, title: "De crisis a oportunidad" },
  { n: 8, title: "Respetarnos para florecer" },
  { n: 9, title: "Gestos que transforman" },
];

describe("book structure · the declaration itself", () => {
  it("gives Parejas eight numbered chapters, contiguous from 1", () => {
    const structure = bookEditorialStructure("parejas-que-perduran");
    const numbers = structure!.units
      .filter((u) => u.role === "CHAPTER")
      .map((u) => u.number);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(numberedChapterCount("parejas-que-perduran")).toBe(8);
  });

  it("keeps every declared unit order unique and inside the edition", () => {
    for (const [slug, structure] of Object.entries(BOOK_EDITORIAL_STRUCTURES)) {
      const orders = structure.units.map((u) => u.order);
      expect(new Set(orders).size, slug).toBe(orders.length);
      expect(structure.bookSlug, slug).toBe(slug);
      // A CHAPTER carries a number; anything else carries a label or sections.
      for (const unit of structure.units) {
        if (unit.role === "CHAPTER")
          expect(unit.number, slug).toBeGreaterThan(0);
        else
          expect(Boolean(unit.label || unit.sections?.length), slug).toBe(true);
      }
    }
  });

  it("declares no section this edition does not print", () => {
    const headings = bookEditorialStructure("parejas-que-perduran")!
      .units.flatMap((u) => u.sections ?? [])
      .map((s) => s.heading);
    // Measured against published revision #10, each present exactly once.
    expect(headings).toEqual([
      "Dedicatoria",
      "Prefacio",
      "Introducción:",
      "Epílogo: Amar es elegir, cada día",
      "Sobre el autor",
      "Mensaje del autor a los lectores",
      "Bibliografía",
    ]);
    // The chapter 8 close is NOT back matter and NOT a ninth chapter.
    expect(headings).not.toContain(
      "Conclusión final: El amor que se construye cada día",
    );
    // The edition prints no acknowledgements section.
    expect(headings.join(" ")).not.toMatch(/agradecimient/i);
  });
});

describe("book structure · the outline a reader sees", () => {
  const outline = bookOutline("parejas-que-perduran", pqpChapters);

  it("never numbers a unit by its platform order", () => {
    // The whole bug: order 2 is the book's chapter 1, order 9 its chapter 8.
    expect(outline.chapters.map((c) => c.label)).toEqual([
      "Capítulo 1",
      "Capítulo 2",
      "Capítulo 3",
      "Capítulo 4",
      "Capítulo 5",
      "Capítulo 6",
      "Capítulo 7",
      "Capítulo 8",
    ]);
    expect(outline.chapters).toHaveLength(8);
    expect(outline.chapters.map((c) => c.label)).not.toContain("Capítulo 9");
  });

  it("lists the front matter by name instead of as chapter one", () => {
    expect(outline.frontMatter.map((e) => e.title)).toEqual([
      "Dedicatoria",
      "Prefacio",
      "Introducción",
    ]);
    // All three open the unit that actually contains them.
    for (const entry of outline.frontMatter) {
      expect(entry.target.n).toBe(1);
      expect(entry.role).toBe("FRONT_MATTER");
    }
  });

  it("lists the back matter outside the numbered chapters", () => {
    expect(outline.backMatter.map((e) => e.title)).toEqual([
      "Epílogo: Amar es elegir, cada día",
      "Sobre el autor",
      "Mensaje del autor a los lectores",
      "Bibliografía",
    ]);
    for (const entry of outline.backMatter) {
      expect(entry.target.n).toBe(9);
      expect(entry.role).toBe("BACK_MATTER");
    }
  });

  it("shows the front-matter unit once, through its sections", () => {
    // Unit 1 must not appear both as «Preliminares» and as its three parts.
    const titles = [
      ...outline.frontMatter,
      ...outline.chapters,
      ...outline.backMatter,
    ].map((e) => e.title);
    expect(titles).not.toContain("Preliminares");
    expect(titles).not.toContain("Prefacio e introducción");
  });

  it("names the printed edition instead of the retired OCR one", () => {
    expect(bookEditionLabel("parejas-que-perduran")).toBe(
      "Edición impresa canónica",
    );
    expect(bookEditionLabel("parejas-que-perduran")).not.toMatch(/OCR/i);
  });

  it("labels a unit the same way in the reader as in the index", () => {
    expect(chapterEditorialLabel("parejas-que-perduran", 2)).toBe("Capítulo 1");
    expect(chapterEditorialLabel("parejas-que-perduran", 9)).toBe("Capítulo 8");
    expect(chapterEditorialLabel("parejas-que-perduran", 1)).toBe(
      "Preliminares",
    );
  });
});

describe("book structure · a book that declares nothing", () => {
  const eec = [
    { n: 1, title: "El cuerpo antes que la mente" },
    { n: 2, title: "Teorías como lentes" },
  ];

  it("is left exactly as it was — flat, unlabelled, in order", () => {
    const outline = bookOutline("emociones-en-construccion", eec);
    expect(outline.declared).toBe(false);
    expect(outline.frontMatter).toEqual([]);
    expect(outline.backMatter).toEqual([]);
    expect(outline.chapters.map((c) => c.title)).toEqual([
      "El cuerpo antes que la mente",
      "Teorías como lentes",
    ]);
    // No invented number, and no invented introduction.
    expect(outline.chapters.every((c) => c.label === null)).toBe(true);
  });

  it("declares no label and no edition name for it", () => {
    expect(chapterEditorialLabel("emociones-en-construccion", 1)).toBeNull();
    expect(bookEditionLabel("emociones-en-construccion")).toBeNull();
    expect(numberedChapterCount("emociones-en-construccion")).toBeNull();
  });

  it("keeps a unit the structure forgot rather than dropping it", () => {
    const outline = bookOutline("parejas-que-perduran", [
      ...pqpChapters,
      { n: 10, title: "Una unidad que nadie declaró" },
    ]);
    expect(outline.chapters).toHaveLength(9);
    expect(outline.chapters.at(-1)).toMatchObject({
      title: "Una unidad que nadie declaró",
      label: null,
    });
  });
});
