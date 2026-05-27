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
 * DeepgramProvider — Deepgram REST API.
 *
 * Docs: https://developers.deepgram.com/reference/listen-file
 *
 * Why we hit the HTTP endpoint directly (no SDK): same as Whisper — fewer
 * dependencies, easier to mock, and the request shape is one POST with a
 * binary body. We use the `nova-3` model (best Spanish quality as of
 * 2026-05) with `smart_format=true` to get punctuated text.
 *
 * Response shape (relevant fields):
 *   {
 *     "metadata": { "duration": 23.4, ... },
 *     "results": {
 *       "channels": [{
 *         "alternatives": [{
 *           "transcript": "Hola mundo",
 *           "confidence": 0.98,
 *           "detected_language": "es-419"
 *         }]
 *       }]
 *     }
 *   }
 */
@Injectable()
export class DeepgramProvider implements IVoiceProvider {
  readonly name = "deepgram" as const;
  private readonly logger = new Logger(DeepgramProvider.name);
  private static readonly ENDPOINT = "https://api.deepgram.com/v1/listen";
  private static readonly MODEL = "nova-3";

  constructor(private readonly config: ConfigService<Env, true>) {}

  async transcribe(
    input: VoiceTranscribeInput,
  ): Promise<VoiceTranscribeResult> {
    const apiKey = this.config.get("DEEPGRAM_API_KEY", { infer: true });
    if (!apiKey) {
      throw new BadGatewayException("VOICE_PROVIDER_NOT_CONFIGURED");
    }

    const params = new URLSearchParams({
      model: DeepgramProvider.MODEL,
      smart_format: "true",
      punctuate: "true",
    });
    if (input.language) {
      params.set("language", input.language);
    } else {
      // Without a hint, ask Deepgram to detect — handy because the user's
      // preferred language might disagree with the spoken one.
      params.set("detect_language", "true");
    }

    const res = await fetch(
      `${DeepgramProvider.ENDPOINT}?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": input.mimeType || "audio/webm",
        },
        // fetch accepts ArrayBuffer-like bodies; pass the underlying buffer.
        body: new Uint8Array(input.audio),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      this.logger.error(`Deepgram API ${res.status}: ${errText}`);
      throw new BadGatewayException(`DEEPGRAM_HTTP_${res.status}`);
    }

    const payload = (await res.json()) as {
      metadata?: { duration?: number };
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            detected_language?: string;
          }>;
          detected_language?: string;
        }>;
      };
    };

    const alt = payload.results?.channels?.[0]?.alternatives?.[0];
    const duration = payload.metadata?.duration;
    if (
      !alt ||
      typeof alt.transcript !== "string" ||
      typeof duration !== "number"
    ) {
      this.logger.error(
        `Deepgram returned unexpected shape: ${JSON.stringify(payload).slice(0, 200)}`,
      );
      throw new BadGatewayException("DEEPGRAM_INVALID_RESPONSE");
    }

    return {
      transcript: alt.transcript.trim(),
      durationSec: duration,
      language:
        input.language ??
        alt.detected_language ??
        payload.results?.channels?.[0]?.detected_language ??
        "es",
    };
  }
}
