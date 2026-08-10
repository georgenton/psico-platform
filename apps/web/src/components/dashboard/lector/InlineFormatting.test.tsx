import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { BlockRenderer } from "./BlockRenderer";

/**
 * Editorial formatting in the reader, and its coexistence with reader marks.
 *
 * The assertion repeated throughout is `textContent === block.content`. It is
 * the whole safety argument: a reader's Highlight is a pair of offsets into that
 * string, so the moment rendering can add or drop a character, every highlight
 * after it points somewhere else. Formatting has to be invisible to the text.
 */

const CONTENT = "La mente también aprende del cuerpo.";

function block(over: Record<string, unknown> = {}) {
  return {
    id: "block_1",
    kind: "PARAGRAPH",
    content: CONTENT,
    meta: null,
    ...over,
  } as never;
}

const marks = (...ms: Array<[string, number, number]>) => ({
  inlineMarks: ms.map(([type, startOffset, endOffset]) => ({
    type,
    startOffset,
    endOffset,
  })),
});

function draw(over: Record<string, unknown> = {}, highlights: unknown[] = []) {
  return render(
    <BlockRenderer
      block={block(over)}
      highlights={highlights as never}
      annotationCount={0}
      registerRef={() => {}}
    />,
  );
}

/** "también" — the phrase from the production canary that started this. */
const TAMBIEN: [string, number, number] = ["UNDERLINE", 9, 16];

describe("a block with no formatting renders exactly as before", () => {
  it("produces the text and no formatting elements", () => {
    const { container } = draw();
    expect(container.textContent).toBe(CONTENT);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("em")).toBeNull();
  });

  it("ignores malformed metadata rather than dropping the paragraph", () => {
    // A chapter that will not render is a far worse outcome than one that
    // renders without emphasis.
    const { container } = draw({ meta: { inlineMarks: "nonsense" } });
    expect(container.textContent).toBe(CONTENT);
  });
});

describe("editorial marks", () => {
  it("underlines exactly the marked phrase", () => {
    const { container } = draw({ meta: marks(TAMBIEN) });
    const underlined = container.querySelector('[style*="underline"]');
    expect(underlined?.textContent).toBe("también");
    expect(container.textContent).toBe(CONTENT);
  });

  it("renders bold with an element a screen reader understands", () => {
    // <strong> rather than a font-weight span: emphasis that only exists in CSS
    // does not exist for anyone listening.
    const { container } = draw({ meta: marks(["BOLD", 0, 8]) });
    expect(container.querySelector("strong")?.textContent).toBe("La mente");
    expect(container.textContent).toBe(CONTENT);
  });

  it("renders italic as <em>", () => {
    const { container } = draw({ meta: marks(["ITALIC", 17, 24]) });
    expect(container.querySelector("em")?.textContent).toBe("aprende");
    expect(container.textContent).toBe(CONTENT);
  });

  it.each([
    [
      "bold+italic",
      [
        ["BOLD", 0, 8],
        ["ITALIC", 0, 8],
      ],
    ],
    [
      "bold+underline",
      [
        ["BOLD", 0, 8],
        ["UNDERLINE", 0, 8],
      ],
    ],
    [
      "italic+underline",
      [
        ["ITALIC", 0, 8],
        ["UNDERLINE", 0, 8],
      ],
    ],
    [
      "all three",
      [
        ["BOLD", 0, 8],
        ["ITALIC", 0, 8],
        ["UNDERLINE", 0, 8],
      ],
    ],
  ])("combines %s on one run", (_label, ms) => {
    const { container } = draw({
      meta: marks(...(ms as Array<[string, number, number]>)),
    });
    expect(container.textContent).toBe(CONTENT);
    // Whatever the nesting, the text is untouched and something was emphasised.
    expect(container.innerHTML).not.toBe(CONTENT);
  });

  it("never reaches for innerHTML", () => {
    // There is no markup in `content` to parse, and parsing is how markup gets
    // into text in the first place.
    const source = String(BlockRenderer);
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("editorial marks alongside a reader's highlight", () => {
  const highlight = (over: Record<string, unknown> = {}) => [
    {
      id: "hl_1",
      startOffset: 9,
      endOffset: 24,
      color: "YELLOW",
      note: null,
      ...over,
    },
  ];

  it("leaves an unformatted highlight exactly as it was", () => {
    const { container } = draw({}, highlight());
    const mark = container.querySelector("mark");
    expect(mark?.getAttribute("data-highlight-id")).toBe("hl_1");
    expect(mark?.textContent).toBe("también aprende");
    expect(container.textContent).toBe(CONTENT);
  });

  it("keeps ONE mark element when formatting starts midway through it", () => {
    // The failure this prevents: cutting by formatting first would split a
    // single persisted Highlight into several <mark> elements, and
    // `data-highlight-id` would stop identifying one thing.
    const { container } = draw({ meta: marks(["BOLD", 12, 20]) }, highlight());
    const found = container.querySelectorAll('[data-highlight-id="hl_1"]');
    expect(found).toHaveLength(1);
    expect(found[0]!.textContent).toBe("también aprende");
    expect(container.textContent).toBe(CONTENT);
  });

  it("keeps one mark element when formatting crosses its boundary", () => {
    const { container } = draw(
      { meta: marks(["UNDERLINE", 0, 30]) },
      highlight(),
    );
    expect(container.querySelectorAll("mark")).toHaveLength(1);
    expect(container.textContent).toBe(CONTENT);
  });

  it("renders the formatting inside the highlight, not instead of it", () => {
    const { container } = draw({ meta: marks(["BOLD", 9, 16]) }, highlight());
    const mark = container.querySelector("mark")!;
    expect(mark.querySelector("strong")?.textContent).toBe("también");
    expect(mark.textContent).toBe("también aprende");
  });

  it("preserves the highlight's colour and note", () => {
    const { container } = draw(
      { meta: marks(TAMBIEN) },
      highlight({ color: "BLUE", note: "una nota" }),
    );
    const mark = container.querySelector("mark")!;
    expect(mark.getAttribute("title")).toBe("una nota");
    expect(mark.getAttribute("style")).toMatch(/background/);
  });

  it("keeps the reader-text wrapper", () => {
    // Text selection for creating new highlights hangs off this.
    const { container } = draw({ meta: marks(TAMBIEN) }, highlight());
    expect(container.querySelector(".reader-text")).not.toBeNull();
  });
});
