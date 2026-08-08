import { Injectable, Logger } from "@nestjs/common";
import type { PrismaService } from "../../prisma/prisma.service";
import {
  validateChapterMediaDefinition,
  type ChapterMediaDefinition,
} from "./chapter-media.catalog";
import type { ChapterMediaDefinitionRepository } from "./chapter-media-definition.repository";

/**
 * Media definitions an editor published from Content Studio.
 *
 * Two rules, and both are about not trusting this table:
 *
 * Only `editorialStatus = PUBLISHED` rows are visible. A CMS draft is private
 * even when the definition inside it is runtime-PUBLISHED and fully playable —
 * those are different questions, and conflating them is how unreviewed content
 * reaches a reader.
 *
 * Every row is rebuilt through `validateChapterMediaDefinition` on the way out.
 * JSON in a column is not a definition; it is a claim about one, and a hand-
 * edited or half-migrated row must not be able to hand the runtime a source it
 * would sign. A row that fails is SKIPPED with a log rather than thrown, so one
 * bad podcast cannot take a chapter's whole media surface down with it.
 */
@Injectable()
export class DatabaseChapterMediaRepository implements ChapterMediaDefinitionRepository {
  private readonly logger = new Logger("DatabaseChapterMedia");

  constructor(private readonly prisma: PrismaService) {}

  async getExact(mediaKey: string): Promise<ChapterMediaDefinition | null> {
    const row = await this.prisma.chapterMediaVersion.findFirst({
      where: { mediaKey, editorialStatus: "PUBLISHED" },
      select: { id: true, mediaKey: true, definitionJson: true },
    });
    if (!row) return null;
    return this.rebuild(row.id, row.mediaKey, row.definitionJson);
  }

  async listPublicForChapter(
    bookSlug: string,
    chapterOrder: number,
  ): Promise<readonly ChapterMediaDefinition[]> {
    const rows = await this.prisma.chapterMediaVersion.findMany({
      where: { bookSlug, chapterOrder, editorialStatus: "PUBLISHED" },
      select: { id: true, mediaKey: true, definitionJson: true },
    });

    const out: ChapterMediaDefinition[] = [];
    for (const row of rows) {
      const def = this.rebuild(row.id, row.mediaKey, row.definitionJson);
      if (def) out.push(def);
    }
    return out;
  }

  /**
   * Rebuild, or refuse.
   *
   * The identity check matters as much as the validation: the columns are what
   * the CMS queries and index on, so a `definitionJson` claiming a different key
   * would make a row findable as one thing and resolvable as another.
   */
  private rebuild(
    id: string,
    mediaKey: string,
    json: unknown,
  ): ChapterMediaDefinition | null {
    try {
      const def = validateChapterMediaDefinition(json);
      if (def.mediaKey !== mediaKey) {
        // Ids and keys only — never the definition, which carries provider refs.
        this.logger.error(
          `chapter media row id=${id} disagrees with its own mediaKey; skipped`,
        );
        return null;
      }
      return def;
    } catch {
      this.logger.error(
        `chapter media row id=${id} key=${mediaKey} failed validation; skipped`,
      );
      return null;
    }
  }
}
