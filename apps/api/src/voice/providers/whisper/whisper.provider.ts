import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../config";
import type {
  IVoiceProvider,
  VoiceTranscribeInput,
  VoiceTranscribeResult,
} from "../voice-provider.interface";

/**
 * WhisperProvider — OpenAI Whisper v1 API.
 *
 * Docs: https://platform.openai.com/docs/api-reference/audio/createTranscription
 *
 * Why we hit the HTTP endpoint directly instead of `openai` npm SDK:
 *   - We already need `fetch` + `FormData` for the multipart upload.
 *   - The SDK adds ~30 KB to the bundle and pins a specific Node version.
 *   - A single HTTP call is easy to mock in unit tests.
 *
 * Response shape (we request `response_format=verbose_json` to get the
 * duration field):
 *   {
 *     "text": "Hola mundo",
 *     "language": "spanish",   // ← NOT ISO; we map back to "es"
 *     "duration": 23.4,
 *     "segments": [...]
 *   }
 */
@Injectable()
export class WhisperProvider implements IVoiceProvider {
  readonly name = "whisper" as const;
  private readonly logger = new Logger(WhisperProvider.name);
  private static readonly ENDPOINT =
    "https://api.openai.com/v1/audio/transcriptions";
  private static readonly MODEL = "whisper-1";

  constructor(private readonly config: ConfigService<Env, true>) {}

  async transcribe(
    input: VoiceTranscribeInput,
  ): Promise<VoiceTranscribeResult> {
    const apiKey = this.config.get("OPENAI_API_KEY", { infer: true });
    if (!apiKey) {
      // Schema validation should have caught this, but a defensive check
      // here surfaces a clearer error if the user toggles VOICE_PROVIDER
      // post-boot via a sidecar (which envSchema doesn't re-check).
      throw new BadGatewayException("VOICE_PROVIDER_NOT_CONFIGURED");
    }

    const form = new FormData();
    form.append(
      "file",
      // We construct a Blob explicitly so `fetch`'s FormData propagates the
      // declared mimeType to OpenAI. Without this, OpenAI infers from the
      // filename extension and sometimes guesses wrong (especially for opus).
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType }),
      this.fileNameFor(input.mimeType),
    );
    form.append("model", WhisperProvider.MODEL);
    form.append("response_format", "verbose_json");
    if (input.language) form.append("language", input.language);

    const res = await fetch(WhisperProvider.ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      this.logger.error(`Whisper API ${res.status}: ${errText}`);
      throw new BadGatewayException(`WHISPER_HTTP_${res.status}`);
    }

    const payload = (await res.json()) as {
      text?: string;
      duration?: number;
      language?: string;
    };

    if (
      typeof payload.text !== "string" ||
      typeof payload.duration !== "number"
    ) {
      this.logger.error(
        `Whisper returned unexpected shape: ${JSON.stringify(payload).slice(0, 200)}`,
      );
      throw new BadGatewayException("WHISPER_INVALID_RESPONSE");
    }

    return {
      transcript: payload.text.trim(),
      durationSec: payload.duration,
      // Whisper returns full names ("spanish") — normalise to ISO 639-1.
      language: this.normaliseLanguage(payload.language, input.language),
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private fileNameFor(mime: string): string {
    // Whisper requires a filename so it can dispatch the codec parser.
    if (mime.includes("webm")) return "audio.webm";
    if (mime.includes("ogg")) return "audio.ogg";
    if (mime.includes("mp4") || mime.includes("m4a")) return "audio.m4a";
    if (mime.includes("wav")) return "audio.wav";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "audio.mp3";
    return "audio.bin";
  }

  private normaliseLanguage(
    detected: string | undefined,
    hint: string | null | undefined,
  ): string {
    if (hint) return hint;
    if (!detected) return "es"; // sensible default for our market
    const map: Record<string, string> = {
      spanish: "es",
      english: "en",
      portuguese: "pt",
    };
    return map[detected.toLowerCase()] ?? detected;
  }
}
