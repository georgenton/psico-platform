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
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from "@nestjs/common";
import type {
  AdminChapterExperiences,
  AdminExperienceRow,
  AdminExperienceStatus,
  ChapterExperienceDefinition,
  ChapterExperiencePublicView,
} from "@psico/types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { productionGuideRegistry } from "../guide/guide-catalog";
import { productionGuideDiscoveryCatalog } from "../guide/guide-discovery-catalog";
import {
  ExperienceCatalogError,
  validateExperienceAgainstGuide,
  validateExperienceDefinition,
} from "./experience-catalog";
import { productionExperienceRepository } from "./experience-production-catalog";
import {
  CodeOwnedIdentityError,
  EXPERIENCE_CODE_OWNED_CLAIMS,
  EXPERIENCE_CODE_OWNED_UNRESOLVED,
  productionCodeOwnedClaims,
  type CodeOwnedClaimResolver,
} from "./experience-code-owned-identity";
import { toPublicExperienceView } from "./experience-public-view";
import {
  ChapterIdentityError,
  resolveChapterIdentity,
  type ResolvedChapterIdentity,
} from "./experience-chapter-identity";
import {
  enterBindingProtocol,
  type BindingTarget,
} from "./experience-binding-lock";
import type { ReservationAuthority } from "./experience-binding-schema";
import {
  guideAnchorAppliesToChapter,
  selectableGuidesForChapter,
  type SelectableGuideOption,
} from "./experience-guide-options";
import {
  assertBindingAvailable,
  ensureReservation,
  EXPERIENCE_BINDING_CODES,
  ExperienceBindingError,
  readChapterBindings,
  readReservationAuthority,
} from "./experience-binding-reservation";

/**
 * Which stored rows belong to this chapter, given what the schema can prove.
 *
 * `where: { bookSlug, chapterOrder }` was the old answer and it is wrong for
 * the same reason the lock key is not built from those two values: they are a
 * POSITION. Move a unit from chapter 3 to chapter 5 and its experiences would
 * appear under whatever unit took over position 3 — an editor would be looking
 * at one chapter's experiences while reading another's.
 *
 *   STRUCTURAL   identity, and only identity. Every row has a `contentUnitId`
 *                by then (the CHECK guarantees it), so position is not needed
 *                and must not be consulted.
 *   BRIDGE       both, kept apart: materialised rows by identity, legacy rows
 *                by position AND `contentUnitId IS NULL`. That last clause is
 *                what makes the mixture controlled rather than a union of two
 *                overlapping guesses — a row that HAS an identity is never
 *                matched positionally, so a moved unit's rows cannot surface
 *                under its old number.
 *   otherwise    position alone. Under LEGACY_SCAN the columns do not exist to
 *                be queried, and under FAIL_CLOSED nothing may be written
 *                anyway; showing the editor what is there beats showing
 *                nothing, and `contentUnitId: null` in the response says the
 *                chapter cannot host a binding.
 */
export function chapterRowScope(
  authority: ReservationAuthority,
  chapter: { contentUnitId: string } | null,
  bookSlug: string,
  chapterOrder: number,
): Prisma.ChapterExperienceVersionWhereInput {
  if (authority === "STRUCTURAL") {
    // A chapter that does not resolve has no rows, by definition: under the
    // cutover every row names a unit, and we cannot name this one.
    return chapter === null
      ? { id: { in: [] } }
      : { contentUnitId: chapter.contentUnitId };
  }
  if (authority === "BRIDGE") {
    const legacy = { contentUnitId: null, bookSlug, chapterOrder };
    return chapter === null
      ? legacy
      : { OR: [{ contentUnitId: chapter.contentUnitId }, legacy] };
  }
  return { bookSlug, chapterOrder };
}

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
  if (err instanceof CodeOwnedIdentityError) {
    // A definition the build ships whose chapter cannot be named. Nothing can
    // be decided about collisions while that is true, and guessing from its
    // declared position is the bug this replaced.
    throw new ConflictException({
      code: EXPERIENCE_CODE_OWNED_UNRESOLVED,
      message:
        "Una experiencia incluida en esta versión de la plataforma no se " +
        "puede ubicar en un capítulo. No se escribió nada.",
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
  /**
   * The shipped-claim resolver is injected, with production as the default.
   *
   * `@Optional()` so `new ExperienceAdminService(prisma)` still means the real
   * catalog — every existing caller keeps working — while a test can say what
   * the build ships without impersonating the three catalog tables that answer
   * it.
   */
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(EXPERIENCE_CODE_OWNED_CLAIMS)
    private readonly codeOwnedClaims: CodeOwnedClaimResolver = productionCodeOwnedClaims,
  ) {}

  /**
   * Everything an editor needs for one chapter: what code ships, what the
   * database holds, and the single guide a new experience may bind to.
   */
  async listForChapter(
    bookSlug: string,
    chapterOrder: number,
  ): Promise<AdminChapterExperiences> {
    // ONE SNAPSHOT, and `RepeatableRead` is what makes that word mean
    // something.
    //
    // The list is built from several reads: which authority the schema
    // supports, which unit this chapter is, which rows belong to that unit, and
    // which shipped definitions live in it. Under READ COMMITTED each sees
    // whatever is committed at the moment it runs, so a publish landing between
    // them produces an answer that never corresponded to any state of the
    // database — a chapter that resolves and holds rows while its shipped
    // definition has already become unplaceable, which surfaces as the list
    // refusing outright.
    //
    // Repeatable read makes them all describe the same instant. The result may
    // then be the manifest from before the publish or the one from after, and
    // either is a true answer; what it can no longer be is half of each.
    //
    // A read, so no locks: `lock: "none"` and no `FOR UPDATE`. A list built
    // from a manifest that moved a moment ago is stale, not wrong, and
    // serialising every admin read against every publish would buy nothing.
    const { chapter, rows, fromCode } = await this.prisma.$transaction(
      async (tx) => {
        const authority = await readReservationAuthority(tx);
        const resolved = await resolveChapterIdentityQuietly(tx, {
          bookSlug,
          chapterOrder,
        });
        return {
          chapter: resolved,
          rows: await tx.chapterExperienceVersion.findMany({
            where: chapterRowScope(authority, resolved, bookSlug, chapterOrder),
            orderBy: [{ experienceKey: "asc" }, { experienceVersion: "asc" }],
          }),
          // Resolved on the SAME snapshot, so the two halves of the list cannot
          // describe two different manifests.
          fromCode:
            resolved === null
              ? []
              : (await this.codeOwnedClaims(tx, resolved.contentUnitId)).map(
                  (claim) => claim.definition,
                ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const experiences: AdminExperienceRow[] = [];

    // Code-owned definitions are listed so an editor can SEE them and start a
    // next version from them. They are never copied in automatically.
    //
    // Selected by IDENTITY (see `codeOwnedClaimsForUnit`). Listing them by
    // `(bookSlug, chapterOrder)` would show a shipped journey under whichever
    // unit inherited its number after a reorder — the editor would be reading
    // one chapter's experiences while looking at another's.
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
      // The stable identity, echoed so the client can hand it back with the
      // next write. Null says this chapter cannot host a binding at all — which
      // is what the editor needs to know before being offered a button.
      contentUnitId: chapter?.contentUnitId ?? null,
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
    contentUnitId: string | null;
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
    // The row's OWN chapter, not one derived from its number. The editor echoes
    // it back on save and publish, and the server compares.
    return {
      id: row.id,
      status: row.status,
      definition,
      contentUnitId: row.contentUnitId,
    };
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
    expectedContentUnitId?: string | null,
  ): Promise<{ id: string }> {
    // C.4 — the editor chooses, and the server decides whether the choice is
    // one it will honour. A pin the client omits falls back to the chapter's
    // own, which keeps every existing caller working unchanged.
    const requested = input.guidePin ?? null;
    const pin =
      requested ??
      productionGuideDiscoveryCatalog.getExactContext(
        input.bookSlug,
        input.chapterOrder,
      );
    if (pin === null) {
      throw new BadRequestException({
        code: "NO_GUIDE_FOR_CHAPTER",
        message: "No hay una guía base disponible para este capítulo.",
      });
    }
    this.assertPinBindable(pin, input);

    const definition = this.rebuildAsDraft(input, pin);
    return this.withBinding(
      {
        bookSlug: definition.bookSlug,
        chapterOrder: definition.chapterOrder,
        expectedContentUnitId,
      },
      async (tx, chapter) => {
        await this.reserveFor(tx, chapter, definition);
        return this.insert(tx, userId, definition, chapter);
      },
    );
  }

  /**
   * May this chapter bind this pin at all?
   *
   * Two questions the browser is not allowed to answer. The registry one is
   * obvious; the anchor one is the reason C.2 has a «No disponible aquí» state
   * at all — a guide whose passage lives in another chapter produces a card
   * that publishes cleanly and opens for nobody
   * (CROSS_CHAPTER_GUIDE_BINDING=forbidden).
   */
  private assertPinBindable(
    pin: { guideKey: string; guideVersion: number },
    where: { bookSlug: string; chapterOrder: number },
  ): void {
    try {
      productionGuideRegistry.getExact(pin.guideKey, pin.guideVersion);
    } catch {
      throw new UnprocessableEntityException({
        code: "EXPERIENCE_GUIDE_PIN_NOT_REGISTERED",
        message: "Esa guía no existe en esta versión de la plataforma.",
      });
    }
    if (!guideAnchorAppliesToChapter(pin, where)) {
      throw new UnprocessableEntityException({
        code: "EXPERIENCE_GUIDE_PIN_NOT_RUNNABLE_HERE",
        message:
          "El pasaje de esa guía pertenece a otro capítulo, así que nadie " +
          "podría abrir la experiencia aquí.",
      });
    }
  }

  /**
   * The guides an editor may pick for this chapter, with availability.
   *
   * Read under the chapter lock like any other binding question: an answer
   * computed outside it describes a moment a colleague may already have left.
   */
  async listSelectableGuides(
    bookSlug: string,
    chapterOrder: number,
    experienceKey: string | null,
  ): Promise<SelectableGuideOption[]> {
    return this.withBinding({ bookSlug, chapterOrder }, async (tx, chapter) => {
      const shipped =
        await productionExperienceRepository.listPublishedForChapter({
          bookSlug,
          chapterOrder,
        });
      const view = await readChapterBindings(tx, {
        contentUnitId: chapter.contentUnitId,
        bookSlug,
        chapterOrder,
        codeOwned: shipped.map((d) => ({
          experienceKey: d.experienceKey,
          guideKey: d.guidePin.guideKey,
        })),
      });
      return selectableGuidesForChapter({
        bookSlug,
        chapterOrder,
        experienceKey,
        view,
      });
    });
  }

  /**
   * Authority, then the whole lock protocol, then the caller — in that order,
   * always.
   *
   * The order is the guarantee. Checking the authority first means a command
   * never writes into a schema shape this binary does not understand; entering
   * the protocol takes the global key, then the edition row, then the chapter
   * key, so identity is resolved under a lock a concurrent reorder must also
   * take; and doing all of it inside the transaction is what lets the C.3B
   * backfill exclude every bridge writer by taking the same global key.
   */
  private async withBinding<T>(
    where: BindingTarget,
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
        return run(tx, await enterBindingProtocol(tx, where));
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
    //
    // Placed by IDENTITY, not by `(bookSlug, chapterOrder)`. Listing them by
    // position while every stored claim is scoped by `contentUnitId` compares
    // two different chapters the moment an editor reorders the book.
    const view = await readChapterBindings(tx, {
      contentUnitId: chapter.contentUnitId,
      bookSlug: definition.bookSlug,
      chapterOrder: definition.chapterOrder,
      codeOwned: await this.codeOwnedClaims(tx, chapter.contentUnitId),
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
    expectedContentUnitId?: string | null,
  ): Promise<{ id: string }> {
    // The OUTER read learns one thing only: which chapter to lock. Everything
    // the write is decided on is read again inside, under it.
    const locator = await this.readDatabaseRow(experienceKey, fromVersion);
    const outerSource =
      locator?.definition ??
      (await productionExperienceRepository.getExact({
        experienceKey,
        experienceVersion: fromVersion,
      }));
    if (outerSource === null) {
      throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });
    }

    return this.withBinding(
      {
        bookSlug: outerSource.bookSlug,
        chapterOrder: outerSource.chapterOrder,
        // The next version lands in the chapter the SOURCE ROW is in, not the
        // one its stale `chapterOrder` points at. A code-owned source has no
        // row, so it resolves by position — which is all it has.
        contentUnitId: locator?.contentUnitId ?? null,
        expectedContentUnitId,
      },
      async (tx, chapter) => {
        // Re-read under the lock. The outer copy told us where to lock; what a
        // version is CLONED from has to be the state the lock is protecting.
        const inner = await tx.chapterExperienceVersion.findUnique({
          where: {
            experienceKey_experienceVersion: {
              experienceKey,
              experienceVersion: fromVersion,
            },
          },
          select: { definitionJson: true },
        });
        const source =
          inner === null
            ? outerSource
            : validateExperienceDefinition(inner.definitionJson);

        // The version number is decided under the lock too: computed outside,
        // two concurrent clones could pick the same one and one of them would
        // die on the unique index instead of taking the next free number.
        const highest = await tx.chapterExperienceVersion.findFirst({
          where: { experienceKey },
          orderBy: { experienceVersion: "desc" },
          select: { experienceVersion: true },
        });
        const nextVersion =
          Math.max(highest?.experienceVersion ?? 0, fromVersion) + 1;

        // The SOURCE's exact pin, never the chapter's current one. Looking it
        // up by `source.chapterOrder` would ask "which guide does this NUMBER
        // publish today" — and after a reorder that is a different guide, so
        // cloning a version would silently rebind the lineage.
        const definition = this.rebuildAsDraft(
          { ...source, experienceVersion: nextVersion },
          source.guidePin,
        );

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
    expectedContentUnitId?: string | null,
  ): Promise<{ id: string }> {
    // The OUTER read learns one thing only: which chapter to lock. Status,
    // identity and the guide pin are all re-read inside, under it — deciding
    // any of them from a read taken before the lock is deciding from a moment
    // that may already be over.
    const locator = await this.prisma.chapterExperienceVersion.findUnique({
      where: { id },
      select: { bookSlug: true, chapterOrder: true, contentUnitId: true },
    });
    if (!locator) throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });

    return this.withBinding(
      {
        bookSlug: locator.bookSlug,
        chapterOrder: locator.chapterOrder,
        // The row's OWN chapter, when it has one. Resolving by `chapterOrder`
        // instead would follow a stale number onto whichever unit inherited it
        // — a save would quietly move the draft to another chapter.
        contentUnitId: locator.contentUnitId,
        expectedContentUnitId,
      },
      async (tx, chapter) => {
        const row = await tx.chapterExperienceVersion.findUnique({
          where: { id },
          select: {
            status: true,
            experienceKey: true,
            experienceVersion: true,
            bookSlug: true,
            chapterOrder: true,
            definitionJson: true,
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

        // The pin the row ALREADY holds, read from what is stored.
        //
        // This used to ask the discovery catalog which guide
        // `(bookSlug, chapterOrder)` publishes — and that is a question about a
        // NUMBER. After a reorder the number belongs to a different unit, so
        // saving an untouched draft would rebind it to that unit's guide, or
        // fail with NO_GUIDE_FOR_CHAPTER for a chapter the draft never left.
        // A save is not a rebind.
        const storedPin = validateExperienceDefinition(
          row.definitionJson,
        ).guidePin;

        // Identity is the row's, not the payload's: a save may not move a draft
        // to another key, version, book or chapter — nor to another guide. A
        // `guidePin` in the request is overwritten here and never read.
        const definition = this.rebuildAsDraft(
          {
            ...input,
            experienceKey: row.experienceKey,
            experienceVersion: row.experienceVersion,
            bookSlug: row.bookSlug,
            chapterOrder: row.chapterOrder,
          },
          storedPin,
        );

        // The reservation check runs anyway, because "this cannot move a
        // binding" is worth verifying when the alternative is a silent rebind.
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
  async publish(
    id: string,
    expectedContentUnitId?: string | null,
  ): Promise<{ id: string; publishedAt: string }> {
    const row = await this.prisma.chapterExperienceVersion.findUnique({
      where: { id },
      select: { bookSlug: true, chapterOrder: true, contentUnitId: true },
    });
    if (!row) throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });

    return this.withBinding(
      {
        bookSlug: row.bookSlug,
        chapterOrder: row.chapterOrder,
        // Same reason as `saveDraft`: publishing must not relocate the row.
        contentUnitId: row.contentUnitId,
        expectedContentUnitId,
      },
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

  /**
   * C.4 — move a draft to another guide, before it has ever been published.
   *
   * Allowed only while the lineage has never published: after that the
   * `guideKey` IS the lineage identity, and moving it would strand every
   * session already walking the published version
   * (PUBLISHED_GUIDE_KEY_IMMUTABLE=true).
   *
   * Atomic by construction. The new reservation is acquired BEFORE the old one
   * is released, both inside one transaction under the chapter lock — a release
   * that happened first would open a window where a colleague could take the
   * guide this draft is about to move back to on rollback. The primary key on
   * `(contentUnitId, experienceKey)` is what stops a lineage from ever holding
   * two at once, so the move is an update of one row, not two rows in flight.
   */
  async rebindDraft(
    id: string,
    pin: { guideKey: string; guideVersion: number },
  ): Promise<{ id: string }> {
    const row = await this.prisma.chapterExperienceVersion.findUnique({
      where: { id },
      select: { bookSlug: true, chapterOrder: true },
    });
    if (!row) throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });
    this.assertPinBindable(pin, row);

    return this.withBinding(
      { bookSlug: row.bookSlug, chapterOrder: row.chapterOrder },
      async (tx, chapter) => {
        const current = await tx.chapterExperienceVersion.findUnique({
          where: { id },
        });
        if (!current) {
          throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });
        }
        if (current.status !== "DRAFT") {
          throw new ConflictException({
            code: "EXPERIENCE_VERSION_NOT_DRAFT",
            message: "Solo un borrador puede cambiar de guía.",
          });
        }

        // Never published, in ANY version of this lineage. One published
        // version is enough to fix the guide forever.
        const published = await tx.chapterExperienceVersion.count({
          where: {
            experienceKey: current.experienceKey,
            status: "PUBLISHED",
          },
        });
        if (published > 0) {
          throw new ConflictException({
            code: "EXPERIENCE_BINDING_IMMUTABLE",
            message:
              "Esta experiencia ya tiene una versión publicada, así que su " +
              "guía queda fija. Crea una experiencia nueva para otra guía.",
          });
        }

        const definition = this.rebuildAsDraft(
          validateExperienceDefinition(current.definitionJson),
          pin,
        );
        await this.reserveFor(tx, chapter, definition);

        // The lineage's reservation is UPDATED, not deleted and recreated:
        // deleting it would be refused by the foreign key while this row still
        // references it, and that refusal is the guarantee, not an obstacle.
        await tx.experienceGuideReservation.update({
          where: {
            contentUnitId_experienceKey: {
              contentUnitId: chapter.contentUnitId,
              experienceKey: current.experienceKey,
            },
          },
          data: { guideKey: pin.guideKey },
        });
        await tx.chapterExperienceVersion.update({
          where: { id },
          data: {
            definitionJson: definition as unknown as never,
            contentUnitId: chapter.contentUnitId,
            guideKey: pin.guideKey,
          },
        });
        return { id };
      },
    );
  }

  /**
   * C.4 — archive a draft. Terminal, non-destructive, and it gives the guide
   * back.
   *
   * What survives: the row, its version number, its whole `definitionJson`
   * including the historical `guidePin`, and `contentUnitId`. Identity is
   * history and does not evaporate because an editor stopped working on
   * something.
   *
   * What is released: the `guideKey` COLUMN, set to null. With either column
   * null the composite foreign key is not evaluated, so the row stops holding
   * its reservation — and the reservation itself is deleted only when no
   * DRAFT or PUBLISHED version of the lineage still needs it. The database
   * enforces that order: deleting it early is refused, not merely avoided.
   */
  async archiveDraft(id: string): Promise<{ id: string }> {
    const row = await this.prisma.chapterExperienceVersion.findUnique({
      where: { id },
      select: { bookSlug: true, chapterOrder: true },
    });
    if (!row) throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });

    return this.withBinding(
      { bookSlug: row.bookSlug, chapterOrder: row.chapterOrder },
      async (tx, chapter) => {
        const current = await tx.chapterExperienceVersion.findUnique({
          where: { id },
        });
        if (!current) {
          throw new NotFoundException({ code: "EXPERIENCE_NOT_FOUND" });
        }
        if (current.status === "ARCHIVED") {
          throw new ConflictException({
            code: "EXPERIENCE_ALREADY_ARCHIVED",
            message: "Esta versión ya está archivada.",
          });
        }
        if (current.status !== "DRAFT") {
          throw new ConflictException({
            code: "EXPERIENCE_VERSION_NOT_DRAFT",
            message:
              "Una versión publicada no se archiva: sigue sirviéndose a quien " +
              "la empezó.",
          });
        }

        await tx.chapterExperienceVersion.update({
          where: { id },
          data: { status: "ARCHIVED", guideKey: null },
        });

        // Release only when nothing else holds it. `RESTRICT` would refuse the
        // delete anyway; asking first turns a constraint violation into a
        // deliberate no-op.
        const stillReserving = await tx.chapterExperienceVersion.count({
          where: {
            experienceKey: current.experienceKey,
            contentUnitId: chapter.contentUnitId,
            status: { in: ["DRAFT", "PUBLISHED"] },
          },
        });
        if (stillReserving === 0) {
          await tx.experienceGuideReservation.deleteMany({
            where: {
              contentUnitId: chapter.contentUnitId,
              experienceKey: current.experienceKey,
            },
          });
        }
        return { id };
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

  /** A stored version, with the chapter its ROW names rather than its number. */
  private async readDatabaseRow(
    experienceKey: string,
    experienceVersion: number,
  ): Promise<{
    definition: ChapterExperienceDefinition;
    contentUnitId: string | null;
  } | null> {
    const row = await this.prisma.chapterExperienceVersion.findUnique({
      where: {
        experienceKey_experienceVersion: { experienceKey, experienceVersion },
      },
      select: { definitionJson: true, contentUnitId: true },
    });
    if (!row) return null;
    const definition = validateExperienceDefinitionQuietly(row.definitionJson);
    if (definition === null) return null;
    return { definition, contentUnitId: row.contentUnitId };
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

/**
 * Identity for a READ: the answer, or null when the chapter has none.
 *
 * A refusal is data here, not an error. An editor opening an unadopted or
 * unplaced chapter should see the rows that exist and be told the chapter
 * cannot host a binding — not a 409 where a page should be. Anything that is
 * not an identity refusal still propagates: a dead connection is not an
 * editorial verdict.
 */
async function resolveChapterIdentityQuietly(
  tx: Prisma.TransactionClient,
  where: { bookSlug: string; chapterOrder: number },
): Promise<ResolvedChapterIdentity | null> {
  try {
    return await resolveChapterIdentity(tx, { ...where, lock: "none" });
  } catch (err) {
    if (err instanceof ChapterIdentityError) return null;
    throw err;
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
