import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ImageBlockRow } from "./[bookSlug]/[chapterOrder]/ImageBlockRow";
import { assetUrl } from "@/lib/asset-url";

/**
 * Images out of a private bucket, as the editor sees them.
 *
 * The production canary uploaded a JPG and got a coloured rectangle. Nothing in
 * the UI said anything was wrong, so the only way to find out was to publish and
 * look — which is the failure this file exists to make impossible.
 */

describe("assetUrl", () => {
  it("prefixes an API-relative asset path", () => {
    // The API returns a path on itself because it does not know its own public
    // hostname. The client does.
    expect(
      assetUrl("/api/content-assets/content/libro/chapter-1/images/abc.png"),
    ).toMatch(
      /^https?:\/\/[^/]+\/api\/content-assets\/content\/libro\/chapter-1\/images\/abc\.png$/,
    );
  });

  it("leaves an absolute URL alone", () => {
    expect(assetUrl("https://cdn.example.com/x.png")).toBe(
      "https://cdn.example.com/x.png",
    );
  });
});

describe("the editor thumbnail", () => {
  const base = {
    index: 0,
    meta: {
      imageUrl: "/api/content-assets/content/libro/chapter-1/images/a.png",
      alt: "Un diagrama",
    },
    caption: "",
    onCaptionChange: vi.fn(),
    onMetaChange: vi.fn(),
    onUpload: vi.fn(),
  };

  it("renders the image through the asset route, not the raw value", () => {
    render(<ImageBlockRow {...base} />);
    const img = screen.getByRole("presentation", {
      hidden: true,
    }) as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("/api/content-assets/");
    expect(img.getAttribute("src")!.startsWith("http")).toBe(true);
  });

  it("says so when the image cannot be displayed", () => {
    render(<ImageBlockRow {...base} />);
    const img = screen.getByRole("presentation", { hidden: true });

    // What the canary hit: bytes stored, nothing renderable.
    fireEvent.error(img);

    expect(screen.getByRole("status")).toHaveTextContent(
      /No pudimos mostrar esta imagen/i,
    );
    // And the silent coloured rectangle is gone.
    expect(screen.queryByRole("presentation", { hidden: true })).toBeNull();
  });
});
