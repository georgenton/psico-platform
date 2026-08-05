import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { ChapterMediaSummary } from "@psico/types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ChapterMediaWatch } from "./ChapterMediaWatch";

/**
 * GR-2 — Ver, with as many videos as the chapter actually carries.
 *
 * The surface used to call `.find()` and render the first VIDEO item, so a
 * chapter with two explainers showed one and hid the other. These tests pin
 * the three counts (0, 1, N) and the two states that must never cost a signing
 * request: an announced-but-unproduced video, and a video the person has not
 * selected.
 *
 * The manifest arrives as a prop — the reader already asked for it — so a
 * `/media` call from here would be a second manifest and is a failure.
 */

const VIDEO: ChapterMediaSummary = {
  mediaKey: "v1",
  mediaVersion: 1,
  kind: "VIDEO",
  title: "Video 1",
  description: "La explicación en video.",
  durationSec: 480,
  availability: "AVAILABLE",
  hasTranscript: false,
  hasCaptions: true,
  chapters: [],
};

const V = (n: number, over: Partial<ChapterMediaSummary> = {}) => ({
  ...VIDEO,
  mediaKey: `v${n}`,
  title: `Video ${n}`,
  description: `Explicación ${n}.`,
  ...over,
});

let fetchSpy: MockInstance<typeof fetch>;

function spyOnFetch(status = 200) {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (async (input: any) => {
      if (String(input).includes("/access")) {
        const key = String(input).match(/media\/([^/]+)\/access/)?.[1] ?? "v1";
        return new Response(
          JSON.stringify({
            kind: "VIDEO",
            mediaKey: key,
            mediaVersion: 1,
            embedUrl: `https://embed.example/${key}`,
            transcriptUrl: null,
            posterUrl: null,
            defaultTextTrack: null,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          }),
          { status },
        );
      }
      return new Response("{}", { status: 404 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );
}

const accessCalls = () =>
  fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/access"));

const manifestCalls = () =>
  fetchSpy.mock.calls.filter(
    (c) => String(c[0]).includes("/media") && !String(c[0]).includes("/access"),
  );

function renderWatch(items: ChapterMediaSummary[] | null) {
  return render(
    <ChapterMediaWatch
      apiBase="https://api.example/api"
      token="tok"
      bookSlug="emociones-en-construccion"
      items={items}
      manifestError={null}
    />,
  );
}

const frame = () => document.getElementById("chapter-video-frame");

beforeEach(() => {
  vi.restoreAllMocks();
  spyOnFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VIDEO_ITEMS=0_TO_N", () => {
  it("0 items — says so, mounts no iframe and asks for nothing", async () => {
    renderWatch([]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("No hay videos para este capítulo.")).toBeVisible();
    expect(frame()).toBeNull();
    expect(accessCalls()).toHaveLength(0);
    expect(manifestCalls()).toHaveLength(0);
  });

  it("1 item — plays it, and shows no picker for a single choice", async () => {
    renderWatch([V(1)]);
    await waitFor(() => expect(frame()).not.toBeNull());
    expect(screen.queryByTestId("media-picker")).toBeNull();
    expect(accessCalls()).toHaveLength(1);
  });

  it("N items — lists every video and opens on the first playable one", async () => {
    renderWatch([V(1), V(2), V(3)]);
    await waitFor(() =>
      expect(screen.getByTestId("media-picker")).toBeVisible(),
    );
    expect(screen.getByTestId("media-pick-v1")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByTestId("media-pick-v2")).toBeInTheDocument();
    expect(screen.getByTestId("media-pick-v3")).toBeInTheDocument();
    // One video is showing, so exactly one embed was signed.
    expect(accessCalls()).toHaveLength(1);
  });

  it("VIDEO_SELECTION_AUTOPLAY=false — choosing another video loads it without playing", async () => {
    renderWatch([V(1), V(2)]);
    await waitFor(() =>
      expect(screen.getByTestId("media-picker")).toBeVisible(),
    );

    fireEvent.click(screen.getByTestId("media-pick-v2"));
    await waitFor(() =>
      expect(screen.getByTestId("media-pick-v2")).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
    await waitFor(() => expect(frame()?.getAttribute("src")).toContain("/v2"));
    // The embed URL is minted without autoplay, and we never add one.
    expect(frame()?.getAttribute("src")).not.toContain("autoplay");
    expect(accessCalls()).toHaveLength(2);
  });

  it("VIDEO_COMING_SOON_IFRAME=0 — an announced-but-unproduced video mounts no player", async () => {
    renderWatch([V(1, { availability: "COMING_SOON" })]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Videoexplicación en producción")).toBeVisible();
    expect(frame()).toBeNull();
    expect(accessCalls()).toHaveLength(0);
  });

  it("VIDEO_COMING_SOON_ROW_INERT=true — an unproduced video is listed and unreachable", async () => {
    renderWatch([V(1), V(2, { availability: "COMING_SOON" })]);
    await waitFor(() =>
      expect(screen.getByTestId("media-picker")).toBeVisible(),
    );

    const unproduced = screen.getByTestId("media-pick-v2");
    expect(unproduced).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("En producción")).toBeVisible();

    const before = accessCalls().length;
    fireEvent.click(unproduced);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("media-pick-v1")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(accessCalls()).toHaveLength(before);
  });

  it("error + retry — says which thing failed and offers both ways forward", async () => {
    spyOnFetch(500);
    renderWatch([V(1)]);
    await waitFor(() =>
      expect(screen.getByText("No pudimos preparar este video.")).toBeVisible(),
    );
    expect(screen.getByText("Reintentar")).toBeInTheDocument();
    expect(screen.getByText("← Volver al libro")).toHaveAttribute(
      "href",
      "/dashboard/biblioteca/emociones-en-construccion",
    );
    expect(frame()).toBeNull();

    const before = accessCalls().length;
    fireEvent.click(screen.getByText("Reintentar"));
    await waitFor(() => expect(accessCalls().length).toBe(before + 1));
  });

  it("offers the way back out of a playing video", async () => {
    renderWatch([V(1)]);
    await waitFor(() => expect(frame()).not.toBeNull());
    expect(screen.getByText("← Volver al libro")).toHaveAttribute(
      "href",
      "/dashboard/biblioteca/emociones-en-construccion",
    );
  });
});

/**
 * Ver is a format, not a second reader, and it measures nothing.
 *
 * `LectorShell` already pins the other half — the reading composition mounts in
 * «Leer» only. What is asserted here is what this surface itself may do: show
 * a video, and touch no other part of the product on the way.
 */
describe("VIDEO_SURFACE_IS_NOT_THE_READER", () => {
  it("shows no chapter text, no exercises and no «marcar como leído»", async () => {
    renderWatch([V(1)]);
    await waitFor(() => expect(frame()).not.toBeNull());
    expect(screen.queryByText(/Marcar capítulo/i)).toBeNull();
    expect(screen.queryByText(/Ideas clave/i)).toBeNull();
    expect(screen.queryByText(/Actividades/i)).toBeNull();
    expect(screen.queryByText(/Referencias/i)).toBeNull();
  });

  it("AUTOMATIC_EMOTIONAL_MAP_WRITES=0 · AUTOMATIC_RESONANCE_WRITES=0", async () => {
    renderWatch([V(1), V(2)]);
    await waitFor(() =>
      expect(screen.getByTestId("media-picker")).toBeVisible(),
    );
    fireEvent.click(screen.getByTestId("media-pick-v2"));
    await act(async () => {
      await Promise.resolve();
    });
    // Watching is learning activity. It is not a mood, and it is not a
    // resonance — those are things a person states, never things we infer.
    const written = fetchSpy.mock.calls.filter((c) =>
      /\/(mood|resonances|emotional-map)/.test(String(c[0])),
    );
    expect(written).toHaveLength(0);
  });
});
