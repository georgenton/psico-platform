import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useChapterMediaManifest } from "./use-chapter-media";

/**
 * Regression: the manifest must survive a re-mount.
 *
 * The hook keeps a ref so two overlapping mounts do not fire two requests. That
 * guard used to persist past unmount, which meant the second mount skipped the
 * fetch while the first mount's response had already been discarded as
 * cancelled — `items` stayed null forever and every format read as «en
 * producción» regardless of what the server said. React's development
 * double-invoke (StrictMode) reproduces it exactly, and so does Fast Refresh in
 * a dev session, which is how it was found.
 */

function Probe() {
  const { items, error } = useChapterMediaManifest({
    apiBase: "http://api.test/api",
    token: "t",
    bookId: "book-1",
    chapterOrder: 1,
    enabled: true,
  });
  if (error) return <p>error:{error}</p>;
  if (!items) return <p>loading</p>;
  return <p>items:{items.map((item) => item.kind).join(",")}</p>;
}

const MANIFEST = {
  bookSlug: "libro",
  chapterOrder: 1,
  items: [
    { mediaKey: "a", kind: "AUDIOBOOK", availability: "AVAILABLE" },
    { mediaKey: "p", kind: "PODCAST", availability: "COMING_SOON" },
  ],
};

describe("useChapterMediaManifest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers the manifest under React's double-invoked effects", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MANIFEST,
    } as unknown as Response);

    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(screen.getByText("items:AUDIOBOOK,PODCAST")).toBeInTheDocument(),
    );
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("delivers the manifest again after a full unmount and re-mount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MANIFEST,
    } as unknown as Response);

    const first = render(<Probe />);
    await waitFor(() =>
      expect(screen.getByText("items:AUDIOBOOK,PODCAST")).toBeInTheDocument(),
    );
    first.unmount();

    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByText("items:AUDIOBOOK,PODCAST")).toBeInTheDocument(),
    );
  });

  it("reports a Pro gate instead of an empty manifest", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
    } as unknown as Response);

    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByText("error:pro_required")).toBeInTheDocument(),
    );
  });
});
