import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
<<<<<<< HEAD
import type { PrismaService } from "../prisma";
import type { EmbeddingService } from "./embedding/embedding.service";
import type { VectorStoreService } from "./vector-store/vector-store.service";
import { type ChunkInput } from "./vector-store/vector-store.service";
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmbeddingService } from "./embedding/embedding.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  VectorStoreService,
  type ChunkInput,
} from "./vector-store/vector-store.service";
>>>>>>> origin/main

// Chunk size/overlap in words — a rough but fast approximation of tokens
const CHUNK_WORDS = 500;
const OVERLAP_WORDS = 50;

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
  ) {}

  async ingestBook(bookId: string): Promise<{ chunksUpserted: number }> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: {
        chapters: {
          where: { isPublished: true },
          orderBy: { order: "asc" },
          include: { audios: true },
        },
      },
    });

    if (!book) throw new NotFoundException(`Book ${bookId} not found`);
    if (book.chapters.length === 0)
      throw new BadRequestException(
        `Book ${bookId} has no published chapters to ingest`,
      );

    let totalUpserted = 0;

    for (const chapter of book.chapters) {
      const rawTexts: string[] = [];
      if (chapter.description) rawTexts.push(chapter.description);
      for (const audio of chapter.audios) {
        if (audio.transcription) rawTexts.push(audio.transcription);
      }

      if (rawTexts.length === 0) continue;

      const fullText = rawTexts.join("\n\n");
      const texts = this.chunkText(fullText);

      this.logger.debug(
        `Ingesting chapter ${chapter.id} — ${texts.length} chunks`,
      );

      const embeddings = await this.embeddingService.embedBatch(texts);

      const chunkInputs: ChunkInput[] = texts.map((content, i) => ({
        bookId,
        chapterId: chapter.id,
        content,
        embedding: embeddings[i]!,
        metadata: {
          bookTitle: book.title,
          chapterTitle: chapter.title,
          chapterOrder: chapter.order,
          chunkIndex: i,
        },
      }));

      const upserted = await this.vectorStore.upsertChunks(chunkInputs);
      totalUpserted += upserted;
    }

    this.logger.log(
      `Ingest complete for book ${bookId}: ${totalUpserted} chunks`,
    );
    return { chunksUpserted: totalUpserted };
  }

  private chunkText(text: string): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const chunks: string[] = [];
    let start = 0;

    while (start < words.length) {
      const end = Math.min(start + CHUNK_WORDS, words.length);
      chunks.push(words.slice(start, end).join(" "));
      if (end === words.length) break;
      start = end - OVERLAP_WORDS;
    }

    return chunks;
  }
}
