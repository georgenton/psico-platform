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
 * `listPublicForChapter` — the UNION of both, merged by `mediaKey`, with the
 * database winning when both carry the same key. That is the adoption case, and
 * it is the only merge rule here.
 *
 * It deliberately does NOT collapse a chapter to one item per kind. The reader
 * contract is a flat `items[]` and the surfaces read it accordingly:
 * `ChapterMediaListen` filters EVERY podcast episode and `ChapterMediaWatch`
 * filters every video into a picker keyed on `mediaKey`. Both of those started
 * as `.find()` calls that showed the first item and hid the rest, and both were
 * fixed; a repository that deduplicated by kind would reintroduce exactly that
 * bug one layer lower, where the surfaces could not see it.
 *
 * There is likewise no "highest version wins" rule. Superseding a version is a
 * decision the catalog has never expressed — a chapter carrying two versions
 * showed both — and inventing it here would silently remove content an editor
 * never asked to remove.
 */

/** Presentation order for entries the code catalog does not already order. */
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

    const byKey = new Map(fromDatabase.map((d) => [d.mediaKey, d]));

    // Code declaration order IS presentation order, so adopting a definition
    // must not move its card. Each code entry keeps its slot; the database
    // version simply answers in its place.
    const merged = fromCode.map((d) => byKey.get(d.mediaKey) ?? d);

    // Anything the CMS created that code never knew about — a new episode, a
    // newly announced format — goes after, in a deterministic order.
    const codeKeys = new Set(fromCode.map((d) => d.mediaKey));
    const extras = fromDatabase
      .filter((d) => !codeKeys.has(d.mediaKey))
      .sort(
        (a, b) =>
          KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
          a.mediaKey.localeCompare(b.mediaKey),
      );

    return [...merged, ...extras];
  }
}
