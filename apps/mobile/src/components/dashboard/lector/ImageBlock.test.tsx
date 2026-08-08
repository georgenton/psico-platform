import { render, screen } from "@testing-library/react-native";
import { imageBlockInfo } from "@psico/types";

import { ImageBlock } from "./ImageBlock";

/**
 * The mobile half of the image pair.
 *
 * The contract is shared with web on purpose — a published figure has to be the
 * same figure on both — so the interesting question here is only whether this
 * renderer honours it, especially the accessibility label.
 */

const info = {
  imageUrl: "https://cdn/fig.png",
  alt: "Un diagrama del ciclo emocional",
  caption: "Figura 1",
  credit: "Marina Quintana",
};

describe("ImageBlock (mobile)", () => {
  it("uses the alt text as the accessibility label", () => {
    render(<ImageBlock info={info} />);

    // This is why `imageBlockInfo` refuses to yield an image without alt: on
    // mobile it is the ONLY thing a screen reader has to announce.
    expect(
      screen.getByLabelText("Un diagrama del ciclo emocional"),
    ).toBeTruthy();
  });

  it("renders caption and credit", () => {
    render(<ImageBlock info={info} />);

    expect(screen.getByText(/Figura 1/)).toBeTruthy();
    expect(screen.getByText("Marina Quintana")).toBeTruthy();
  });

  it("renders no caption row when there is neither caption nor credit", () => {
    render(<ImageBlock info={{ ...info, caption: null, credit: null }} />);

    expect(screen.queryByText(/Figura 1/)).toBeNull();
  });

  it("never shows the URL as text", () => {
    render(<ImageBlock info={info} />);

    expect(screen.queryByText("https://cdn/fig.png")).toBeNull();
  });
});

describe("imageBlockInfo (shared contract)", () => {
  it("agrees with web about what a valid image is", () => {
    expect(
      imageBlockInfo({
        kind: "IMAGE",
        content: "Figura 1",
        meta: { imageUrl: "https://cdn/fig.png", alt: "Un diagrama" },
      }),
    ).toEqual({
      imageUrl: "https://cdn/fig.png",
      alt: "Un diagrama",
      caption: "Figura 1",
      credit: null,
    });
  });

  it("refuses an image with no alt text", () => {
    expect(
      imageBlockInfo({
        kind: "IMAGE",
        content: "",
        meta: { imageUrl: "https://cdn/fig.png" },
      }),
    ).toBeNull();
  });
});
