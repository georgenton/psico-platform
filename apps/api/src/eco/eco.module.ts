import { Module } from "@nestjs/common";
import { AIModule } from "../ai";
import { PrismaModule } from "../prisma";
import { EmotionalMapModule } from "../emotional-map";
import { SubscriptionModule } from "../subscription/subscription.module";
import { EcoController } from "./eco.controller";
import { EcoService } from "./eco.service";
import { EcoSuggestionService } from "./eco-suggestions.service";

/**
 * EcoModule — Sprint S10.
 *
 * Imports:
 *   - AIModule exports EmbeddingService + VectorStoreService for RAG.
 *   - SubscriptionModule exports UsageService for the post-message cache bust.
 *   - EmotionalMapModule exports EmotionalMapService — the suggestion engine
 *     reads the user's self-reported "momento" (read-only) to adapt openers.
 */
@Module({
  imports: [PrismaModule, AIModule, SubscriptionModule, EmotionalMapModule],
  controllers: [EcoController],
  providers: [EcoService, EcoSuggestionService],
  exports: [EcoService, EcoSuggestionService],
})
export class EcoModule {}
