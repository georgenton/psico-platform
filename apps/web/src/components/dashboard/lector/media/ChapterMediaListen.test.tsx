import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ChapterMediaListen } from "./ChapterMediaListen";

/**
 * Book Experience Standard V1 — the subformats inside Escuchar.
 *
 * Audiolibro and Podcast are two separate publications, and the standard says
 * a format with nothing playable must not look published. Inside this surface
 * that has a sharper consequence than a grey tab: the podcast panel is the
 * thing that asks for a signed URL, so an ungated tab means a person can press
 * a format that does not exist and we will go and ask the server to sign it.
 *
 * Every test below therefore checks the same three things about a disabled
 * option — it does not become selected, it mounts no panel, and it produces no
 * `/access` call.
 */

vi.mock("../AudioBar", () => ({
  AudioBar: () => <div data-testid="audio-bar" />,
}));

const AUDIOBOOK = {
  mediaKey: "a1",
  mediaVersion: 1,
  kind: "AUDIOBOOK",
  title: "Audiolibro",
  description: "La narración del capítulo.",
  durationSec: 600,
  availability: "AVAILABLE",
  hasTranscript: true,
  hasCaptions: false,
  chapters: [],
};

const PODCAST = {
  ...AUDIOBOOK,
  mediaKey: "p1",
  kind: "PODCAST",
  title: "Podcast",
  description: "La conversación sobre el capítulo.",
};

let fetchSpy: MockInstance<typeof fetch>;

/** Serve one manifest; record every other call so `/access` is visible. */
function serve(items: unknown[]) {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (async (input: any) => {
      // `/access` is itself under `/media/...`, so it has to be matched first.
      if (String(input).includes("/access")) {
        return new Response(
          JSON.stringify({
            kind: "PODCAST",
            mediaKey: "p1",
            mediaVersion: 1,
            url: "https://signed.example/p1",
            transcriptUrl: null,
            posterUrl: null,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          }),
          { status: 200 },
        );
      }
      if (String(input).includes("/media")) {
        return new Response(
          JSON.stringify({
            bookSlug: "emociones-en-construccion",
            chapterOrder: 1,
            items,
          }),
          { status: 200 },
        );
      }
      // Nothing else should be requested at all; make that loud if it is.
      return new Response("{}", { status: 404 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );
}

function accessCalls() {
  return fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/access"));
}

function renderListen() {
  return render(
    <ChapterMediaListen
      apiBase="https://api.example/api"
      token="tok"
      bookId="book-1"
      chapterOrder={1}
      audioAvailable
    />,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PODCAST_INTERNAL_SURFACE_GATED=true", () => {
  it("shows the podcast disabled when the episode is not produced", async () => {
    serve([AUDIOBOOK, { ...PODCAST, availability: "COMING_SOON" }]);
    renderListen();

    const podcast = await screen.findByTestId("media-subformat-podcast");
    expect(podcast).toHaveAttribute("data-mode-state", "COMING_SOON");
    expect(podcast).toHaveAttribute("aria-disabled", "true");
    expect(podcast).toHaveTextContent("Próximamente");
  });

  it("a disabled subformat changes nothing when pressed and signs nothing", async () => {
    serve([AUDIOBOOK, { ...PODCAST, availability: "COMING_SOON" }]);
    renderListen();

    const podcast = await screen.findByTestId("media-subformat-podcast");
    fireEvent.click(podcast);
    await act(async () => {
      await Promise.resolve();
    });

    expect(podcast).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("media-subformat-audiolibro")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The panel that would have asked for a URL never mounted.
    expect(screen.getByTestId("audio-bar")).toBeInTheDocument();
    expect(screen.queryByLabelText("Podcast del capítulo")).toBeNull();
    expect(accessCalls()).toHaveLength(0);
  });

  it("hides a subformat this chapter never announced", async () => {
    serve([AUDIOBOOK]);
    renderListen();

    await screen.findByTestId("media-subformat-audiolibro");
    expect(screen.queryByTestId("media-subformat-podcast")).toBeNull();
    expect(accessCalls()).toHaveLength(0);
  });

  it("selects the first playable subformat when the default one is not", async () => {
    // A chapter that has the conversation but not the narration.
    serve([{ ...AUDIOBOOK, availability: "COMING_SOON" }, PODCAST]);
    renderListen();

    const podcast = await screen.findByTestId("media-subformat-podcast");
    await waitFor(() =>
      expect(podcast).toHaveAttribute("aria-selected", "true"),
    );
    expect(screen.getByTestId("media-subformat-audiolibro")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    // …and only THEN is a signed URL requested, for the format that exists.
    await waitFor(() => expect(accessCalls()).toHaveLength(1));
    expect(String(accessCalls()[0]![0])).toContain("p1");
  });

  it("opens the podcast only when the reader picks a playable one", async () => {
    serve([AUDIOBOOK, PODCAST]);
    renderListen();

    await screen.findByTestId("media-subformat-audiolibro");
    expect(accessCalls()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("media-subformat-podcast"));
    await waitFor(() => expect(accessCalls()).toHaveLength(1));
    expect(
      await screen.findByLabelText("Podcast del capítulo"),
    ).toBeInTheDocument();
  });
});
