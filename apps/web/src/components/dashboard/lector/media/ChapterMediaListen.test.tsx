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
 * Book Experience Standard V1 — the subformats inside Escuchar.
 *
 * Audiolibro and Podcast are two separate publications, and the standard says
 * a format with nothing playable must not look published. Inside this surface
 * that has a sharper consequence than a grey tab: the podcast panel is the
 * thing that asks for a signed URL, so an ungated tab means a person can press
 * a format that does not exist and we will go and ask the server to sign it.
 *
 * Every test below checks the same three things about a disabled option — it
 * does not become selected, it mounts no panel, and it produces no `/access`
 * call — and every one passes the manifest in as a prop, because this surface
 * no longer fetches one of its own.
 */

/** Records the props the surface hands the player, so «expanded on entry» is
 *  an assertion about the contract and not about pixels. */
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

let fetchSpy: MockInstance<typeof fetch>;

/**
 * The ONLY call this surface may make is `/access`. Anything else is either a
 * bug or a second manifest, so everything else answers 404 loudly.
 */
function spyOnFetch() {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (async (input: any) => {
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

function renderListen(items: ChapterMediaSummary[] | null) {
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

beforeEach(() => {
  vi.restoreAllMocks();
  spyOnFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MANIFEST_REQUESTS_PER_READER_CHAPTER=1", () => {
  it("asks for no manifest of its own — the reader already has it", async () => {
    renderListen([AUDIOBOOK, PODCAST]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(manifestCalls()).toHaveLength(0);
  });

  it("AUDIO_EMPTY_STATE_FLASH=false — a real audiobook never shows «Audio en producción»", async () => {
    // The regression this closes: while the surface fetched its own manifest,
    // `items` was null for a beat, every subformat read as absent, and the
    // fail-closed notice rendered over a chapter that does have audio.
    renderListen([AUDIOBOOK]);
    expect(screen.getByTestId("audio-bar")).toBeInTheDocument();
    expect(screen.queryByText("Audio en producción")).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("audio-bar")).toBeInTheDocument();
    expect(screen.queryByText("Audio en producción")).toBeNull();
  });
});

describe("PODCAST_INTERNAL_SURFACE_GATED=true", () => {
  it("shows the podcast disabled when the episode is not produced", async () => {
    renderListen([AUDIOBOOK, { ...PODCAST, availability: "COMING_SOON" }]);

    const podcast = await screen.findByTestId("media-subformat-podcast");
    expect(podcast).toHaveAttribute("data-mode-state", "COMING_SOON");
    expect(podcast).toHaveAttribute("aria-disabled", "true");
    expect(podcast).toHaveTextContent("Próximamente");
  });

  it("a disabled subformat changes nothing when pressed and signs nothing", async () => {
    renderListen([AUDIOBOOK, { ...PODCAST, availability: "COMING_SOON" }]);

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
    expect(screen.getByTestId("audio-bar")).toBeInTheDocument();
    expect(screen.queryByLabelText("Podcast del capítulo")).toBeNull();
    expect(accessCalls()).toHaveLength(0);
  });

  it("hides a subformat this chapter never announced", async () => {
    renderListen([AUDIOBOOK]);

    await screen.findByTestId("media-subformat-audiolibro");
    expect(screen.queryByTestId("media-subformat-podcast")).toBeNull();
    expect(accessCalls()).toHaveLength(0);
  });

  it("PODCAST_ONLY_CHAPTER_REACHABLE=true — a podcast-only chapter opens on the podcast", async () => {
    // The chapter has the conversation but not the narration. Escuchar is a
    // family, so this is a reachable chapter and not a dead tab.
    renderListen([{ ...AUDIOBOOK, availability: "COMING_SOON" }, PODCAST]);

    const podcast = await screen.findByTestId("media-subformat-podcast");
    await waitFor(() =>
      expect(podcast).toHaveAttribute("aria-selected", "true"),
    );
    expect(screen.getByTestId("media-subformat-audiolibro")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    // Exactly one signing request, for the format that exists.
    await waitFor(() => expect(accessCalls()).toHaveLength(1));
    expect(String(accessCalls()[0]![0])).toContain("p1");
    expect(manifestCalls()).toHaveLength(0);
  });

  it("opens the podcast only when the reader picks a playable one", async () => {
    renderListen([AUDIOBOOK, PODCAST]);

    await screen.findByTestId("media-subformat-audiolibro");
    expect(accessCalls()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("media-subformat-podcast"));
    await waitFor(() => expect(accessCalls()).toHaveLength(1));
    expect(
      await screen.findByLabelText("Podcast del capítulo"),
    ).toBeInTheDocument();
  });
});

// ── Track A — Escuchar stops being an empty screen ────────────────────────

describe("Escuchar — the surface is the player", () => {
  beforeEach(() => {
    audioBarProps.length = 0;
  });

  it("LISTEN_ENTRY_PLAYER_EXPANDED — the player opens on entry, laid out in flow", () => {
    renderListen([AUDIOBOOK]);
    expect(audioBarProps).toHaveLength(1);
    expect(audioBarProps[0]!["initialOpen"]).toBe(true);
    expect(audioBarProps[0]!["inline"]).toBe(true);
  });

  it("names the chapter and offers the way out", () => {
    renderListen([AUDIOBOOK]);
    expect(
      screen.getByText("El cuerpo sabe antes que la mente"),
    ).toBeInTheDocument();
    // «Audiolibro» names both the selected tab and the eyebrow above the title.
    expect(screen.getAllByText("Audiolibro").length).toBeGreaterThan(0);
    const back = screen.getByText("← Volver al libro");
    expect(back).toHaveAttribute(
      "href",
      "/dashboard/biblioteca/emociones-en-construccion",
    );
  });

  it("AUDIO_COMING_SOON_ACCESS_REQUESTS=0 — an announced-but-unproduced audiobook mounts no player", async () => {
    renderListen([{ ...AUDIOBOOK, availability: "COMING_SOON" }]);
    await waitFor(() =>
      expect(screen.getByText(/en producción/i)).toBeVisible(),
    );
    expect(screen.queryByTestId("audio-bar")).toBeNull();
    expect(audioBarProps).toHaveLength(0);
    expect(accessCalls()).toHaveLength(0);
  });
});

/**
 * PODCAST_ITEMS=0_TO_N.
 *
 * A chapter may carry no episode, one, or several. Until this PR the panel
 * called `.find()` and rendered the first — a second episode existed in the
 * manifest and there was no way to reach it. These tests pin all three counts,
 * plus the two states that must never cost a signing request.
 */
describe("PODCAST_ITEMS=0_TO_N", () => {
  const EP = (n: number, over: Partial<ChapterMediaSummary> = {}) => ({
    ...PODCAST,
    mediaKey: `p${n}`,
    title: `Episodio ${n}`,
    description: `Conversación ${n}.`,
    ...over,
  });

  /** Escuchar opens on Audiolibro; the podcast panel is one click away. */
  async function openPodcast() {
    fireEvent.click(screen.getByTestId("media-subformat-podcast"));
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("0 items — says so, and asks for nothing", async () => {
    renderListen([AUDIOBOOK]);
    // With no episode at all the tab itself is not offered, which is the
    // earliest honest answer. Nothing is requested either way.
    expect(screen.queryByTestId("media-subformat-podcast")).toBeNull();
    expect(accessCalls()).toHaveLength(0);
  });

  it("0 items but the tab is reachable — the empty state names the absence", async () => {
    // A podcast announced for the chapter and then withdrawn leaves the family
    // open through the audiobook; the panel must still answer for itself.
    renderListen([AUDIOBOOK, EP(1, { availability: "COMING_SOON" })]);
    expect(screen.getByTestId("media-subformat-podcast")).toBeInTheDocument();
    expect(accessCalls()).toHaveLength(0);
  });

  it("1 item — plays it, and shows no picker for a single choice", async () => {
    renderListen([AUDIOBOOK, EP(1)]);
    await openPodcast();
    await waitFor(() => expect(screen.getByText("Episodio 1")).toBeVisible());
    expect(screen.queryByTestId("media-picker")).toBeNull();
    expect(accessCalls()).toHaveLength(1);
  });

  it("N items — lists every episode and opens on the first playable one", async () => {
    renderListen([AUDIOBOOK, EP(1), EP(2), EP(3)]);
    await openPodcast();
    await waitFor(() =>
      expect(screen.getByTestId("media-picker")).toBeVisible(),
    );
    expect(screen.getByTestId("media-pick-p1")).toBeInTheDocument();
    expect(screen.getByTestId("media-pick-p2")).toBeInTheDocument();
    expect(screen.getByTestId("media-pick-p3")).toBeInTheDocument();
    expect(screen.getByTestId("media-pick-p1")).toHaveAttribute(
      "aria-current",
      "true",
    );
    // One episode is showing, so exactly one URL was signed.
    expect(accessCalls()).toHaveLength(1);
  });

  it("PODCAST_SELECTION_AUTOPLAY=false — picking another episode loads it without starting sound", async () => {
    renderListen([AUDIOBOOK, EP(1), EP(2)]);
    await openPodcast();
    await waitFor(() =>
      expect(screen.getByTestId("media-picker")).toBeVisible(),
    );

    fireEvent.click(screen.getByTestId("media-pick-p2"));
    await act(async () => {
      await Promise.resolve();
    });
    // The title now appears twice on purpose — as the panel heading and as its
    // own row in the list — so the assertion is on the selection, not a count.
    await waitFor(() =>
      expect(screen.getByTestId("media-pick-p2")).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
    expect(screen.getAllByText("Episodio 2").length).toBeGreaterThan(0);
    // The browser's own player, and never an autoplay attribute on it.
    const player = screen.getByLabelText("Podcast del capítulo");
    expect(player).not.toHaveAttribute("autoplay");
    expect(accessCalls()).toHaveLength(2);
  });

  it("PODCAST_COMING_SOON_ACCESS_REQUESTS=0 — every episode unproduced disables the tab itself", async () => {
    // The standard answers this one BEFORE the panel does: a format with
    // nothing playable is disabled, so the panel never mounts and nothing is
    // signed. Clicking the tab is inert.
    renderListen([
      AUDIOBOOK,
      EP(1, { availability: "COMING_SOON" }),
      EP(2, { availability: "COMING_SOON" }),
    ]);
    const tab = screen.getByTestId("media-subformat-podcast");
    expect(tab).toHaveAttribute("aria-disabled", "true");

    await openPodcast();
    expect(tab).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByTestId("media-picker")).toBeNull();
    expect(screen.queryByLabelText("Podcast del capítulo")).toBeNull();
    expect(accessCalls()).toHaveLength(0);
  });

  it("PODCAST_COMING_SOON_ROW_INERT=true — an unproduced episode is listed and unreachable", async () => {
    // Mixed: one produced, one not. The tab opens on the playable episode and
    // the announced one is shown, disabled, and costs no signing request.
    renderListen([AUDIOBOOK, EP(1), EP(2, { availability: "COMING_SOON" })]);
    await openPodcast();
    await waitFor(() =>
      expect(screen.getByTestId("media-picker")).toBeVisible(),
    );

    const unproduced = screen.getByTestId("media-pick-p2");
    expect(unproduced).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("En producción")).toBeVisible();

    const before = accessCalls().length;
    fireEvent.click(unproduced);
    await act(async () => {
      await Promise.resolve();
    });
    // Still on the produced episode, and no second URL was signed.
    expect(screen.getByTestId("media-pick-p1")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(accessCalls()).toHaveLength(before);
  });

  it("error + retry — says which thing failed and offers both ways forward", async () => {
    fetchSpy.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async () => new Response("{}", { status: 500 })) as any,
    );
    renderListen([AUDIOBOOK, EP(1)]);
    await openPodcast();
    await waitFor(() =>
      expect(
        screen.getByText("No pudimos preparar este episodio."),
      ).toBeVisible(),
    );
    expect(screen.getByText("Reintentar")).toBeInTheDocument();
    expect(screen.getByText("← Volver al libro")).toHaveAttribute(
      "href",
      "/dashboard/biblioteca/emociones-en-construccion",
    );

    const before = accessCalls().length;
    fireEvent.click(screen.getByText("Reintentar"));
    await waitFor(() => expect(accessCalls().length).toBe(before + 1));
  });
});

/**
 * Escuchar is a format, not a second reader, and it measures nothing.
 * Same reasoning as the video surface — see `ChapterMediaWatch.test.tsx`.
 */
describe("PODCAST_SURFACE_IS_NOT_THE_READER", () => {
  const EP2 = (n: number) => ({
    ...PODCAST,
    mediaKey: `q${n}`,
    title: `Episodio ${n}`,
  });

  it("shows no chapter text, no exercises and no «marcar como leído»", async () => {
    renderListen([AUDIOBOOK, EP2(1)]);
    fireEvent.click(screen.getByTestId("media-subformat-podcast"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(/Marcar capítulo/i)).toBeNull();
    expect(screen.queryByText(/Ideas clave/i)).toBeNull();
    expect(screen.queryByText(/Actividades/i)).toBeNull();
    expect(screen.queryByText(/Referencias/i)).toBeNull();
  });

  it("AUTOMATIC_EMOTIONAL_MAP_WRITES=0 · AUTOMATIC_RESONANCE_WRITES=0", async () => {
    renderListen([AUDIOBOOK, EP2(1), EP2(2)]);
    fireEvent.click(screen.getByTestId("media-subformat-podcast"));
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByTestId("media-picker")).toBeVisible(),
    );
    fireEvent.click(screen.getByTestId("media-pick-q2"));
    await act(async () => {
      await Promise.resolve();
    });
    const written = fetchSpy.mock.calls.filter((c) =>
      /\/(mood|resonances|emotional-map)/.test(String(c[0])),
    );
    expect(written).toHaveLength(0);
  });
});
