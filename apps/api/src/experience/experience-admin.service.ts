/**
 * CMS V1 (#637) — the write side of chapter experiences.
 *
 * The runtime read path is untouched: this service writes rows that
 * `DatabaseExperienceDefinitionRepository` later serves. Everything that
 * decides WHAT a definition may be lives in the validators the Player already
 * trusts (`validateExperienceDefinition`, `validateExperienceAgainstGuide`);
 * this file adds no second opinion about scene shape.
 *
 * What it does own is the lifecycle, and it owns it completely — never the
 * browser:
 *
 *   - `status`, `experienceVersion`, `publishedAt` and the acting user are
 *     server-decided. A client may send a definition; it may not send its
 *     own status, its own version bump or its own timestamp.
 *   - PUBLISHED rows are immutable. Editing one is `createNextDraft`, which
 *     clones it at `version + 1` as a DRAFT and leaves the published row
 *     exactly where a pinned session expects to find it.
 *   - publishing re-validates against the EXACT guide the definition pins,
 *     resolved from the server registry. A binding the browser claims is
 *     valid is not evidence.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { ChapterExperienceDefinition } from "@psico/types";
import { PrismaService } from "../prisma/prisma.service";
import { productionGuideRegistry } from "../guide/guide-catalog";
import { productionGuideDiscoveryCatalog } from "../guide/guide-discovery-catalog";
import {
  ExperienceCatalogError,
  validateExperienceAgainstGuide,
  validateExperienceDefinition,
} from "./experience-catalog";
import { productionExperienceRepository } from "./experience-production-catalog";

/** One row as `/autor`-style admin surfaces need to render it. */
export interface AdminExperienceRow {
  id: string | null;
  experienceKey: string;
  experienceVersion: number;
  title: string;
  summary: string | null;
  estimatedMinutes: number | null;
  status: "DRAFT" | "PUBLISHED";
  sceneCount: number;
  /** `code` rows have no database id and cannot be edited in place. */
  source: "database" | "code";
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface AdminChapterExperiences {
  bookSlug: string;
  chapterOrder: number;
  /** The only guide an experience here may pin, or null when none exists. */
  guidePin: { guideKey: string; guideVersion: number } | null;
  experiences: AdminExperienceRow[];
}

/** Editorial failures, surfaced as codes rather than stack traces. */
const EDITORIAL_CODES: Record<string, string> = {
  EXPERIENCE_CATALOG_INVALID_DEFINITION:
    "La definición no cumple el contrato: revisa escenas, orden y campos.",
  EXPERIENCE_CATALOG_BINDING_INVALID:
    "Una escena dice completar un paso que la guía no tiene, o no puede completarlo.",
  EXPERIENCE_CATALOG_DUPLICATE_DEFINITION: "Esa versión ya existe.",
};

function editorial(err: unknown): never {
  if (err instanceof ExperienceCatalogError) {
    throw new UnprocessableEntityException({
      code: err.code,
      message: EDITORIAL_CODES[err.code] ?? "La definición no es válida.",
    });
  }
  throw err;
}

function rowOf(
  def: ChapterExperienceDefinition,
  extra: Pick<
    AdminExperienceRow,
    "id" | "source" | "publishedAt" | "updatedAt"
  >,
): AdminExperienceRow {
  return {
    experienceKey: def.experienceKey,
    experienceVersion: def.experienceVersion,
    title: def.title,
    summary: def.summary ?? null,
    estimatedMinutes: def.estimatedMinutes ?? null,
    status: def.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    sceneCount: def.scenes.length,
    ...extra,
  };
}

@Injectable()
export class ExperienceAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything an editor needs for one chapter: what code ships, what the
   * database holds, and the single guide a new experience may bind to.
   */
  async listForChapter(
    bookSlug: string,
    chapterOrder: number,
  ): Promise<AdminChapterExperiences> {
    const rows = await this.prisma.chapterExperienceVersion.findMany({
      where: { bookSlug, chapterOrder },
      orderBy: [{ experienceKey: "asc" }, { experienceVersion: "asc" }],
    });

    const experiences: AdminExperienceRow[] = [];

    // Code-owned definitions are listed so an editor can SEE them and start a
    // next version from them. They are never copied in automatically.
    const fromCode =
      await productionExperienceRepository.listPublishedForChapter({
        bookSlug,
        chapterOrder,
      });
    for (const def of fromCode) {
      experiences.push(
        rowOf(def, {
          id: null,
          source: "code",
          publishedAt: null,
          updatedAt: null,
        }),
      );
    }

    for (const row of rows) {
      const def = validateExperienceDefinitionQuietly(row.definitionJson);
      if (def === null) continue;
      experiences.push(
        rowOf(def, {
          id: row.id,
          source: "database",
          publishedAt: row.publishedAt?.toISOString() ?? null,
          updatedAt: row.updatedAt.toISOString(),
        }),
      );
    }

    const pin = productionGuideDiscoveryCatalog.getExactContext(
      bookSlug,
      chapterOrder,
    );

    return {
      bookSlug,
      chapterOrder,
      guidePin: pin
        ? { guideKey: pin.guideKey, guideVersion: pin.guideVersion }
        : null,
      experiences,
    };
  }

  /** One draft, for the editor. Drafts are never served through the port. */
  async getDraft(id: string): Promise<{
    id: string;
    status: "DRAFT" | "PUBLISHED";
    definition: ChapterExperienceDefinition;
  }> {
    const row = await this.prisma.chapterExperienceVersion.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });
    let definition: ChapterExperienceDefinition;
    try {
      definition = validateExperienceDefinition(row.definitionJson);
    } catch (err) {
      return editorial(err);
    }
    return { id: row.id, status: row.status, definition };
  }

  /**
   * A brand-new experience, always at version 1 and always DRAFT.
   *
   * The guide is not taken from the client: it is the one this chapter
   * publishes. A chapter without a guide cannot host an experience, and saying
   * so is better than inventing a binding.
   */
  async createDraft(
    userId: string,
    input: ChapterExperienceDefinition,
  ): Promise<{ id: string }> {
    const pin = productionGuideDiscoveryCatalog.getExactContext(
      input.bookSlug,
      input.chapterOrder,
    );
    if (pin === null) {
      throw new BadRequestException({
        code: "NO_GUIDE_FOR_CHAPTER",
        message: "No hay una guía base disponible para este capítulo.",
      });
    }

    const definition = this.rebuildAsDraft(input, pin);
    return this.insert(userId, definition);
  }

  /**
   * The migration path, and the only way to change something already
   * published: clone it forward as the next version, DRAFT.
   *
   * Works from a code-owned definition too, which is how EEC v1 becomes a
   * database v2 without a bulk import.
   */
  async createNextDraft(
    userId: string,
    experienceKey: string,
    fromVersion: number,
  ): Promise<{ id: string }> {
    const source =
      (await this.readDatabaseDefinition(experienceKey, fromVersion)) ??
      (await productionExperienceRepository.getExact({
        experienceKey,
        experienceVersion: fromVersion,
      }));
    if (source === null) {
      throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });
    }

    const highest = await this.highestVersion(experienceKey);
    const nextVersion = Math.max(highest, fromVersion) + 1;

    const pin = productionGuideDiscoveryCatalog.getExactContext(
      source.bookSlug,
      source.chapterOrder,
    );
    if (pin === null) {
      throw new BadRequestException({
        code: "NO_GUIDE_FOR_CHAPTER",
        message: "No hay una guía base disponible para este capítulo.",
      });
    }

    const definition = this.rebuildAsDraft(
      { ...source, experienceVersion: nextVersion },
      pin,
    );
    return this.insert(userId, definition);
  }

  /**
   * Save a draft, whole. There is no per-field patch: a partial write is how
   * a definition ends up in a state no validator ever saw.
   */
  async saveDraft(
    id: string,
    input: ChapterExperienceDefinition,
  ): Promise<{ id: string }> {
    const row = await this.prisma.chapterExperienceVersion.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        experienceKey: true,
        experienceVersion: true,
        bookSlug: true,
        chapterOrder: true,
      },
    });
    if (!row) throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });
    if (row.status === "PUBLISHED") {
      throw new ConflictException({
        code: "EXPERIENCE_PUBLISHED_IMMUTABLE",
        message:
          "Una versión publicada no se edita. Crea una versión nueva a partir de ella.",
      });
    }

    const pin = productionGuideDiscoveryCatalog.getExactContext(
      row.bookSlug,
      row.chapterOrder,
    );
    if (pin === null) {
      throw new BadRequestException({ code: "NO_GUIDE_FOR_CHAPTER" });
    }

    // Identity is the row's, not the payload's: a save may not move a draft to
    // another key, version, book or chapter.
    const definition = this.rebuildAsDraft(
      {
        ...input,
        experienceKey: row.experienceKey,
        experienceVersion: row.experienceVersion,
        bookSlug: row.bookSlug,
        chapterOrder: row.chapterOrder,
      },
      pin,
    );

    await this.prisma.chapterExperienceVersion.update({
      where: { id },
      data: { definitionJson: definition as unknown as never },
    });
    return { id };
  }

  /**
   * Publish, in one transaction, with the guide check LAST and against the
   * server's own registry.
   *
   * The status change is conditional on the row still being a draft, so two
   * concurrent publishes cannot both win: the second updates zero rows and is
   * reported as a conflict.
   */
  async publish(id: string): Promise<{ id: string; publishedAt: string }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.chapterExperienceVersion.findUnique({
        where: { id },
      });
      if (!row) throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });
      if (row.status !== "DRAFT") {
        throw new ConflictException({
          code: "EXPERIENCE_ALREADY_PUBLISHED",
          message: "Esta versión ya está publicada.",
        });
      }

      let definition: ChapterExperienceDefinition;
      try {
        definition = validateExperienceDefinition({
          ...(row.definitionJson as object),
          status: "PUBLISHED",
        });
        const guide = productionGuideRegistry.getExact(
          definition.guidePin.guideKey,
          definition.guidePin.guideVersion,
        );
        validateExperienceAgainstGuide(definition, guide);
      } catch (err) {
        return editorial(err);
      }

      const publishedAt = new Date();
      const updated = await tx.chapterExperienceVersion.updateMany({
        where: { id, status: "DRAFT" },
        data: {
          status: "PUBLISHED",
          publishedAt,
          definitionJson: definition as unknown as never,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException({ code: "EXPERIENCE_ALREADY_PUBLISHED" });
      }

      return { id, publishedAt: publishedAt.toISOString() };
    });
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Rebuild whatever arrived into a DRAFT definition bound to `pin`.
   *
   * Status and guide pin are overwritten rather than trusted, which is what
   * stops a client publishing by sending `status: "PUBLISHED"` in a save.
   */
  private rebuildAsDraft(
    input: ChapterExperienceDefinition,
    pin: { guideKey: string; guideVersion: number },
  ): ChapterExperienceDefinition {
    try {
      return validateExperienceDefinition({
        ...input,
        status: "DRAFT",
        guidePin: { guideKey: pin.guideKey, guideVersion: pin.guideVersion },
      });
    } catch (err) {
      return editorial(err);
    }
  }

  private async insert(
    userId: string,
    definition: ChapterExperienceDefinition,
  ): Promise<{ id: string }> {
    const clash = await this.prisma.chapterExperienceVersion.findUnique({
      where: {
        experienceKey_experienceVersion: {
          experienceKey: definition.experienceKey,
          experienceVersion: definition.experienceVersion,
        },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: "EXPERIENCE_VERSION_EXISTS",
        message: "Esa versión ya existe.",
      });
    }

    const created = await this.prisma.chapterExperienceVersion.create({
      data: {
        experienceKey: definition.experienceKey,
        experienceVersion: definition.experienceVersion,
        bookSlug: definition.bookSlug,
        chapterOrder: definition.chapterOrder,
        status: "DRAFT",
        definitionJson: definition as unknown as never,
        createdByUserId: userId,
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  private async readDatabaseDefinition(
    experienceKey: string,
    experienceVersion: number,
  ): Promise<ChapterExperienceDefinition | null> {
    const row = await this.prisma.chapterExperienceVersion.findUnique({
      where: {
        experienceKey_experienceVersion: { experienceKey, experienceVersion },
      },
      select: { definitionJson: true },
    });
    if (!row) return null;
    return validateExperienceDefinitionQuietly(row.definitionJson);
  }

  private async highestVersion(experienceKey: string): Promise<number> {
    const row = await this.prisma.chapterExperienceVersion.findFirst({
      where: { experienceKey },
      orderBy: { experienceVersion: "desc" },
      select: { experienceVersion: true },
    });
    return row?.experienceVersion ?? 0;
  }
}

/** Same rebuild, but a bad row is skipped rather than failing the whole list. */
function validateExperienceDefinitionQuietly(
  json: unknown,
): ChapterExperienceDefinition | null {
  try {
    return validateExperienceDefinition(json);
  } catch {
    return null;
  }
}
