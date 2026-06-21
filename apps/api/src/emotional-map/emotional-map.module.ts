import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { PrismaModule } from "../prisma";
import { RedisModule } from "../redis";
import { EmotionalMapController } from "./emotional-map.controller";
import { EmotionalMapService } from "./emotional-map.service";
import { AnthropicEmotionalMapProvider } from "./providers/anthropic.provider";
import type { IEmotionalMapProvider } from "./providers/provider.interface";
import { EMOTIONAL_MAP_PROVIDER } from "./tokens";

/**
 * EmotionalMapModule — Sprint D.
 *
 * Adapter pattern (env-selected): `EMOTIONAL_MAP_PROVIDER=anthropic` is the
 * default. Future custom-trained models register here without touching the
 * service or controller.
 */
@Module({
  imports: [ConfigModule, PrismaModule, RedisModule],
  controllers: [EmotionalMapController],
  providers: [
    AnthropicEmotionalMapProvider,
    {
      provide: EMOTIONAL_MAP_PROVIDER,
      inject: [ConfigService, AnthropicEmotionalMapProvider],
      useFactory: (
        config: ConfigService,
        anthropic: AnthropicEmotionalMapProvider,
      ): IEmotionalMapProvider => {
        const name = (
          config.get<string>("EMOTIONAL_MAP_PROVIDER") ?? "anthropic"
        ).toLowerCase();
        switch (name) {
          case "anthropic":
            return anthropic;
          default:
            throw new Error(
              `Unknown EMOTIONAL_MAP_PROVIDER="${name}". Valid: anthropic.`,
            );
        }
      },
    },
    EmotionalMapService,
  ],
  exports: [EmotionalMapService],
})
export class EmotionalMapModule {}
