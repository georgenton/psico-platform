import { Module } from "@nestjs/common";
import { AIModule } from "../ai";
import { PrismaModule } from "../prisma";
import { SubscriptionModule } from "../subscription/subscription.module";
import { EcoController } from "./eco.controller";
import { EcoService } from "./eco.service";

/**
 * EcoModule — Sprint S10.
 *
 * Imports:
 *   - AIModule exports EmbeddingService + VectorStoreService for RAG.
 *   - SubscriptionModule exports UsageService for the post-message cache bust.
 */
@Module({
  imports: [PrismaModule, AIModule, SubscriptionModule],
  controllers: [EcoController],
  providers: [EcoService],
  exports: [EcoService],
})
export class EcoModule {}
