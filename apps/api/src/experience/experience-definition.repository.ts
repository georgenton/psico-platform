/**
 * The CMS boundary (ADR 0021 §5).
 *
 * Everything downstream — Chapter Home, discovery, the Player, the lifecycle
 * adapter — asks for definitions through this port and nothing else. That is
 * the whole point: when experiences move from code into a database, only the
 * implementation behind this interface changes. The twelve renderers, the
 * sessions and the reader do not get redesigned.
 *
 * Two operations, and neither one guesses:
 *
 *   - `getExact` is version-pinned. A session fixed to v1 keeps meaning v1
 *     even after v2 is published; silently upgrading it would rewrite what a
 *     person already agreed to walk through.
 *   - `listPublishedForChapter` never falls back to another chapter, another
 *     book or another status. An empty list is a real answer.
 */

import type { ChapterExperienceDefinition, ExperiencePin } from "@psico/types";

/**
 * The DI token. Injecting the interface by token rather than the concrete
 * class is what makes the CMS swap a one-line change in the module.
 */
export const EXPERIENCE_DEFINITION_REPOSITORY =
  "EXPERIENCE_DEFINITION_REPOSITORY";

export interface ChapterExperienceContext {
  bookSlug: string;
  chapterOrder: number;
}

export interface ExperienceDefinitionRepository {
  getExact(pin: ExperiencePin): Promise<ChapterExperienceDefinition | null>;
  listPublishedForChapter(
    context: ChapterExperienceContext,
  ): Promise<ChapterExperienceDefinition[]>;
}

/**
 * The implementation this PR ships: definitions live in code, reviewed like
 * code. `DatabaseExperienceDefinitionRepository` will replace it without the
 * Player noticing.
 */
export class CodeOwnedExperienceDefinitionRepository implements ExperienceDefinitionRepository {
  private readonly byExactVersion = new Map<
    string,
    ChapterExperienceDefinition
  >();
  private readonly byChapter = new Map<string, ChapterExperienceDefinition[]>();

  constructor(definitions: readonly ChapterExperienceDefinition[]) {
    for (const def of definitions) {
      const exact = `${def.experienceKey}@${def.experienceVersion}`;
      if (this.byExactVersion.has(exact)) {
        throw new Error(`EXPERIENCE_CATALOG_DUPLICATE_DEFINITION:${exact}`);
      }
      this.byExactVersion.set(exact, def);

      // Only PUBLISHED rows are ever listed; drafts and archives exist in the
      // registry so a pinned session can still resolve them by exact version.
      if (def.status !== "PUBLISHED") continue;
      const chapter = `${def.bookSlug}#${def.chapterOrder}`;
      const list = this.byChapter.get(chapter) ?? [];
      list.push(def);
      this.byChapter.set(chapter, list);
    }
    // Stable, declared order — never "whatever the map iterated".
    for (const list of this.byChapter.values()) {
      list.sort((a, b) => a.experienceKey.localeCompare(b.experienceKey));
      Object.freeze(list);
    }
  }

  async getExact(
    pin: ExperiencePin,
  ): Promise<ChapterExperienceDefinition | null> {
    return (
      this.byExactVersion.get(
        `${pin.experienceKey}@${pin.experienceVersion}`,
      ) ?? null
    );
  }

  async listPublishedForChapter(
    context: ChapterExperienceContext,
  ): Promise<ChapterExperienceDefinition[]> {
    const list =
      this.byChapter.get(`${context.bookSlug}#${context.chapterOrder}`) ?? [];
    return [...list];
  }
}
