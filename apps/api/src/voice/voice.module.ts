import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { SubscriptionModule } from "../subscription/subscription.module";
import { DeepgramProvider } from "./providers/deepgram/deepgram.provider";
import {
  DEEPGRAM_PROVIDER,
  WHISPER_PROVIDER,
} from "./providers/voice-provider.interface";
import { WhisperProvider } from "./providers/whisper/whisper.provider";
import { VoiceController } from "./voice.controller";
import { VoiceService } from "./voice.service";

/**
 * VoiceModule — Sprint S8.
 *
 * Imports SubscriptionModule because we depend on `UsageService` for the
 * cache-bust after each successful transcription. SubscriptionModule
 * already exports UsageService.
 */
@Module({
  imports: [PrismaModule, SubscriptionModule],
  controllers: [VoiceController],
  providers: [
    { provide: WHISPER_PROVIDER, useClass: WhisperProvider },
    { provide: DEEPGRAM_PROVIDER, useClass: DeepgramProvider },
    VoiceService,
  ],
  exports: [VoiceService],
})
export class VoiceModule {}
