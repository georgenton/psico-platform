import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";

export interface ChunkInput {
  bookId: string;
  chapterId?: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}

export interface SimilarChunk {
  id: string;
  bookId: string;
  chapterId: string | null;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  static hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  async upsertChunks(chunks: ChunkInput[]): Promise<number> {
    if (chunks.length === 0) return 0;
    let upserted = 0;
    for (const chunk of chunks) {
      const chunkHash = VectorStoreService.hashContent(chunk.content);
      const embeddingLiteral = `[${chunk.embedding.join(",")}]`;
      await this.prisma.$executeRaw`
        INSERT INTO "ContentChunk" (id, "bookId", "chapterId", content, "chunkHash", metadata, embedding, "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid()::text,
          ${chunk.bookId},
          ${chunk.chapterId ?? null},
          ${chunk.content},
          ${chunkHash},
          ${chunk.metadata}::jsonb,
          ${embeddingLiteral}::vector,
          now(),
          now()
        )
        ON CONFLICT ("chunkHash") DO UPDATE
          SET embedding = EXCLUDED.embedding,
              "updatedAt" = now()
      `;
      upserted++;
    }
    this.logger.debug(`Upserted ${upserted} chunks`);
    return upserted;
  }

  async searchSimilar(
    queryEmbedding: number[],
    topK: number,
    bookId?: string,
  ): Promise<SimilarChunk[]> {
    const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

    type RawRow = {
      id: string;
      bookId: string;
      chapterId: string | null;
      content: string;
      metadata: unknown;
      similarity: number;
    };

    let rows: RawRow[];

    if (bookId) {
      rows = await this.prisma.$queryRaw<RawRow[]>`
        SELECT id, "bookId", "chapterId", content, metadata,
               1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
        FROM "ContentChunk"
        WHERE "bookId" = ${bookId}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingLiteral}::vector
        LIMIT ${topK}
      `;
    } else {
      rows = await this.prisma.$queryRaw<RawRow[]>`
        SELECT id, "bookId", "chapterId", content, metadata,
               1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
        FROM "ContentChunk"
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingLiteral}::vector
        LIMIT ${topK}
      `;
    }

    return rows.map((r) => ({
      id: r.id,
      bookId: r.bookId,
      chapterId: r.chapterId,
      content: r.content,
      metadata: r.metadata as Record<string, unknown>,
      similarity: Number(r.similarity),
    }));
  }

  async countChunks(bookId?: string): Promise<number> {
    return this.prisma.contentChunk.count({
      where: bookId ? { bookId } : undefined,
    });
  }
}
