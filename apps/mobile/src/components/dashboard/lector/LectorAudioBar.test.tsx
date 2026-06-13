import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { LectorAudioResponse } from "@psico/types";

/**
 * LectorAudioBar tests (Sprint S55-tests).
 *
 * Mocks:
 *   - `expo-av` — `Audio.Sound.createAsync` + `Audio.setAudioModeAsync`
 *     are async natives that boot a real audio session. We stub them
 *     with deterministic returns so the component's `loadAndOpen` path
 *     resolves in jest-expo without crashing.
 *   - `@psico/api-client` — `lectorApi.getAudio` is the network call;
 *     each test sets up the resolved/rejected value it needs.
 *
 * We rely on the global `@expo/vector-icons` mock from `jest.setup.ts`
 * which renders the icon's `name` prop as plain text — this lets us find
 * the pill via the visible "Audio" label rather than the Ionicons SVG.
 */

// jest hoists `jest.mock` factories above any top-level const declarations,
// so the factory cannot reference outer variables UNLESS they're prefixed
// with `mock` (case-insensitive). We follow that convention everywhere
// in this file — same trick the global @expo/vector-icons mock uses.
const mockSetRateAsync = jest.fn().mockResolvedValue(undefined);
const mockPauseAsync = jest.fn().mockResolvedValue(undefined);
const mockPlayAsync = jest.fn().mockResolvedValue(undefined);
const mockUnloadAsync = jest.fn().mockResolvedValue(undefined);
const mockSetAudioModeAsync = jest.fn().mockResolvedValue(undefined);
const mockCreateAsync = jest.fn().mockResolvedValue({
  sound: {
    setRateAsync: mockSetRateAsync,
    pauseAsync: mockPauseAsync,
    playAsync: mockPlayAsync,
    unloadAsync: mockUnloadAsync,
  },
});

jest.mock("expo-av", () => ({
  Audio: {
    Sound: { createAsync: mockCreateAsync },
    setAudioModeAsync: mockSetAudioModeAsync,
  },
  InterruptionModeAndroid: { DuckOthers: 1 },
  InterruptionModeIOS: { DuckOthers: 2 },
}));

jest.mock("@psico/api-client", () => ({
  lectorApi: {
    getAudio: jest.fn(),
  },
}));

// Use `require()` AFTER jest.mock calls so the mocked module is what we
// see in the test scope. Importing at the top would be hoisted by Jest
// such that the import binding resolves to the mock, but for runtime
// `mockResolvedValue` ergonomics (and to keep the file lint-clean
// without needing `as jest.MockedFunction<...>` casts) we require lazily.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const { lectorApi } = require("@psico/api-client");
const { LectorAudioBar } = require("./LectorAudioBar");
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

const baseResponse: LectorAudioResponse = {
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

function renderBar() {
  return render(
    <LectorAudioBar bookId="emociones-en-construccion" chapterOrder={1} />,
  );
}

describe("LectorAudioBar — pill toggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAsync.mockResolvedValue({
      sound: {
        setRateAsync: mockSetRateAsync,
        pauseAsync: mockPauseAsync,
        playAsync: mockPlayAsync,
        unloadAsync: mockUnloadAsync,
      },
    });
  });

  it("renders the closed pill with the Audio label", () => {
    lectorApi.getAudio.mockResolvedValue(baseResponse);
    renderBar();
    expect(screen.getByLabelText("Abrir audio")).toBeOnTheScreen();
    expect(screen.getByText("Audio")).toBeOnTheScreen();
  });

  it("does not call the API on mount", () => {
    lectorApi.getAudio.mockResolvedValue(baseResponse);
    renderBar();
    expect(lectorApi.getAudio).not.toHaveBeenCalled();
    expect(mockCreateAsync).not.toHaveBeenCalled();
  });

  it("fetches + boots the audio session when the user opens the bar", async () => {
    lectorApi.getAudio.mockResolvedValue(baseResponse);
    renderBar();
    fireEvent.press(screen.getByLabelText("Abrir audio"));
    await waitFor(() => {
      expect(lectorApi.getAudio).toHaveBeenCalledWith(
        "emociones-en-construccion",
        1,
      );
    });
    // setAudioModeAsync runs BEFORE Sound.createAsync so the session
    // inherits the background-play mode.
    expect(mockSetAudioModeAsync).toHaveBeenCalled();
    expect(mockCreateAsync).toHaveBeenCalled();
  });
});

describe("LectorAudioBar — fetch state branches", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAsync.mockResolvedValue({
      sound: {
        setRateAsync: mockSetRateAsync,
        pauseAsync: mockPauseAsync,
        playAsync: mockPlayAsync,
        unloadAsync: mockUnloadAsync,
      },
    });
  });

  it("renders the Pro upsell when getAudio rejects with statusCode 403", async () => {
    lectorApi.getAudio.mockRejectedValue({ statusCode: 403 });
    renderBar();
    fireEvent.press(screen.getByLabelText("Abrir audio"));
    expect(
      await screen.findByText(/Audio disponible en Pro/),
    ).toBeOnTheScreen();
  });

  it("renders the not-found copy when getAudio rejects with statusCode 404", async () => {
    lectorApi.getAudio.mockRejectedValue({ statusCode: 404 });
    renderBar();
    fireEvent.press(screen.getByLabelText("Abrir audio"));
    expect(
      await screen.findByText(/este capítulo aún no tiene audio/i),
    ).toBeOnTheScreen();
  });

  it("renders the retry CTA on a generic error", async () => {
    lectorApi.getAudio.mockRejectedValue(new Error("network"));
    renderBar();
    fireEvent.press(screen.getByLabelText("Abrir audio"));
    expect(
      await screen.findByText(/no pudimos cargar el audio/i),
    ).toBeOnTheScreen();
    expect(screen.getByText("Reintentar")).toBeOnTheScreen();
  });
});

describe("LectorAudioBar — metadata rendering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAsync.mockResolvedValue({
      sound: {
        setRateAsync: mockSetRateAsync,
        pauseAsync: mockPauseAsync,
        playAsync: mockPlayAsync,
        unloadAsync: mockUnloadAsync,
      },
    });
  });

  it("renders the title + subtitle/artist line after a successful fetch", async () => {
    lectorApi.getAudio.mockResolvedValue(baseResponse);
    renderBar();
    fireEvent.press(screen.getByLabelText("Abrir audio"));
    expect(
      await screen.findByText("Cap. 1 · El primer paso"),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("Emociones en Construcción · Marina Quintana"),
    ).toBeOnTheScreen();
  });

  it("renders the play button + speed chips once the audio is loaded", async () => {
    lectorApi.getAudio.mockResolvedValue(baseResponse);
    renderBar();
    fireEvent.press(screen.getByLabelText("Abrir audio"));
    await screen.findByLabelText("Reproducir audio");
    expect(screen.getByText("0.75×")).toBeOnTheScreen();
    expect(screen.getByText("1×")).toBeOnTheScreen();
    expect(screen.getByText("1.25×")).toBeOnTheScreen();
    expect(screen.getByText("1.5×")).toBeOnTheScreen();
  });

  it("renders the 4 sleep-timer chips with Off active by default", async () => {
    lectorApi.getAudio.mockResolvedValue(baseResponse);
    renderBar();
    fireEvent.press(screen.getByLabelText("Abrir audio"));
    await screen.findByText("Off");
    expect(screen.getByText("15m")).toBeOnTheScreen();
    expect(screen.getByText("30m")).toBeOnTheScreen();
    expect(screen.getByText("60m")).toBeOnTheScreen();
    // Among the speed + sleep chip buttons, exactly one (Off) is initially
    // selected on the sleep row. The chip's Pressable carries
    // `accessibilityState={{ selected: active }}` so we filter by that.
    const selectedButtons = screen
      .getAllByRole("button")
      .filter((node) => node.props.accessibilityState?.selected === true);
    // Exactly: 1× (speed default) + Off (sleep default) = 2 selected chips.
    expect(selectedButtons).toHaveLength(2);
  });
});
