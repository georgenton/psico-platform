import { Injectable } from "@nestjs/common";
import type { ChapterMediaKind } from "@psico/types";
import type { ChapterMediaDefinition } from "./chapter-media.catalog";
import type { ChapterMediaDefinitionRepository } from "./chapter-media-definition.repository";

/**
 * The migration seam: code-owned definitions and CMS-published ones, answering
 * as one catalog.
 *
 * `getExact` — DATABASE FIRST, then code. This is what makes adoption safe.
 * Cloning a code definition into the CMS at the SAME key and version and then
 * publishing it moves authority without moving identity, so a listener who
 * completed `eec-c1-podcast-v1` yesterday still has completed the same thing
 * today. Falling back to code keeps every key that ever shipped resolvable,
 * including the ones nobody has adopted.
 *
 * `listPublicForChapter` — one offer per KIND, at its highest `mediaVersion`,
 * database and code considered together. The product offers at most one
 * audiobook, one podcast and one video per chapter, so "which version is
 * current" is the only question; a superseded version stays resolvable through
 * `getExact` but stops being advertised.
 *
 * On a tie the DATABASE wins, which is precisely the adoption case: same key,
 * same version, editorial copy now owned by the CMS.
 */

/** Presentation order, fixed. Alphabetical would put the podcast first. */
const KIND_ORDER: readonly ChapterMediaKind[] = [
  "AUDIOBOOK",
  "PODCAST",
  "VIDEO",
];

@Injectable()
export class HybridChapterMediaRepository implements ChapterMediaDefinitionRepository {
  constructor(
    private readonly database: ChapterMediaDefinitionRepository,
    private readonly codeOwned: ChapterMediaDefinitionRepository,
  ) {}

  async getExact(mediaKey: string): Promise<ChapterMediaDefinition | null> {
    const fromDatabase = await this.database.getExact(mediaKey);
    if (fromDatabase !== null) return fromDatabase;
    return this.codeOwned.getExact(mediaKey);
  }

  async listPublicForChapter(
    bookSlug: string,
    chapterOrder: number,
  ): Promise<readonly ChapterMediaDefinition[]> {
    const [fromDatabase, fromCode] = await Promise.all([
      this.database.listPublicForChapter(bookSlug, chapterOrder),
      this.codeOwned.listPublicForChapter(bookSlug, chapterOrder),
    ]);

    const current = new Map<ChapterMediaKind, ChapterMediaDefinition>();

    // Code first, database second, so an equal version from the database
    // overwrites — the adoption case.
    for (const def of [...fromCode, ...fromDatabase]) {
      const held = current.get(def.kind);
      if (!held || def.mediaVersion >= held.mediaVersion) {
        current.set(def.kind, def);
      }
    }

    return KIND_ORDER.map((kind) => current.get(kind)).filter(
      (d): d is ChapterMediaDefinition => d !== undefined,
    );
  }
}
