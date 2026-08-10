import { render } from "@testing-library/react-native";
import { Text } from "react-native";

import { FormattedBlockText } from "./FormattedBlockText";

/**
 * Editorial formatting on mobile.
 *
 * Same shared segmentation as the web reader, so the test that matters is that
 * the text comes out intact and the emphasis lands on the same characters. A
 * divergence here would mean an underline covering different words depending on
 * which device someone opened.
 */

const CONTENT = "La mente también aprende del cuerpo.";

const marks = (...ms: Array<[string, number, number]>) => ({
  inlineMarks: ms.map(([type, startOffset, endOffset]) => ({
    type,
    startOffset,
    endOffset,
  })),
});

function draw(meta: Record<string, unknown> | null) {
  return render(
    <Text>
      <FormattedBlockText content={CONTENT} meta={meta} />
    </Text>,
  );
}

/** Collect the leaf strings, in order, exactly as they are rendered. */
function renderedText(json: unknown): string {
  if (typeof json === "string") return json;
  if (Array.isArray(json)) return json.map(renderedText).join("");
  if (json && typeof json === "object") {
    return renderedText((json as { children?: unknown }).children ?? "");
  }
  return "";
}

/** Every style object applied anywhere in the tree. */
function styles(json: unknown, out: Record<string, unknown>[] = []) {
  if (Array.isArray(json)) {
    json.forEach((c) => styles(c, out));
    return out;
  }
  if (json && typeof json === "object") {
    const node = json as {
      props?: Record<string, unknown>;
      children?: unknown;
    };
    const style = node.props?.style;
    if (style && typeof style === "object")
      out.push(style as Record<string, unknown>);
    styles(node.children ?? [], out);
  }
  return out;
}

describe("a block with no formatting", () => {
  it("renders exactly the content, as it always did", () => {
    const { toJSON } = draw(null);
    expect(renderedText(toJSON())).toBe(CONTENT);
  });

  it("falls back to plain text on malformed metadata", () => {
    // Losing emphasis is a blemish; losing the chapter is not.
    const { toJSON } = draw({ inlineMarks: "nonsense" });
    expect(renderedText(toJSON())).toBe(CONTENT);
  });

  it("ignores an IMAGE-style metadata object it does not own", () => {
    const { toJSON } = draw({ imageUrl: "https://example/x.png", alt: "algo" });
    expect(renderedText(toJSON())).toBe(CONTENT);
  });
});

describe("editorial marks", () => {
  it.each([
    ["bold", marks(["BOLD", 9, 16]), { fontWeight: "700" }],
    ["italic", marks(["ITALIC", 9, 16]), { fontStyle: "italic" }],
    [
      "underline",
      marks(["UNDERLINE", 9, 16]),
      { textDecorationLine: "underline" },
    ],
  ])("applies %s to the marked phrase", (_label, meta, expected) => {
    const { toJSON } = draw(meta);
    // Text intact — the invariant that keeps offsets meaningful.
    expect(renderedText(toJSON())).toBe(CONTENT);
    expect(styles(toJSON())).toContainEqual(expect.objectContaining(expected));
  });

  it("combines every type on one run", () => {
    const { toJSON } = draw(
      marks(["BOLD", 9, 16], ["ITALIC", 9, 16], ["UNDERLINE", 9, 16]),
    );
    expect(renderedText(toJSON())).toBe(CONTENT);
    expect(styles(toJSON())).toContainEqual(
      expect.objectContaining({
        fontWeight: "700",
        fontStyle: "italic",
        textDecorationLine: "underline",
      }),
    );
  });

  it("keeps the text intact when marks overlap partially", () => {
    const { toJSON } = draw(marks(["BOLD", 0, 16], ["UNDERLINE", 9, 24]));
    expect(renderedText(toJSON())).toBe(CONTENT);
  });

  it("clamps a mark that outruns the text rather than dropping the block", () => {
    const { toJSON } = draw(marks(["BOLD", 30, 999]));
    expect(renderedText(toJSON())).toBe(CONTENT);
  });
});
