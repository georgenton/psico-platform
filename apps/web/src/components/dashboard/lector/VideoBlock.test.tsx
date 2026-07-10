import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { videoBlockInfo } from "@psico/types";
import type { ChapterBlockSummary } from "@psico/types";
import { VideoBlock } from "./VideoBlock";

/**
 * Tests for the inline chapter video capsule (backlog: reproductor real).
 *
 * Covers the shared videoBlockInfo() detector (VIDEO kind + legacy 🎬 mock)
 * and the VideoBlock component's two states: real <video> when a URL exists,
 * "en producción" placeholder when it doesn't.
 */
function block(overrides: Partial<ChapterBlockSummary>): ChapterBlockSummary {
  return {
    id: "b1",
    order: 1,
    kind: "VIDEO",
    content: "Cápsula del capítulo.",
    meta: null,
    ...overrides,
  };
}

describe("videoBlockInfo", () => {
  it("returns null for non-video blocks", () => {
    expect(videoBlockInfo(block({ kind: "PARAGRAPH" }))).toBeNull();
    expect(
      videoBlockInfo(block({ kind: "EXERCISE", content: "Un ejercicio" })),
    ).toBeNull();
  });

  it("detects a VIDEO kind block", () => {
    const info = videoBlockInfo(block({ kind: "VIDEO", content: "Hola" }));
    expect(info).not.toBeNull();
    expect(info?.url).toBeNull();
    expect(info?.caption).toBe("Hola");
  });

  it("detects a legacy 🎬 EXERCISE mock and strips the emoji", () => {
    const info = videoBlockInfo(
      block({
        kind: "EXERCISE",
        content: "🎬 Video del capítulo próximamente",
      }),
    );
    expect(info).not.toBeNull();
    expect(info?.caption).toBe("Video del capítulo próximamente");
  });

  it("parses meta.videoUrl / posterUrl / durationSec", () => {
    const info = videoBlockInfo(
      block({
        meta: {
          videoUrl: "https://cdn/x.mp4",
          posterUrl: "https://cdn/x.jpg",
          durationSec: 95,
        },
      }),
    );
    expect(info?.url).toBe("https://cdn/x.mp4");
    expect(info?.poster).toBe("https://cdn/x.jpg");
    expect(info?.durationSec).toBe(95);
  });

  it("treats empty-string urls as absent", () => {
    const info = videoBlockInfo(
      block({ meta: { videoUrl: "", posterUrl: "" } }),
    );
    expect(info?.url).toBeNull();
    expect(info?.poster).toBeNull();
  });
});

describe("VideoBlock", () => {
  it("renders the 'en producción' placeholder when there is no url", () => {
    const info = videoBlockInfo(block({ content: "Cápsula del cap." }))!;
    render(<VideoBlock info={info} blockId="b1" />);
    expect(screen.getByText("En producción")).toBeInTheDocument();
    expect(screen.getByText("Cápsula del cap.")).toBeInTheDocument();
    // No real <video> element in the placeholder state.
    expect(document.querySelector("video")).toBeNull();
  });

  it("renders a real <video> with the source when a url exists", () => {
    const info = videoBlockInfo(
      block({
        meta: { videoUrl: "https://cdn/x.mp4", posterUrl: "https://cdn/p.jpg" },
      }),
    )!;
    render(<VideoBlock info={info} blockId="b1" />);
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("poster")).toBe("https://cdn/p.jpg");
    expect(document.querySelector("source")?.getAttribute("src")).toBe(
      "https://cdn/x.mp4",
    );
    expect(screen.queryByText("En producción")).not.toBeInTheDocument();
  });

  it("omits the caption when it is empty", () => {
    const info = videoBlockInfo(block({ content: "" }))!;
    const { container } = render(<VideoBlock info={info} blockId="b1" />);
    expect(container.querySelector("figcaption")).toBeNull();
  });
});
