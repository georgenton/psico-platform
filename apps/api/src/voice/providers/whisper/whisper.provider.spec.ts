import { BadGatewayException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhisperProvider } from "./whisper.provider";

// We use an `unset` sentinel rather than a defaulted-undefined param because
// JS's default-parameter syntax replaces `undefined` with the default — so
// makeConfig(undefined) would erroneously yield "sk-stub". An explicit sentinel
// makes the "missing key" case unambiguous.
const UNSET = Symbol("unset");
function makeConfig(apiKey: string | typeof UNSET = "sk-stub") {
  return {
    get: vi.fn().mockReturnValue(apiKey === UNSET ? undefined : apiKey),
  };
}

describe("WhisperProvider", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Stub the global fetch for every test. Each test sets its return value.
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts multipart audio + model + language to the Whisper endpoint", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          text: "hola mundo",
          duration: 23.4,
          language: "spanish",
        }),
    });
    const provider = new WhisperProvider(makeConfig() as never);

    const result = await provider.transcribe({
      audio: Buffer.from("audio-bytes"),
      mimeType: "audio/webm",
      language: "es",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-stub",
    );
    // FormData body — present and well-formed.
    expect(init.body).toBeInstanceOf(FormData);

    expect(result.transcript).toBe("hola mundo");
    expect(result.durationSec).toBe(23.4);
    // Language: hint overrides detected name when provided.
    expect(result.language).toBe("es");
  });

  it("normalises 'spanish' → 'es' when no language hint is given", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          text: "x",
          duration: 1,
          language: "spanish",
        }),
    });
    const provider = new WhisperProvider(makeConfig() as never);
    const result = await provider.transcribe({
      audio: Buffer.from("x"),
      mimeType: "audio/webm",
    });
    expect(result.language).toBe("es");
  });

  it("throws BadGateway when OPENAI_API_KEY is missing", async () => {
    const provider = new WhisperProvider(makeConfig(UNSET) as never);
    await expect(
      provider.transcribe({
        audio: Buffer.from("x"),
        mimeType: "audio/webm",
      }),
    ).rejects.toThrow(BadGatewayException);
  });

  it("throws BadGateway with status code when the API returns non-OK", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: () => Promise.resolve("upstream down"),
    });
    const provider = new WhisperProvider(makeConfig() as never);
    await expect(
      provider.transcribe({
        audio: Buffer.from("x"),
        mimeType: "audio/webm",
      }),
    ).rejects.toThrow(/WHISPER_HTTP_503/);
  });

  it("throws BadGateway when the payload is missing expected fields", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "x" }), // missing duration
    });
    const provider = new WhisperProvider(makeConfig() as never);
    await expect(
      provider.transcribe({
        audio: Buffer.from("x"),
        mimeType: "audio/webm",
      }),
    ).rejects.toThrow(/WHISPER_INVALID_RESPONSE/);
  });
});
