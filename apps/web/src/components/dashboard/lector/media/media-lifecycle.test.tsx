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
import { ChapterMediaListen } from "./ChapterMediaListen";

/**
 * The minimal media lifecycle: what we record when a person plays something.
 *
 * Two facts, and only two, are worth knowing: a medium started, and a medium
 * finished. Everything a player could tell us instead — seconds heard, how
 * often a passage was replayed, where someone stopped, at what speed — is
 * absent by design. Those numbers describe attention, and attention is one
 * short step from inferring comprehension or feeling, which this product does
 * not do (`EXPERIENCE_CAUSAL_INFERENCE=false`).
 *
 * What this file pins is the TRIGGER discipline on the client:
 *
 *   - finishing is the browser's own `ended`, nothing else. Not closing the
 *     tab, not seeking to the end, not 90 %, not switching episode;
 *   - the completion request carries no body, so nothing about the content can
 *     ride along with it;
 *   - an announced-but-unproduced format reports nothing at all.
 *
 * Row-level idempotency lives on the server and is pinned there (the
 * completion command derives its key from `mediaKey + mediaVersion`), which is
 * why the retry affordance is safe and why a repeated `ended` cannot create a
 * second event.
 *
 * STARTED is deliberately absent below, and the last test says so out loud:
 * there is no start signal in the product today. Asserting the silence is what
 * keeps this from being mistaken for coverage.
 */

/** The audiobook plays inside `AudioBar`; only its completion hook matters here. */
const audioBarProps: Record<string, unknown>[] = [];
vi.mock("../AudioBar", () => ({
  AudioBar: (props: Record<string, unknown>) => {
    audioBarProps.push(props);
    return <div data-testid="audio-bar" />;
  },
}));

const AUDIOBOOK: ChapterMediaSummary = {
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

const PODCAST: ChapterMediaSummary = {
  ...AUDIOBOOK,
  mediaKey: "p1",
  kind: "PODCAST",
  title: "Podcast",
  description: "La conversación sobre el capítulo.",
};

const EPISODE_2: ChapterMediaSummary = {
  ...PODCAST,
  mediaKey: "p2",
  title: "Podcast · segunda parte",
};

let fetchSpy: MockInstance<typeof fetch>;

function spyOnFetch() {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (async (input: any) => {
      const url = String(input);
      if (url.includes("/access")) {
        const key = url.match(/media\/([^/]+)\/access/)?.[1] ?? "p1";
        return new Response(
          JSON.stringify({
            kind: "PODCAST",
            mediaKey: key,
            mediaVersion: 1,
            url: `https://signed.example/${key}?sig=abc`,
            transcriptUrl: null,
            posterUrl: null,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          }),
          { status: 200 },
        );
      }
      if (url.includes("/complete")) return new Response("{}", { status: 201 });
      return new Response("{}", { status: 404 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );
}

const completionCalls = () =>
  fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/complete"));

const completedKeys = () =>
  completionCalls().map(
    (c) => String(c[0]).match(/media\/([^/]+)\/complete/)?.[1] ?? "?",
  );

function renderListen(items: ChapterMediaSummary[]) {
  return render(
    <ChapterMediaListen
      apiBase="https://api.example/api"
      token="tok"
      bookId="book-1"
      chapterOrder={1}
      chapterTitle="El cuerpo sabe antes que la mente"
      bookSlug="emociones-en-construccion"
      audioAvailable
      items={items}
      manifestError={null}
    />,
  );
}

/** Opens Escuchar → Podcast and waits for the episode to be ready to play. */
async function openPodcast(items: ChapterMediaSummary[]) {
  renderListen(items);
  fireEvent.click(screen.getByTestId("media-subformat-podcast"));
  await waitFor(() => expect(document.querySelector("audio")).not.toBeNull());
  return document.querySelector("audio") as HTMLAudioElement;
}

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  audioBarProps.length = 0;
  vi.restoreAllMocks();
  spyOnFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MEDIA_COMPLETED — only the browser's own `ended`", () => {
  it("mounting and signing report nothing", async () => {
    const audio = await openPodcast([AUDIOBOOK, PODCAST]);
    expect(audio).not.toBeNull();
    expect(completionCalls()).toHaveLength(0);
  });

  it("playing, pausing and seeking report nothing", async () => {
    const audio = await openPodcast([AUDIOBOOK, PODCAST]);

    fireEvent.play(audio);
    fireEvent.timeUpdate(audio);
    fireEvent.pause(audio);
    fireEvent.play(audio);
    fireEvent.seeked(audio);
    await settle();

    // Half-listened is not listened, and stopping is not finishing.
    expect(completionCalls()).toHaveLength(0);
  });

  it("`ended` reports the episode exactly once", async () => {
    const audio = await openPodcast([AUDIOBOOK, PODCAST]);

    fireEvent.ended(audio);
    await waitFor(() => expect(completionCalls()).toHaveLength(1));
    expect(completedKeys()).toEqual(["p1"]);
  });

  it("a repeated `ended` repeats the SAME request, so the server can dedupe it", async () => {
    const audio = await openPodcast([AUDIOBOOK, PODCAST]);

    fireEvent.ended(audio);
    await waitFor(() => expect(completionCalls()).toHaveLength(1));
    fireEvent.ended(audio);
    await waitFor(() => expect(completionCalls()).toHaveLength(2));

    // Identical URL, identical method, no body: the idempotency key is derived
    // server-side from mediaKey + mediaVersion, so two calls are one event.
    // That property is what makes the «reintentar registro» button harmless.
    const [first, second] = completionCalls();
    expect(String(second![0])).toBe(String(first![0]));
    expect(new Set(completedKeys())).toEqual(new Set(["p1"]));
  });

  it("switching episode before the end reports nothing", async () => {
    await openPodcast([PODCAST, EPISODE_2]);

    fireEvent.click(screen.getByTestId("media-pick-p2"));
    await waitFor(() =>
      expect(screen.getByTestId("media-pick-p2")).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
    // Leaving one episode for another says nothing about either.
    expect(completionCalls()).toHaveLength(0);
  });

  it("the audiobook reports under its own key when its player ends", async () => {
    renderListen([AUDIOBOOK, PODCAST]);
    await settle();
    expect(completionCalls()).toHaveLength(0);

    const onEnded = audioBarProps.at(-1)?.onEnded as () => void;
    expect(typeof onEnded).toBe("function");
    await act(async () => {
      onEnded();
    });

    await waitFor(() => expect(completedKeys()).toEqual(["a1"]));
  });

  it("an unproduced format reports nothing, because it never played", async () => {
    renderListen([
      { ...AUDIOBOOK, availability: "COMING_SOON" },
      { ...PODCAST, availability: "COMING_SOON" },
    ]);
    await settle();

    expect(document.querySelector("audio")).toBeNull();
    expect(completionCalls()).toHaveLength(0);
  });
});

describe("MEDIA_LIFECYCLE_PAYLOAD — nothing about the content travels", () => {
  it("the completion request carries no body", async () => {
    const audio = await openPodcast([AUDIOBOOK, PODCAST]);
    fireEvent.ended(audio);
    await waitFor(() => expect(completionCalls()).toHaveLength(1));

    const init = completionCalls()[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    // No body at all is the strongest version of "no transcript, no signed
    // URL, no object key, no position": there is nowhere for them to go.
    expect(init.body).toBeUndefined();
    expect(Object.keys(init)).toEqual(
      expect.arrayContaining(["method", "headers"]),
    );
  });

  it("no automatic write reaches mood, the emotional map or resonances", async () => {
    const audio = await openPodcast([AUDIOBOOK, PODCAST]);
    fireEvent.play(audio);
    fireEvent.ended(audio);
    await waitFor(() => expect(completionCalls()).toHaveLength(1));

    // Finishing an episode is an activity, not a feeling and not a resonance.
    const written = fetchSpy.mock.calls.filter((c) =>
      /\/(mood|resonances|emotional-map)/.test(String(c[0])),
    );
    expect(written).toHaveLength(0);
  });
});

/**
 * The honest gap.
 *
 * `media_started` does not exist yet: `LearningEventKind` is a PostgreSQL enum
 * and the client may only invoke domain commands, so recording a start needs a
 * new enum value, a migration and a new command route — none of which belong
 * in a test-only change. This test states the current truth so that adding a
 * start signal has to come here and say so, rather than arriving unnoticed.
 */
describe("MEDIA_STARTED — not recorded today", () => {
  it("plays without reporting a start to anything", async () => {
    const audio = await openPodcast([AUDIOBOOK, PODCAST]);

    fireEvent.play(audio);
    fireEvent.timeUpdate(audio);
    await settle();

    const started = fetchSpy.mock.calls.filter((c) =>
      /(start|played|progress|heartbeat)/i.test(String(c[0])),
    );
    expect(started).toHaveLength(0);

    // And nothing periodic: no progress ticks while the audio advances.
    fireEvent.timeUpdate(audio);
    fireEvent.timeUpdate(audio);
    await settle();
    expect(
      fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/lector/")),
    ).toHaveLength(1); // the one `/access` call, and nothing else
  });
});
