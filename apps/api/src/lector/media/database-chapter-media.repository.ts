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
/** Every column a lookup depends on, so drift in any of them is detectable. */
const IDENTITY_SELECT = {
  id: true,
  mediaKey: true,
  mediaVersion: true,
  bookSlug: true,
  chapterOrder: true,
  kind: true,
  definitionJson: true,
} as const;

interface IdentityRow {
  id: string;
  mediaKey: string;
  mediaVersion: number;
  bookSlug: string;
  chapterOrder: number;
  kind: string;
  definitionJson: unknown;
}

@Injectable()
export class DatabaseChapterMediaRepository implements ChapterMediaDefinitionRepository {
  private readonly logger = new Logger("DatabaseChapterMedia");

  constructor(private readonly prisma: PrismaService) {}

  async getExact(mediaKey: string): Promise<ChapterMediaDefinition | null> {
    const row = await this.prisma.chapterMediaVersion.findFirst({
      where: { mediaKey, editorialStatus: "PUBLISHED" },
      select: IDENTITY_SELECT,
    });
    if (!row) return null;
    return this.rebuild(row);
  }

  async listPublicForChapter(
    bookSlug: string,
    chapterOrder: number,
  ): Promise<readonly ChapterMediaDefinition[]> {
    const rows = await this.prisma.chapterMediaVersion.findMany({
      where: { bookSlug, chapterOrder, editorialStatus: "PUBLISHED" },
      select: IDENTITY_SELECT,
    });

    const out: ChapterMediaDefinition[] = [];
    for (const row of rows) {
      const def = this.rebuild(row);
      if (def) out.push(def);
    }
    return out;
  }

  /**
   * Rebuild, or refuse.
   *
   * The identity check matters as much as the validation, and it covers EVERY
   * column the lookups use — not just the key. `bookSlug` and `chapterOrder` are
   * what the chapter query filters on and `kind` is what the reader surfaces
   * group by, so a row whose JSON disagrees with any of them would be findable
   * as one thing and resolvable as another. Same rule `publishDraft` applies on
   * the way in; this is the way out.
   */
  private rebuild(row: IdentityRow): ChapterMediaDefinition | null {
    let def: ChapterMediaDefinition;
    try {
      def = validateChapterMediaDefinition(row.definitionJson);
    } catch {
      this.logger.error(
        `chapter media row id=${row.id} failed validation; skipped`,
      );
      return null;
    }

    const drifted =
      def.mediaKey !== row.mediaKey ||
      def.mediaVersion !== row.mediaVersion ||
      def.bookSlug !== row.bookSlug ||
      def.chapterOrder !== row.chapterOrder ||
      def.kind !== row.kind;

    if (drifted) {
      // The row id and nothing else. The definition carries provider references
      // and the columns would narrow which asset drifted.
      this.logger.error(
        `chapter media row id=${row.id} disagrees with its identity columns; skipped`,
      );
      return null;
    }
    return def;
  }
}
