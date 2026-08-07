/**
 * CMS V1 (#637) — the migration seam, and the reason there is no big bang.
 *
 * Two definitions of the same experience can exist at once: the one shipped in
 * `experience-production-catalog.ts` and the one an editor published from the
 * CMS. This repository is the single place that decides which of them answers,
 * and it decides differently for the two questions the port asks — on purpose.
 *
 *   `getExact` — the DATABASE first, then code. A pinned session must resolve
 *   the version it started on, wherever that version lives. A run pinned to a
 *   code-owned v1 keeps resolving code-owned v1 forever, even once the CMS has
 *   published v2, because nothing here rewrites a pin.
 *
 *   `listPublishedForChapter` — one card per `experienceKey`, at its HIGHEST
 *   published version, database and code considered together. That is what
 *   makes "publish v2 from the CMS" visible to new readers with no deploy,
 *   while v1 stays resolvable for everyone already walking it.
 *
 * The code-owned catalog is deliberately still here. Deleting it would make the
 * CMS the only source of truth on the day it ships, and a definition that has
 * never been exercised in production is a poor thing to bet a reader's session
 * on. It retires when every experience has a published database row.
 */

import { Injectable } from "@nestjs/common";
import type { ChapterExperienceDefinition, ExperiencePin } from "@psico/types";
import type {
  ChapterExperienceContext,
  ExperienceDefinitionRepository,
} from "./experience-definition.repository";

@Injectable()
export class HybridExperienceDefinitionRepository implements ExperienceDefinitionRepository {
  constructor(
    private readonly database: ExperienceDefinitionRepository,
    private readonly codeOwned: ExperienceDefinitionRepository,
  ) {}

  /**
   * Exact pin, database first. Falling back to code is what keeps a session
   * that started before the CMS existed from becoming unresolvable.
   */
  async getExact(
    pin: ExperiencePin,
  ): Promise<ChapterExperienceDefinition | null> {
    const fromDatabase = await this.database.getExact(pin);
    if (fromDatabase !== null) return fromDatabase;
    return this.codeOwned.getExact(pin);
  }

  /**
   * The chapter's offer: every key that has a published version anywhere, each
   * at its highest one.
   *
   * Order is the code-owned order — `experienceKey` ascending — so a chapter's
   * cards do not reshuffle the day one of them is republished from the CMS.
   * Experience ORDERING is not something #637 administers; scene ordering is.
   */
  async listPublishedForChapter(
    context: ChapterExperienceContext,
  ): Promise<ChapterExperienceDefinition[]> {
    const [fromDatabase, fromCode] = await Promise.all([
      this.database.listPublishedForChapter(context),
      this.codeOwned.listPublishedForChapter(context),
    ]);

    const highestByKey = new Map<string, ChapterExperienceDefinition>();
    for (const def of [...fromCode, ...fromDatabase]) {
      const current = highestByKey.get(def.experienceKey);
      if (
        current === undefined ||
        def.experienceVersion > current.experienceVersion
      ) {
        highestByKey.set(def.experienceKey, def);
      }
    }

    return [...highestByKey.values()].sort((a, b) =>
      a.experienceKey.localeCompare(b.experienceKey),
    );
  }
}
