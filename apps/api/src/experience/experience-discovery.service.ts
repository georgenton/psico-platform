/**
 * GR-6 — which published experiences present a given chapter.
 *
 * The whole service is a pass-through to the definition repository, and that
 * is the point: it is the seam the CMS will replace. When definitions move
 * from code into a database, only `ExperienceDefinitionRepository` changes —
 * this service, the controller, the client and the twelve renderers do not.
 *
 * It answers with what is PUBLISHED and nothing else. Drafts and archives stay
 * resolvable by exact version (a pinned session must keep meaning something
 * after its version is retired), but they are never offered.
 */

import { Inject, Injectable } from "@nestjs/common";
import type { ChapterExperiencePublicView } from "@psico/types";
import { toPublicExperienceView } from "./experience-public-view";
import {
  EXPERIENCE_DEFINITION_REPOSITORY,
  type ExperienceDefinitionRepository,
} from "./experience-definition.repository";

export interface ChapterExperienceDiscoveryParams {
  bookSlug: string;
  chapterOrder: number;
}

@Injectable()
export class ExperienceDiscoveryService {
  constructor(
    @Inject(EXPERIENCE_DEFINITION_REPOSITORY)
    private readonly repository: ExperienceDefinitionRepository,
  ) {}

  /**
   * Zero to many, in a declared order. An empty list is a real answer — this
   * chapter simply has no guided journey — and it is deliberately the same
   * answer a chapter with only drafts gives, because "nothing to offer you" is
   * the honest reading of both.
   */
  async listPublishedForChapter(
    params: ChapterExperienceDiscoveryParams,
  ): Promise<ChapterExperiencePublicView[]> {
    const definitions = await this.repository.listPublishedForChapter(params);
    return definitions.map(toPublicExperienceView);
  }
}
