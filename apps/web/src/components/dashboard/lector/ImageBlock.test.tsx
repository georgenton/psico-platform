import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { imageBlockInfo } from "@psico/types";

import { ImageBlock } from "./ImageBlock";

/**
 * The IMAGE contract and its web renderer.
 *
 * `meta` is free-form JSON, so a renderer that trusts it will one day be handed
 * a number where it expected a string. Returning null is what lets three
 * renderers fall back to ordinary block rendering instead of emitting a broken
 * image or a silent one.
 */

const block = (meta: Record<string, unknown> | null, content = "") => ({
  kind: "IMAGE",
  content,
  meta,
});

describe("imageBlockInfo", () => {
  it("reads a well-formed image", () => {
    expect(
      imageBlockInfo(
        block(
          {
            imageUrl: "https://cdn/fig.png",
            alt: "Un diagrama del ciclo emocional",
            credit: "Marina Quintana",
          },
          "Figura 1",
        ),
      ),
    ).toEqual({
      imageUrl: "https://cdn/fig.png",
      alt: "Un diagrama del ciclo emocional",
      caption: "Figura 1",
      credit: "Marina Quintana",
    });
  });

  it("returns null without alt text", () => {
    // An illustration a screen reader cannot describe is not publishable, so
    // rendering it silently would be worse than not rendering it at all.
    expect(imageBlockInfo(block({ imageUrl: "https://cdn/a.png" }))).toBeNull();
    expect(
      imageBlockInfo(block({ imageUrl: "https://cdn/a.png", alt: "   " })),
    ).toBeNull();
  });

  it("returns null without a URL", () => {
    expect(imageBlockInfo(block({ alt: "algo" }))).toBeNull();
    expect(imageBlockInfo(block({ imageUrl: "", alt: "algo" }))).toBeNull();
  });

  it("returns null for meta of the wrong shape", () => {
    expect(imageBlockInfo(block(null))).toBeNull();
    expect(imageBlockInfo(block({}))).toBeNull();
    expect(
      imageBlockInfo(block({ imageUrl: 42 as unknown as string, alt: "a" })),
    ).toBeNull();
    expect(
      imageBlockInfo(
        block({ imageUrl: "https://cdn/a.png", alt: 7 as unknown as string }),
      ),
    ).toBeNull();
  });

  it("ignores blocks of another kind", () => {
    expect(
      imageBlockInfo({
        kind: "PARAGRAPH",
        content: "texto",
        meta: { imageUrl: "https://cdn/a.png", alt: "a" },
      }),
    ).toBeNull();
  });

  it("treats blank caption and credit as absent", () => {
    expect(
      imageBlockInfo(
        block({ imageUrl: "https://cdn/a.png", alt: "a", credit: "  " }),
      ),
    ).toMatchObject({ caption: null, credit: null });
  });

  it("falls back to meta.caption for blocks written before content held it", () => {
    expect(
      imageBlockInfo(
        block({
          imageUrl: "https://cdn/a.png",
          alt: "a",
          caption: "Pie antiguo",
        }),
      )?.caption,
    ).toBe("Pie antiguo");
  });

  it("trims, so whitespace never reaches a renderer", () => {
    expect(
      imageBlockInfo(
        block({ imageUrl: "  https://cdn/a.png  ", alt: "  algo  " }),
      ),
    ).toMatchObject({ imageUrl: "https://cdn/a.png", alt: "algo" });
  });
});

describe("ImageBlock", () => {
  const info = {
    imageUrl: "https://cdn/fig.png",
    alt: "Un diagrama del ciclo emocional",
    caption: "Figura 1",
    credit: "Marina Quintana",
  };

  it("renders the image with its alt text, not its URL", () => {
    render(<ImageBlock info={info} blockId="b1" />);

    const img = screen.getByAltText("Un diagrama del ciclo emocional");
    expect(img).toHaveAttribute("src", "https://cdn/fig.png");
    // A URL rendered as text is a leak of where things live and useless to read.
    expect(screen.queryByText("https://cdn/fig.png")).not.toBeInTheDocument();
  });

  it("shows caption and credit when present", () => {
    render(<ImageBlock info={info} blockId="b1" />);

    expect(screen.getByText(/Figura 1/)).toBeInTheDocument();
    expect(screen.getByText("Marina Quintana")).toBeInTheDocument();
  });

  it("renders no caption element when there is neither caption nor credit", () => {
    const { container } = render(
      <ImageBlock
        info={{ ...info, caption: null, credit: null }}
        blockId="b1"
      />,
    );
    expect(container.querySelector("figcaption")).toBeNull();
  });

  it("carries the block identity the reader uses for hit-testing", () => {
    const { container } = render(<ImageBlock info={info} blockId="b7" />);
    const fig = container.querySelector("[data-block-id='b7']");
    expect(fig).toHaveAttribute("data-block-kind", "IMAGE");
    expect(fig).toHaveClass("reader-block");
  });

  it("cannot overflow its column", () => {
    render(<ImageBlock info={info} blockId="b1" />);
    // `w-full` + `h-auto` is what keeps a 4000px-wide figure from forcing the
    // whole chapter to scroll sideways.
    expect(screen.getByAltText(info.alt).className).toMatch(/max-w-full/);
    expect(screen.getByAltText(info.alt).className).toMatch(/h-auto/);
  });
});
