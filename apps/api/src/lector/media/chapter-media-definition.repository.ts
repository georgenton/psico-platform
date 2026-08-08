import { Injectable } from "@nestjs/common";
import type {
  ChapterMediaCatalogRegistry,
  ChapterMediaDefinition,
} from "./chapter-media.catalog";

/**
 * Where a chapter's media definitions come from.
 *
 * The runtime asks two questions and they resolve differently, which is the
 * whole reason this is a port rather than a direct registry call:
 *
 *   `getExact` — one definition, by key. A completion is identified by
 *   `mediaKey + mediaVersion`, so this must keep answering for a key forever,
 *   wherever that key now lives.
 *
 *   `listPublicForChapter` — what the chapter offers today.
 *
 * Note "public", not "published". The code catalog deliberately ships
 * runtime-DRAFT definitions so a chapter can advertise a format as *En
 * producción* before the master exists — that is a product decision, not an
 * unfinished row. So both runtime statuses are public here, and the thing that
 * decides whether a DATABASE row is public at all is its editorial status,
 * which is a separate field entirely.
 */
export interface ChapterMediaDefinitionRepository {
  getExact(mediaKey: string): Promise<ChapterMediaDefinition | null>;
  listPublicForChapter(
    bookSlug: string,
    chapterOrder: number,
  ): Promise<readonly ChapterMediaDefinition[]>;
}

export const CHAPTER_MEDIA_DEFINITION_REPOSITORY =
  "CHAPTER_MEDIA_DEFINITION_REPOSITORY";

/**
 * The definitions that ship in reviewed code.
 *
 * Still here, and deliberately: deleting it the day the CMS lands would make an
 * untested table the only thing standing between a reader and a chapter's
 * audiobook. It retires when every definition has been adopted and published.
 */
@Injectable()
export class CodeChapterMediaDefinitionRepository implements ChapterMediaDefinitionRepository {
  constructor(private readonly registry: ChapterMediaCatalogRegistry) {}

  async getExact(mediaKey: string): Promise<ChapterMediaDefinition | null> {
    return this.registry.find(mediaKey);
  }

  /**
   * Declaration order is presentation order — audiobook, podcast, video — and
   * both runtime statuses are included. A code-owned DRAFT is the "En
   * producción" card, not something to hide.
   */
  async listPublicForChapter(
    bookSlug: string,
    chapterOrder: number,
  ): Promise<readonly ChapterMediaDefinition[]> {
    return this.registry.forChapter(bookSlug, chapterOrder);
  }
}
