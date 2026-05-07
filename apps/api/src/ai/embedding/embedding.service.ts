import { Injectable, Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { VoyageAIClient } from "voyageai";
import type { Env } from "../../config";

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly voyage: VoyageAIClient;

  // voyage-3 produces 1024-dimensional embeddings
  static readonly DIMENSIONS = 1024;
  private static readonly MODEL = "voyage-3";

  constructor(configService: ConfigService<Env, true>) {
    this.voyage = new VoyageAIClient({
      apiKey: configService.get("VOYAGE_API_KEY", { infer: true }),
    });
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.voyage.embed({
      input: [text],
      model: EmbeddingService.MODEL,
    });
    return result.data![0]!.embedding!;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    this.logger.debug(`Embedding batch of ${texts.length} texts`);
    const result = await this.voyage.embed({
      input: texts,
      model: EmbeddingService.MODEL,
    });
    return result.data!.map((d) => d.embedding!);
  }
}
