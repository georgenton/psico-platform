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
