import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  PayloadTooLargeException,
  Post,
  Query,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TranscribeQueryDto } from "./dto/transcribe-query.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { VoiceService } from "./voice.service";

/**
 * Max audio bytes accepted on `/voz/transcribe`. Per docs/informes/
 * sprint-s8-voice.md §3 decision #3 we cap at Whisper's native limit
 * (25 MB ≈ 15-20 minutes of voice) rather than implement server-side
 * chunking — the design's 60 MB target lives as v2 deuda.
 */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Allowed mime types. Mobile webview produces `audio/webm` (Chrome),
 * `audio/mp4` (Safari), and `audio/ogg` (Firefox). We also accept WAV and
 * MP3 because some desktop browsers fall back to them and Whisper supports
 * all of them natively.
 */
const ALLOWED_MIME_PREFIXES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
];

@ApiTags("Voice")
@ApiBearerAuth("bearer")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto })
@ApiTooManyRequestsResponse({ type: ErrorEnvelopeDto })
@Controller("voz")
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  /**
   * Audio in (multipart `audio` field), transcript out. Plan-gated at the
   * service layer (FREE → 403 VOICE_REQUIRES_PRO; quota exhausted →
   * 402 VOICE_QUOTA_EXCEEDED) and rate-limited here to 10/min/user — voice
   * transcription is expensive both server-side and at the provider, so
   * we cap aggressively even for Pro users.
   */
  @Post("transcribe")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor("audio", {
      limits: { fileSize: MAX_AUDIO_BYTES },
    }),
  )
  async transcribe(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() audio: Express.Multer.File | undefined,
    @Query() query: TranscribeQueryDto,
  ) {
    if (!audio) {
      throw new BadRequestException("AUDIO_REQUIRED");
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      // Multer enforces the cap with its own error (LIMIT_FILE_SIZE) but
      // double-check here so the message is consistent with our envelope.
      throw new PayloadTooLargeException("AUDIO_TOO_LARGE");
    }
    if (!ALLOWED_MIME_PREFIXES.some((p) => audio.mimetype.startsWith(p))) {
      throw new UnsupportedMediaTypeException(
        `AUDIO_UNSUPPORTED_MIME:${audio.mimetype}`,
      );
    }

    return this.voiceService.transcribe(
      user.userId,
      audio.buffer,
      audio.mimetype,
      query.language,
    );
  }

  /**
   * `/voz/usage` from docs/design/handoff/07-voz.md. v1 is informational —
   * the server already counted seconds on `/transcribe`. The client posts
   * its own measurement so the server can cross-check and return the
   * authoritative remaining-minutes value back.
   */
  @Post("usage")
  @HttpCode(HttpStatus.OK)
  reportUsage(@CurrentUser() user: AuthenticatedUser, @Body() _body: unknown) {
    return this.voiceService.reportUsage(user.userId);
  }
}
