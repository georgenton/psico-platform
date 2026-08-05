import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import type { LectorAudioResponse } from "@psico/types";
import { AudioBar } from "./AudioBar";

/**
 * Tests for the web AudioBar component.
 *
 * Covers the 5 fetch-state branches (loading / pro_required / not_found /
 * other / ready), the artwork render branches (real URL vs gradient token),
 * the speed chip toggle, and the sleep timer state machine.
 *
 * Mocks the global `fetch` because the component uses it directly (not
 * `apiClient`) — auth via Bearer header is required because /lector/*
 * needs the session token.
 */

const baseAudioResponse: LectorAudioResponse = {
  url: "https://r2.example/audio.m4a?token=stub",
  durationSec: 600,
  transcript: [],
  metadata: {
    title: "Cap. 1 · El primer paso",
    subtitle: "Emociones en Construcción",
    artist: "Marina Quintana",
    artworkUrl: "https://cdn.example/cover.png",
  },
};

function fetchOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function fetchStatus(status: number): Response {
  return new Response("{}", { status });
}

const renderBar = () =>
  render(
    <AudioBar
      apiBase="https://api.example/api"
      token="bearer-stub"
      bookId="emociones-en-construccion"
      chapterOrder={1}
    />,
  );

describe("AudioBar — pill toggle", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("renders the closed pill on mount with no fetch", () => {
    renderBar();
    const pill = screen.getByRole("button", { name: /abrir audio/i });
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent(/🔊 Audio/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("triggers a single fetch when the user opens the bar", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toContain("/lector/emociones-en-construccion/1/audio");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer bearer-stub",
    });
  });
});

describe("AudioBar — fetch state branches", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("renders the Pro upsell on 403", async () => {
    fetchSpy.mockResolvedValue(fetchStatus(403));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    expect(
      await screen.findByText(/Audio disponible en Pro/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver planes/i })).toHaveAttribute(
      "href",
      "/dashboard/plan",
    );
  });

  it("renders the not-found copy on 404", async () => {
    fetchSpy.mockResolvedValue(fetchStatus(404));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    expect(
      await screen.findByText(/este capítulo aún no tiene audio/i),
    ).toBeInTheDocument();
  });

  it("renders the retry CTA on network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network"));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    expect(
      await screen.findByText(/no pudimos cargar el audio/i),
    ).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /reintentar/i });

    // Retry attempts the fetch again; we resolve OK on the second go.
    fetchSpy.mockResolvedValueOnce(fetchOk(baseAudioResponse));
    fireEvent.click(retry);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});

describe("AudioBar — metadata rendering", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("renders artwork as <img> when artworkUrl is an http URL", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    const img = await screen.findByAltText(/portada de emociones/i);
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "https://cdn.example/cover.png");
  });

  it("renders the gradient fallback when artworkUrl is a token", async () => {
    fetchSpy.mockResolvedValue(
      fetchOk({
        ...baseAudioResponse,
        metadata: { ...baseAudioResponse.metadata, artworkUrl: "warm" },
      }),
    );
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    // Title text still renders even when artwork is a gradient.
    expect(
      await screen.findByText(/Cap\. 1 · El primer paso/),
    ).toBeInTheDocument();
    // No <img> should be present — the gradient is rendered as a <div>.
    expect(screen.queryByAltText(/portada/i)).not.toBeInTheDocument();
  });

  it("renders subtitle + artist below the title", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    expect(
      await screen.findByText(/Emociones en Construcción · Marina Quintana/),
    ).toBeInTheDocument();
  });

  it("renders the native <audio> element with the signed URL", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    const audio = await screen.findByLabelText("Audio del capítulo");
    expect(audio.tagName).toBe("AUDIO");
    expect(audio).toHaveAttribute(
      "src",
      "https://r2.example/audio.m4a?token=stub",
    );
  });
});

describe("AudioBar — speed control", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("renders all 4 speed chips with 1× active by default", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    const chip1x = await screen.findByRole("button", { name: /^1×$/ });
    expect(chip1x).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^0.75×$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /^1.25×$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /^1.5×$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("flips aria-pressed when the user picks a different speed", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    const fastChip = await screen.findByRole("button", { name: /^1.5×$/ });
    fireEvent.click(fastChip);
    expect(fastChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^1×$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("AudioBar — sleep timer", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.useFakeTimers();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it("renders Off as the active sleep preset by default", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    // The fetch resolves on a microtask; flush it then run timers.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const off = screen.getByRole("button", { name: /^Off$/ });
    expect(off).toHaveAttribute("aria-pressed", "true");
  });

  it("arms a countdown when the user picks a sleep preset", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: /^15m$/ }));
    expect(screen.getByRole("button", { name: /^15m$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Countdown label "Temporizador · 15:00" appears.
    expect(screen.getByText(/Temporizador.*15:0/)).toBeInTheDocument();
  });
});

// ── Track A — the player as the Escuchar surface itself ───────────────────

describe("AudioBar — mounted as the surface", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const renderInline = () =>
    render(
      <AudioBar
        apiBase="https://api.example/api"
        token="bearer-stub"
        bookId="emociones-en-construccion"
        chapterOrder={1}
        initialOpen
        inline
      />,
    );

  it("LISTEN_ENTRY_PLAYER_EXPANDED=true — opens without a click and drops the pill", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    renderInline();

    // No «Abrir audio» to press: on this surface the player IS the screen.
    expect(screen.queryByRole("button", { name: /abrir audio/i })).toBeNull();
    expect(await screen.findByTestId("audio-player-panel")).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  });

  it("LISTEN_ENTRY_AUTOPLAY=false — the audio is loaded, never started", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    const { container } = renderInline();

    await screen.findByTestId("audio-player-panel");
    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    // Entering a screen must not make sound. Nothing asks it to play, and the
    // browser is told nothing that would.
    expect(audio).not.toHaveAttribute("autoplay");
    expect(audio!.autoplay).toBe(false);
  });

  it("AUDIO_AVAILABLE_ACCESS_REQUESTS=1 — one signed URL per entry, not one per render", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    const { rerender } = renderInline();

    await screen.findByTestId("audio-player-panel");
    rerender(
      <AudioBar
        apiBase="https://api.example/api"
        token="bearer-stub"
        bookId="emociones-en-construccion"
        chapterOrder={1}
        initialOpen
        inline
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ── Scope declaration — what «Escuchar» is, and what it is NOT ────────────

describe("MEDIA_VERTICAL_2_COMPLETE=false", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /**
   * Vertical 2A ships the transcript, and this test moved with it.
   *
   * Before, it pinned that NO segment text was rendered — a true statement
   * then, and the tripwire that was supposed to fire the day someone showed
   * the transcript without building a surface for it. That day is this PR,
   * and the surface exists, so the assertion inverts.
   *
   * What has NOT moved, and is what the flag still means:
   *
   *   PODCAST_IMPLEMENTED=false   the tab is gated, nothing plays
   *   VIDEO_IMPLEMENTED=false     same
   *
   * And the older invariant that outlives both: Escuchar is the audio of the
   * chapter, not a second copy of it. The transcript is the words being read;
   * references and exercises stay in Leer.
   */
  it("shows the transcript, and still refuses to be the reader", async () => {
    const withSegments: LectorAudioResponse = {
      ...baseAudioResponse,
      transcript: [
        { start: 0, end: 12, text: "Empezamos por el cuerpo", blockId: "b-1" },
        { start: 12, end: 30, text: "y después la palabra", blockId: "b-2" },
      ],
    };
    fetchSpy.mockResolvedValue(fetchOk(withSegments));

    const { container } = render(
      <AudioBar
        apiBase="https://api.example/api"
        token="bearer-stub"
        bookId="emociones-en-construccion"
        chapterOrder={1}
        initialOpen
        inline
      />,
    );

    await screen.findByTestId("audio-player-panel");
    const text = container.textContent ?? "";

    // The narration's own words: shown.
    expect(text).toContain("Empezamos por el cuerpo");
    expect(text).toContain("y después la palabra");

    // The chapter's apparatus: not here.
    expect(text).not.toMatch(/referencias bibliogr[áa]ficas/i);
    expect(text).not.toMatch(/ejercicios de este cap/i);
    expect(text).not.toMatch(/ideas? clave/i);
  });
});

describe("INITIAL_OPEN never retries by itself", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const renderInline = () =>
    render(
      <AudioBar
        apiBase="https://api.example/api"
        token="bearer-stub"
        bookId="emociones-en-construccion"
        chapterOrder={1}
        initialOpen
        inline
      />,
    );

  /**
   * A failing chapter must cost ONE request, not a stream of them.
   *
   * The auto-fetch runs from an effect that depends on `fetchAudio`, and
   * `fetchAudio` is rebuilt whenever `loading` changes. On success `data` is
   * set and its own guard stops it; on failure nothing is set, so the effect
   * fires again, and again. A reader without Pro sitting on «Escuchar» would
   * hammer the endpoint for as long as the screen stayed open.
   *
   * Every case below answers the FIRST call with the failure and leaves every
   * later call pending forever. That caps the loop at two requests instead of
   * hanging the test — and makes the count the assertion.
   */
  function failFirstThenHang(fail: () => Response | never) {
    let calls = 0;
    fetchSpy.mockImplementation((async () => {
      calls += 1;
      if (calls === 1) return fail();
      // Never resolves: a second request is already the bug.
      return new Promise<Response>(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
  }

  /** Let the failure settle and give any re-run effect room to fire. */
  async function settle() {
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  const CASES: {
    label: string;
    fail: () => Response | never;
    expected: RegExp;
  }[] = [
    {
      label: "INITIAL_OPEN_403_REQUESTS",
      fail: () => fetchStatus(403),
      expected: /Audio disponible en Pro/,
    },
    {
      label: "INITIAL_OPEN_404_REQUESTS",
      fail: () => fetchStatus(404),
      expected: /aún no tiene audio/,
    },
    {
      label: "INITIAL_OPEN_500_REQUESTS",
      fail: () => fetchStatus(500),
      expected: /No pudimos cargar el audio/,
    },
    {
      label: "INITIAL_OPEN_NETWORK_ERROR_REQUESTS",
      fail: () => {
        throw new TypeError("Failed to fetch");
      },
      expected: /No pudimos cargar el audio/,
    },
  ];

  for (const { label, fail, expected } of CASES) {
    it(`${label}=1 — the failure is shown once and never re-requested`, async () => {
      failFirstThenHang(fail);
      renderInline();

      expect(await screen.findByText(expected)).toBeInTheDocument();
      await settle();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  }

  it("ONE_AUTOMATIC_REQUEST_PER_MOUNT — re-rendering the same bar asks nothing more", async () => {
    // Same instance, same props, after a failure — the state that used to
    // rebuild `fetchAudio` and re-enter the effect.
    failFirstThenHang(() => fetchStatus(500));
    const { rerender } = renderInline();

    await screen.findByText(/No pudimos cargar el audio/);
    for (let i = 0; i < 3; i += 1) {
      rerender(
        <AudioBar
          apiBase="https://api.example/api"
          token="bearer-stub"
          bookId="emociones-en-construccion"
          chapterOrder={1}
          initialOpen
          inline
        />,
      );
      await settle();
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("INITIAL_OPEN_SUCCESS_REQUESTS=1 — a working chapter asks once", async () => {
    fetchSpy.mockResolvedValue(fetchOk(baseAudioResponse));
    renderInline();

    await screen.findByTestId("audio-player-panel");
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("EXPLICIT_RETRY_ADDITIONAL_REQUESTS=1 — the reader can still ask again", async () => {
    // First call fails; the retry succeeds. Nothing in between is automatic.
    let calls = 0;
    fetchSpy.mockImplementation((async () => {
      calls += 1;
      return calls === 1 ? fetchStatus(500) : fetchOk(baseAudioResponse);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    renderInline();
    await screen.findByText(/No pudimos cargar el audio/);
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Reintentar/i }));
    await screen.findByTestId("audio-player-panel");
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("INITIAL_OPEN_AUTOPLAY=false — recovering from an error still does not play", async () => {
    let calls = 0;
    fetchSpy.mockImplementation((async () => {
      calls += 1;
      return calls === 1 ? fetchStatus(500) : fetchOk(baseAudioResponse);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const { container } = renderInline();
    await screen.findByText(/No pudimos cargar el audio/);
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/i }));
    await screen.findByTestId("audio-player-panel");

    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio).not.toHaveAttribute("autoplay");
    expect(audio!.autoplay).toBe(false);
  });
});

// ── Media Vertical 2A — the transcript is visible on Escuchar ─────────────

describe("AUDIOBOOK_TRANSCRIPT_VISIBLE", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const ONE_SEGMENT = [
    { start: 0, end: 600, text: "Empezamos por el cuerpo.", blockId: "b-1" },
  ];

  /** Deliberately out of order, and one with no blockId. */
  const MANY_SEGMENTS = [
    { start: 30, end: 60, text: "y después la palabra.", blockId: null },
    { start: 0, end: 30, text: "Empezamos por el cuerpo.", blockId: "b-1" },
    { start: 60, end: 90, text: "Al final, la pausa.", blockId: "b-3" },
  ];

  const withTranscript = (
    transcript: LectorAudioResponse["transcript"],
  ): LectorAudioResponse => ({ ...baseAudioResponse, transcript });

  const renderInline = () =>
    render(
      <AudioBar
        apiBase="https://api.example/api"
        token="bearer-stub"
        bookId="emociones-en-construccion"
        chapterOrder={1}
        initialOpen
        inline
      />,
    );

  const renderHeaderBar = () =>
    render(
      <AudioBar
        apiBase="https://api.example/api"
        token="bearer-stub"
        bookId="emociones-en-construccion"
        chapterOrder={1}
      />,
    );

  it("shows a single-segment transcript", async () => {
    fetchSpy.mockResolvedValue(fetchOk(withTranscript(ONE_SEGMENT)));
    renderInline();

    expect(await screen.findByText("Transcripción")).toBeInTheDocument();
    expect(screen.getByText("Empezamos por el cuerpo.")).toBeInTheDocument();
  });

  it("DYNAMIC_SEGMENT_COUNT — shows N segments, in start order", async () => {
    fetchSpy.mockResolvedValue(fetchOk(withTranscript(MANY_SEGMENTS)));
    renderInline();

    await screen.findByText("Transcripción");
    const rendered = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("data-testid")?.startsWith("transcript-"))
      .map((b) => b.textContent);

    expect(rendered).toHaveLength(3);
    // Sorted by `start`, not by the order the server happened to send.
    expect(rendered[0]).toContain("Empezamos por el cuerpo.");
    expect(rendered[1]).toContain("y después la palabra.");
    expect(rendered[2]).toContain("Al final, la pausa.");
    // …and the timestamps come out ascending.
    expect(rendered[0]).toContain("0:00");
    expect(rendered[1]).toContain("0:30");
    expect(rendered[2]).toContain("1:00");
  });

  it("a segment with no blockId is still shown", async () => {
    fetchSpy.mockResolvedValue(fetchOk(withTranscript(MANY_SEGMENTS)));
    renderInline();

    await screen.findByText("Transcripción");
    // `blockId` is a convenience for scrolling the reader, not a condition
    // for the words existing.
    expect(screen.getByText("y después la palabra.")).toBeInTheDocument();
  });

  it("TRANSCRIPT_EMPTY_STATE — says so instead of inventing text", async () => {
    fetchSpy.mockResolvedValue(fetchOk(withTranscript([])));
    renderInline();

    await screen.findByText("Transcripción");
    expect(
      screen.getByText("Transcripción no disponible para este capítulo."),
    ).toBeInTheDocument();
    // The player is still there — an absent transcript is not a broken screen.
    expect(screen.getByTestId("audio-player-panel")).toBeInTheDocument();
  });

  it("opens expanded on the Escuchar surface and collapses on demand", async () => {
    fetchSpy.mockResolvedValue(fetchOk(withTranscript(ONE_SEGMENT)));
    renderInline();

    const toggle = await screen.findByRole("button", { name: "Ocultar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Transcripción" })).toBeVisible();

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Mostrar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("Empezamos por el cuerpo.")).toBeNull();
  });

  it("starts collapsed in the reader header bar", async () => {
    fetchSpy.mockResolvedValue(fetchOk(withTranscript(ONE_SEGMENT)));
    renderHeaderBar();

    fireEvent.click(screen.getByRole("button", { name: /abrir audio/i }));
    expect(
      await screen.findByRole("button", { name: "Mostrar" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Empezamos por el cuerpo.")).toBeNull();
  });
});

describe("ACTIVE_SEGMENT + SEGMENT_CLICK", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const SEGMENTS = [
    { start: 0, end: 30, text: "Primero.", blockId: "b-1" },
    { start: 30, end: 60, text: "Segundo.", blockId: "b-2" },
  ];

  async function renderWithSegments() {
    fetchSpy.mockResolvedValue(
      fetchOk({ ...baseAudioResponse, transcript: SEGMENTS }),
    );
    const view = render(
      <AudioBar
        apiBase="https://api.example/api"
        token="bearer-stub"
        bookId="emociones-en-construccion"
        chapterOrder={1}
        initialOpen
        inline
      />,
    );
    await screen.findByText("Transcripción");
    const audio = view.container.querySelector("audio")!;
    return { ...view, audio };
  }

  it("marks the segment containing currentTime", async () => {
    const { audio } = await renderWithSegments();

    Object.defineProperty(audio, "currentTime", {
      value: 45,
      configurable: true,
    });
    fireEvent.timeUpdate(audio);

    expect(screen.getByTestId("transcript-segment-1")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByTestId("transcript-segment-0")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("SEGMENT_CLICK_SEEKS — clicking a segment moves the playhead", async () => {
    const { audio } = await renderWithSegments();
    expect(audio.currentTime).toBe(0);

    fireEvent.click(screen.getByTestId("transcript-segment-1"));
    expect(audio.currentTime).toBe(30);
  });

  it("SEGMENT_CLICK_AUTOPLAYS=false — it seeks, it does not start sound", async () => {
    const { audio } = await renderWithSegments();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);

    fireEvent.click(screen.getByTestId("transcript-segment-1"));

    expect(play).not.toHaveBeenCalled();
    expect(audio.autoplay).toBe(false);
    play.mockRestore();
  });

  it("segments are real buttons, reachable by keyboard", async () => {
    await renderWithSegments();
    const seg = screen.getByTestId("transcript-segment-0");
    expect(seg.tagName).toBe("BUTTON");
    expect(seg).not.toHaveAttribute("disabled");
  });
});
