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
import type {
  AdminChapterExperiences,
  AdminExperienceRow,
  AdminExperienceStatus,
  ChapterExperienceDefinition,
  ChapterExperiencePublicView,
} from "@psico/types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { productionGuideRegistry } from "../guide/guide-catalog";
import { productionGuideDiscoveryCatalog } from "../guide/guide-discovery-catalog";
import {
  ExperienceCatalogError,
  validateExperienceAgainstGuide,
  validateExperienceDefinition,
} from "./experience-catalog";
import { productionExperienceRepository } from "./experience-production-catalog";
import { toPublicExperienceView } from "./experience-public-view";
import {
  ChapterIdentityError,
  resolveChapterIdentity,
  type ResolvedChapterIdentity,
} from "./experience-chapter-identity";
import {
  acquireBindingLocks,
  bridgeBindingLockKeys,
} from "./experience-binding-lock";
import {
  assertBindingAvailable,
  ensureReservation,
  EXPERIENCE_BINDING_CODES,
  ExperienceBindingError,
  guideKeyFromDefinition,
  readChapterBindings,
  readReservationAuthority,
} from "./experience-binding-reservation";

/** Editorial failures, surfaced as codes rather than stack traces. */
const EDITORIAL_CODES: Record<string, string> = {
  EXPERIENCE_CATALOG_INVALID_DEFINITION:
    "La definición no cumple el contrato: revisa escenas, orden y campos.",
  EXPERIENCE_CATALOG_BINDING_INVALID:
    "Una escena dice completar un paso que la guía no tiene, o no puede completarlo.",
  EXPERIENCE_CATALOG_DUPLICATE_DEFINITION: "Esa versión ya existe.",
};

/** Binding refusals, as codes an editor can act on. Never a key, never an id. */
const BINDING_MESSAGES: Record<string, string> = {
  [EXPERIENCE_BINDING_CODES.guideReserved]:
    "Otra experiencia de este capítulo ya usa esa guía.",
  [EXPERIENCE_BINDING_CODES.lineageBound]:
    "Esta experiencia ya está vinculada a otra guía en este capítulo.",
  [EXPERIENCE_BINDING_CODES.divergent]:
    "El vínculo con la guía no es consistente. No se escribió nada.",
  [EXPERIENCE_BINDING_CODES.authorityUnavailable]:
    "El vínculo con la guía no se puede verificar ahora mismo.",
};

/**
 * Turn a binding or identity refusal into HTTP, and let everything else
 * through. A storage failure is not an editorial verdict and must not be
 * dressed up as one.
 */
function bindingFailure(err: unknown): never {
  if (err instanceof ExperienceBindingError) {
    throw new ConflictException({
      code: err.code,
      message: BINDING_MESSAGES[err.code] ?? "No se pudo vincular la guía.",
    });
  }
  if (err instanceof ChapterIdentityError) {
    throw new ConflictException({
      code: err.code,
      message:
        "Este capítulo no puede alojar una experiencia: su identidad no se " +
        "resuelve en la estructura publicada.",
    });
  }
  throw err;
}

function editorial(err: unknown): never {
  if (err instanceof ExperienceCatalogError) {
    throw new UnprocessableEntityException({
      code: err.code,
      message: EDITORIAL_CODES[err.code] ?? "La definición no es válida.",
    });
  }
  throw err;
}

/**
 * One row for the editor.
 *
 * `status` comes from the caller, and for database rows the caller passes the
 * COLUMN. It used to be derived from `definitionJson.status`, which was fine
 * while the column had two values and will not be once ARCHIVED exists: an
 * archived row keeps a definition that still says DRAFT, so deriving it would
 * present an archived experience as editable. An unrecognised status is passed
 * through rather than folded into DRAFT — this binary does not decide what a
 * value it has never seen means.
 */
function rowOf(
  def: ChapterExperienceDefinition,
  extra: Pick<
    AdminExperienceRow,
    "id" | "source" | "publishedAt" | "updatedAt" | "status"
  >,
): AdminExperienceRow {
  return {
    experienceKey: def.experienceKey,
    experienceVersion: def.experienceVersion,
    title: def.title,
    summary: def.summary ?? null,
    estimatedMinutes: def.estimatedMinutes ?? null,
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
          // A code-owned definition has no row, so its own status is all there
          // is — and code-owned definitions are published by construction.
          status: def.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
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
          // The COLUMN, always.
          status: row.status,
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
    status: AdminExperienceStatus;
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
   * The draft as a READER would receive it — through the same mapper the
   * discovery route uses.
   *
   * The CMS preview renders this rather than mapping the definition in the
   * browser, so the editor sees the real thing: RECALL options come from the
   * server-side exercise catalog, and `correctOptionKey` is left behind here
   * exactly as it is for a reader. A second mapper written for the CMS would be
   * a place for the two to disagree.
   */
  async getDraftPublicView(id: string): Promise<ChapterExperiencePublicView> {
    const row = await this.prisma.chapterExperienceVersion.findUnique({
      where: { id },
      select: { definitionJson: true },
    });
    if (!row) throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });
    try {
      return toPublicExperienceView(
        validateExperienceDefinition(row.definitionJson),
      );
    } catch (err) {
      return editorial(err);
    }
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
    // C.3A — still the chapter's own pin. Selection is C.4; this phase changes
    // how a binding is RESERVED, not who chooses it.
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
    return this.withBinding(
      { bookSlug: definition.bookSlug, chapterOrder: definition.chapterOrder },
      async (tx, chapter) => {
        await this.reserveFor(tx, chapter, definition);
        return this.insert(tx, userId, definition, chapter);
      },
    );
  }

  /**
   * Identity, then locks, then the caller — in that order, always.
   *
   * The order is the guarantee. Resolving the chapter first means a command
   * that cannot name its chapter never reaches a lock, an insert or a release;
   * taking the global key before the chapter key gives every writer the same
   * total order, so no pair can build a wait cycle; and doing both inside the
   * transaction is what lets the C.3B backfill exclude every bridge writer by
   * taking the same global key.
   */
  private async withBinding<T>(
    where: {
      bookSlug: string;
      chapterOrder: number;
      expectedContentUnitId?: string | null;
    },
    run: (
      tx: Prisma.TransactionClient,
      chapter: ResolvedChapterIdentity,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const authority = await readReservationAuthority(tx);
        if (authority !== "BRIDGE" && authority !== "STRUCTURAL") {
          // LEGACY_SCAN means this binary is running against a schema that
          // predates its own migration; FAIL_CLOSED means a shape nobody
          // designed. Neither is a state to write bindings in.
          throw new ExperienceBindingError(
            EXPERIENCE_BINDING_CODES.authorityUnavailable,
          );
        }
        const chapter = await resolveChapterIdentity(tx, where);
        await acquireBindingLocks(
          tx,
          bridgeBindingLockKeys(chapter.contentUnitId),
        );
        return run(tx, chapter);
      });
    } catch (err) {
      return bindingFailure(err);
    }
  }

  /**
   * Check both halves of the bijection and materialise the reservation.
   *
   * Read AFTER the lock, never before: a view taken outside it describes a
   * moment another writer may already have left.
   */
  private async reserveFor(
    tx: Prisma.TransactionClient,
    chapter: ResolvedChapterIdentity,
    definition: ChapterExperienceDefinition,
  ): Promise<void> {
    // Code-owned definitions hold their guide too, and they are not rows. The
    // previous rule counted them; dropping them would move a collision to the
    // day the catalog is replaced.
    const shipped =
      await productionExperienceRepository.listPublishedForChapter({
        bookSlug: definition.bookSlug,
        chapterOrder: definition.chapterOrder,
      });
    const view = await readChapterBindings(tx, {
      contentUnitId: chapter.contentUnitId,
      bookSlug: definition.bookSlug,
      chapterOrder: definition.chapterOrder,
      codeOwned: shipped.map((d) => ({
        experienceKey: d.experienceKey,
        guideKey: d.guidePin.guideKey,
      })),
    });
    assertBindingAvailable(view, {
      experienceKey: definition.experienceKey,
      guideKey: definition.guidePin.guideKey,
    });
    await ensureReservation(tx, {
      contentUnitId: chapter.contentUnitId,
      experienceKey: definition.experienceKey,
      guideKey: definition.guidePin.guideKey,
    });
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
    return this.withBinding(
      { bookSlug: definition.bookSlug, chapterOrder: definition.chapterOrder },
      async (tx, chapter) => {
        // The next version of a lineage reuses its reservation rather than
        // taking a new one — which is why `ensureReservation` treats an exact
        // match as a replay instead of a conflict.
        await this.reserveFor(tx, chapter, definition);
        return this.insert(tx, userId, definition, chapter);
      },
    );
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
    // Positively DRAFT, never "not PUBLISHED".
    //
    // Forward compatibility with the ARCHIVED value C.3C adds: the old test
    // let anything that was not PUBLISHED through, so an archived row would
    // have been editable by a binary that had never heard of archiving. A
    // status this binary does not recognise is inert here, on purpose.
    if (row.status !== "DRAFT") {
      throw new ConflictException({
        code:
          row.status === "PUBLISHED"
            ? "EXPERIENCE_PUBLISHED_IMMUTABLE"
            : "EXPERIENCE_VERSION_NOT_DRAFT",
        message:
          row.status === "PUBLISHED"
            ? "Una versión publicada no se edita. Crea una versión nueva a partir de ella."
            : "Esta versión no es un borrador editable.",
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

    return this.withBinding(
      { bookSlug: row.bookSlug, chapterOrder: row.chapterOrder },
      async (tx, chapter) => {
        // A save is not a rebind. `rebuildAsDraft` already overwrote the pin
        // with the chapter's own, so this cannot move a binding — and the
        // reservation check runs anyway, because "cannot" is worth verifying
        // when the alternative is a silent rebind.
        await this.reserveFor(tx, chapter, definition);
        await tx.chapterExperienceVersion.update({
          where: { id },
          data: {
            definitionJson: definition as unknown as never,
            contentUnitId: chapter.contentUnitId,
            guideKey: definition.guidePin.guideKey,
          },
        });
        return { id };
      },
    );
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
    const row = await this.prisma.chapterExperienceVersion.findUnique({
      where: { id },
      select: { bookSlug: true, chapterOrder: true },
    });
    if (!row) throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });

    return this.withBinding(
      { bookSlug: row.bookSlug, chapterOrder: row.chapterOrder },
      async (tx, chapter) => {
        // Re-read INSIDE the lock. The row read a moment ago only told us which
        // chapter to lock; what publishing decides on has to be the state the
        // lock is actually protecting.
        const current = await tx.chapterExperienceVersion.findUnique({
          where: { id },
        });
        if (!current) {
          throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });
        }
        if (current.status !== "DRAFT") {
          throw new ConflictException({
            code:
              current.status === "PUBLISHED"
                ? "EXPERIENCE_ALREADY_PUBLISHED"
                : "EXPERIENCE_VERSION_NOT_DRAFT",
            message:
              current.status === "PUBLISHED"
                ? "Esta versión ya está publicada."
                : "Esta versión no es un borrador publicable.",
          });
        }

        let definition: ChapterExperienceDefinition;
        try {
          definition = validateExperienceDefinition({
            ...(current.definitionJson as object),
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

        // The reservation is revalidated here, not inherited from create time.
        // A draft can have sat for weeks; publishing is when it starts holding
        // the guide against readers, so this is where the claim must still hold.
        await this.reserveFor(tx, chapter, definition);

        const publishedAt = new Date();
        const updated = await tx.chapterExperienceVersion.updateMany({
          where: { id, status: "DRAFT" },
          data: {
            status: "PUBLISHED",
            publishedAt,
            definitionJson: definition as unknown as never,
            contentUnitId: chapter.contentUnitId,
            guideKey: definition.guidePin.guideKey,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException({ code: "EXPERIENCE_ALREADY_PUBLISHED" });
        }

        return { id, publishedAt: publishedAt.toISOString() };
      },
    );
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
    tx: Prisma.TransactionClient,
    userId: string,
    definition: ChapterExperienceDefinition,
    chapter: ResolvedChapterIdentity,
  ): Promise<{ id: string }> {
    const clash = await tx.chapterExperienceVersion.findUnique({
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

    const created = await tx.chapterExperienceVersion.create({
      data: {
        experienceKey: definition.experienceKey,
        experienceVersion: definition.experienceVersion,
        bookSlug: definition.bookSlug,
        chapterOrder: definition.chapterOrder,
        // Identity and lineage as COLUMNS, not only inside the definition.
        // The composite foreign key can only protect what it can see.
        contentUnitId: chapter.contentUnitId,
        guideKey: definition.guidePin.guideKey,
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
