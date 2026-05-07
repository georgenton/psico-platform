import { Module } from "@nestjs/common";
import { AIController } from "./ai.controller";
import { AIService } from "./ai.service";
import { IngestService } from "./ingest.service";
import { EmbeddingService } from "./embedding/embedding.service";
import { VectorStoreService } from "./vector-store/vector-store.service";

@Module({
  controllers: [AIController],
  providers: [AIService, IngestService, EmbeddingService, VectorStoreService],
  exports: [AIService, EmbeddingService, VectorStoreService],
})
export class AIModule {}
