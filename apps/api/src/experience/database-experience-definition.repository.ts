/**
 * CMS V1 (#637) — the database half of the CMS boundary (ADR 0021 §5).
 *
 * This is the implementation the port was written for. It reads the SAME
 * `ChapterExperienceDefinition` the code-owned registry serves, because the
 * editor stores exactly that shape — there is no CMS-specific schema to
 * translate between, and therefore nothing to drift.
 *
 * Two rules it does not bend:
 *
 *   - stored JSON is REBUILT through `validateExperienceDefinition` on the way
 *     out, not trusted. A row edited by hand, or written by an older build,
 *     cannot smuggle an unknown scene kind into the Player;
 *   - `listPublishedForChapter` returns PUBLISHED only. A draft is invisible
 *     to readers by construction, not by a filter someone can forget.
 */

import { Injectable } from "@nestjs/common";
import type { ChapterExperienceDefinition, ExperiencePin } from "@psico/types";
import type { PrismaService } from "../prisma/prisma.service";
import { validateExperienceDefinition } from "./experience-catalog";
import type {
  ChapterExperienceContext,
  ExperienceDefinitionRepository,
} from "./experience-definition.repository";

/**
 * Rebuild a stored row into a definition, or `null` if it no longer satisfies
 * the contract. A single corrupt row must not take a chapter's whole list down
 * with it, so this never throws — a definition we cannot vouch for is simply
 * not offered.
 */
function rebuild(definitionJson: unknown): ChapterExperienceDefinition | null {
  try {
    return validateExperienceDefinition(definitionJson);
  } catch {
    return null;
  }
}

@Injectable()
export class DatabaseExperienceDefinitionRepository implements ExperienceDefinitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getExact(
    pin: ExperiencePin,
  ): Promise<ChapterExperienceDefinition | null> {
    const row = await this.prisma.chapterExperienceVersion.findUnique({
      where: {
        experienceKey_experienceVersion: {
          experienceKey: pin.experienceKey,
          experienceVersion: pin.experienceVersion,
        },
      },
      select: { definitionJson: true, status: true },
    });
    // A draft is resolvable by nobody but the editor, and the editor does not
    // come through this port — it reads its own rows directly.
    if (!row || row.status !== "PUBLISHED") return null;
    return rebuild(row.definitionJson);
  }

  async listPublishedForChapter(
    context: ChapterExperienceContext,
  ): Promise<ChapterExperienceDefinition[]> {
    const rows = await this.prisma.chapterExperienceVersion.findMany({
      where: {
        bookSlug: context.bookSlug,
        chapterOrder: context.chapterOrder,
        status: "PUBLISHED",
      },
      select: { definitionJson: true },
      // Deterministic, and the caller re-sorts anyway.
      orderBy: [{ experienceKey: "asc" }, { experienceVersion: "asc" }],
    });

    const out: ChapterExperienceDefinition[] = [];
    for (const row of rows) {
      const def = rebuild(row.definitionJson);
      if (def !== null) out.push(def);
    }
    return out;
  }
}
