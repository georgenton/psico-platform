import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_INTERNAL_ERROR,
  BOOK_SLUG_TAKEN,
  MANIFEST_INVALID,
  editionKeyFor,
  parseBookManifest,
  planBookBootstrap,
  sanitizeBootstrapError,
  serializeBootstrapPlan,
} from "./bootstrap-book";
import { parseBootstrapArgs } from "./bootstrap-cli";
import {
  estimateDurationMinutes,
  parseTestEditionChapter,
} from "./lib/test-edition-parser";

const VALID = {
  slug: "libro-de-prueba",
  title: "Libro de prueba",
  author: "Equipo de pruebas",
  editionLabel: "Edición de prueba OCR",
  sourceQuality: "OCR_UNFINALIZED",
  chapters: [
    { order: 2, title: "Dos", file: "02.md" },
    { order: 1, title: "Uno", file: "01.md" },
  ],
};

describe("bootstrap · manifest validation", () => {
  it("accepts a valid manifest and sorts chapters by order", () => {
    const m = parseBookManifest(VALID);
    expect(m.slug).toBe("libro-de-prueba");
    expect(m.chapters.map((c) => c.order)).toEqual([1, 2]);
    expect(m.sourceQuality).toBe("OCR_UNFINALIZED");
  });

  it("rejects a non-kebab slug", () => {
    expect(() => parseBookManifest({ ...VALID, slug: "Libro Prueba" })).toThrow(
      MANIFEST_INVALID,
    );
  });

  it("rejects an empty chapter list", () => {
    expect(() => parseBookManifest({ ...VALID, chapters: [] })).toThrow(
      MANIFEST_INVALID,
    );
  });

  it("rejects duplicate chapter orders", () => {
    const dup = {
      ...VALID,
      chapters: [
        { order: 1, file: "a.md" },
        { order: 1, file: "b.md" },
      ],
    };
    expect(() => parseBookManifest(dup)).toThrow(MANIFEST_INVALID);
  });

  it("rejects a missing author", () => {
    const rest = { ...VALID } as Partial<typeof VALID>;
    delete rest.author;
    expect(() => parseBookManifest(rest)).toThrow(MANIFEST_INVALID);
  });

  it("derives the same edition key shape the backfill uses", () => {
    expect(editionKeyFor("parejas-que-perduran")).toBe(
      "parejas-que-perduran-1e",
    );
  });
});

describe("bootstrap · CLI args", () => {
  it("defaults to dry-run", () => {
    expect(parseBootstrapArgs(["--manifest=/tmp/m.json"])).toEqual({
      manifestPath: "/tmp/m.json",
      apply: false,
    });
  });

  it("requires an explicit --apply to write", () => {
    const a = parseBootstrapArgs(["--manifest", "/tmp/m.json", "--apply"]);
    expect(a.apply).toBe(true);
  });

  it("refuses to run without a manifest", () => {
    expect(() => parseBootstrapArgs(["--apply"])).toThrow("MISSING_MANIFEST");
  });
});

describe("bootstrap · error sanitization", () => {
  it("passes a whitelisted code through", () => {
    expect(sanitizeBootstrapError(new Error(BOOK_SLUG_TAKEN))).toBe(
      BOOK_SLUG_TAKEN,
    );
  });

  it("never leaks an arbitrary message (which could carry manuscript text)", () => {
    const leak = new Error("Insert failed for row: «Cuando alguien entra…»");
    expect(sanitizeBootstrapError(leak)).toBe(BOOTSTRAP_INTERNAL_ERROR);
  });
});

describe("bootstrap · dry-run plan", () => {
  const chapters = [
    {
      order: 1,
      title: "Uno",
      blocks: [
        { kind: "PARAGRAPH" as const, content: "Texto uno." },
        { kind: "QUOTE" as const, content: "Cita." },
      ],
    },
    {
      order: 2,
      title: "Dos",
      blocks: [{ kind: "PARAGRAPH" as const, content: "Texto dos." }],
    },
  ];

  function fakePrisma(taken: boolean) {
    const hit = taken ? { id: "x" } : null;
    return {
      book: { findUnique: async () => hit },
      edition: { findUnique: async () => hit },
    } as never;
  }

  it("reports a free slug as safe and writes nothing", async () => {
    const plan = await planBookBootstrap(fakePrisma(false), {
      manifest: parseBookManifest(VALID),
      chapters,
    });
    expect(plan.slug_available).toBe(true);
    expect(plan.bootstrap_safe).toBe(true);
    expect(plan.chapter_count).toBe(2);
    expect(plan.nonempty_chapter_count).toBe(2);
    expect(plan.total_block_count).toBe(3);
    expect(plan.block_kind_counts).toEqual({ PARAGRAPH: 2, QUOTE: 1 });
  });

  it("fails closed when the slug already exists", async () => {
    const plan = await planBookBootstrap(fakePrisma(true), {
      manifest: parseBookManifest(VALID),
      chapters,
    });
    expect(plan.slug_available).toBe(false);
    expect(plan.bootstrap_safe).toBe(false);
  });

  it("refuses a book with an empty chapter", async () => {
    const plan = await planBookBootstrap(fakePrisma(false), {
      manifest: parseBookManifest(VALID),
      chapters: [...chapters, { order: 3, title: "Tres", blocks: [] }],
    });
    expect(plan.nonempty_chapter_count).toBe(2);
    expect(plan.bootstrap_safe).toBe(false);
  });

  it("serializes as metrics only — no block text", async () => {
    const plan = await planBookBootstrap(fakePrisma(false), {
      manifest: parseBookManifest(VALID),
      chapters,
    });
    const out = serializeBootstrapPlan(plan);
    expect(out).toContain("bootstrap_safe=true");
    expect(out).not.toContain("Texto uno");
    expect(out).not.toContain("Cita");
  });
});

describe("test-edition parser", () => {
  it("takes the markdown H1 as the title and types the rest", () => {
    const src = [
      "# Lo que notamos primero",
      "",
      "Cuando alguien entra en una sala, notamos cosas antes de mirarlas.",
      "",
      "> Lo que se observa sin prisa dice más.",
      "",
      ":::pausa",
      "Respira una vez sin contarla.",
      ":::",
    ].join("\n");
    const out = parseTestEditionChapter(src, "fallback");
    expect(out.title).toBe("Lo que notamos primero");
    expect(out.blocks.map((b) => b.kind)).toEqual([
      "PARAGRAPH",
      "QUOTE",
      "PAUSE",
    ]);
  });

  it("keeps a second H1 as a heading instead of dropping it", () => {
    const out = parseTestEditionChapter("# Uno\n\n# Dos\n\nTexto.", "fb");
    expect(out.title).toBe("Uno");
    expect(out.blocks[0]).toEqual({ kind: "HEADING", content: "Dos" });
  });

  it("reads plain OCR prose: first short line is the title", () => {
    const src = [
      "Capítulo cinco",
      "",
      "Una línea larga de prosa que claramente termina como una oración normal.",
    ].join("\n");
    const out = parseTestEditionChapter(src, "fb");
    expect(out.title).toBe("Capítulo cinco");
    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0].kind).toBe("PARAGRAPH");
  });

  it("falls back to the supplied placeholder when there is no title", () => {
    const out = parseTestEditionChapter(
      "Esta primera línea es una oración completa y termina con punto.",
      "Sección OCR de prueba 4",
    );
    expect(out.title).toBe("Sección OCR de prueba 4");
    expect(out.blocks).toHaveLength(1);
  });

  it("never drops a non-empty paragraph", () => {
    const src = "# T\n\nUno.\n\nDos.\n\nTres.\n\nCuatro.";
    const out = parseTestEditionChapter(src, "fb");
    expect(out.blocks).toHaveLength(4);
    expect(out.blocks.every((b) => b.content.length > 0)).toBe(true);
  });

  it("carries a video url into meta", () => {
    const out = parseTestEditionChapter(
      "# T\n\n:::video https://example.test/a.mp4\nCápsula del capítulo.\n:::",
      "fb",
    );
    expect(out.blocks[0].kind).toBe("VIDEO");
    expect(out.blocks[0].meta).toEqual({
      videoUrl: "https://example.test/a.mp4",
    });
  });

  it("never estimates a zero-minute chapter that has text", () => {
    expect(
      estimateDurationMinutes([{ kind: "PARAGRAPH", content: "una palabra" }]),
    ).toBe(1);
  });
});
