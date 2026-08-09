import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { ChapterMediaKind } from "@psico/types";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import {
  assertUploadableAudio,
  audioObjectKey,
  type UploadedAudioFile,
} from "../shared/audio-upload";
import {
  productionChapterMediaRegistry,
  validateChapterMediaDefinition,
  type ChapterMediaDefinition,
} from "../lector/media/chapter-media.catalog";

/**
 * Content Studio — uploading audiobook and podcast MASTERS.
 *
 * Bytes go to R2 privately, under a key this server mints. Nothing here returns
 * or persists a public URL: protected media is read through a presigned GET, and
 * the moment a public URL is stored for a master it leaves the signing path
 * entirely. That is the failure the legacy `uploadFile` callers already have,
 * and the reason this uses `putObject` instead.
 *
 * Upload never publishes. Bytes land, a CMS DRAFT points at them, and a reader
 * sees nothing until somebody presses publish. Staged bytes sitting in R2
 * awaiting that decision are not an orphan — they are exactly what a draft is.
 *
 * ── The audiobook lifecycle ───────────────────────────────────────────────
 *
 * `Audio` stays the authority for the CURRENT master, which is what keeps the
 * audio bar, `LectorService.getAudio` and every `CHAPTER_AUDIO` definition
 * working untouched. But `Audio.fileUrl` is a MUTABLE pointer, and a mutable
 * pointer cannot represent history: if v1 says `CHAPTER_AUDIO` and we move the
 * pointer to v2's bytes, then resolving v1 starts playing v2. Someone who
 * completed v1 would find it now plays something they never heard.
 *
 * So publishing a replacement FREEZES v1 first — rewriting only its `source`
 * from the mutable `CHAPTER_AUDIO` to the immutable `R2` key it already
 * resolved to. Same bytes, same key, same version, same completion identity;
 * the only thing that changes is that it stops chasing a pointer that is about
 * to move.
 */

/** The one narrow published-row edit allowed, and only from here. */
type FrozenSource = { kind: "R2"; objectKey: string };

export interface UploadResult {
  draftId: string;
  mediaKey: string;
  mediaVersion: number;
  sourceReady: true;
}

@Injectable()
export class MediaUploadService {
  private readonly logger = new Logger("MediaUpload");

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ── Audiobook ────────────────────────────────────────────────────────────

  /**
   * Stage a new audiobook master.
   *
   * Case A — the chapter's audiobook has never been playable (runtime DRAFT /
   * «En producción»). Attaching the first real bytes keeps the existing
   * identity: no completion can exist against something that never played, so
   * minting a version would churn identity for nobody's benefit.
   *
   * Case B — the audiobook is already playable. A new recording is a different
   * master, so it takes a new key and `mediaVersion + 1`. Overwriting v1's bytes
   * would silently change what a finished listen meant.
   */
  async uploadAudiobook(
    bookSlug: string,
    chapterOrder: number,
    file: UploadedAudioFile | undefined,
    durationSec: number,
    adminUserId: string,
  ): Promise<UploadResult> {
    assertUploadableAudio(file);
    if (!Number.isInteger(durationSec) || durationSec <= 0) {
      // `Audio.durationSeconds` is required and the player draws a timeline from
      // it. Inventing one would put a wrong timeline in front of a listener.
      throw new BadRequestException({ code: "AUDIO_DURATION_REQUIRED" });
    }
    await this.assertChapterExists(bookSlug, chapterOrder);

    const current = await this.currentDefinition(
      bookSlug,
      chapterOrder,
      "AUDIOBOOK",
    );
    const objectKey = audioObjectKey(
      bookSlug,
      chapterOrder,
      "audiobook",
      file.mimetype,
    );

    const next = current?.playable
      ? this.nextVersionOf(current.definition, objectKey, durationSec) // case B
      : this.firstMasterFor(current?.definition, {
          bookSlug,
          chapterOrder,
          kind: "AUDIOBOOK",
          objectKey,
          durationSec,
        }); // case A

    return this.stage(
      next,
      objectKey,
      file,
      adminUserId,
      current?.draftId ?? null,
    );
  }

  // ── Podcast ──────────────────────────────────────────────────────────────

  /**
   * Stage a podcast episode's master.
   *
   * Podcast is 0..N, so an episode is addressed by its own `mediaKey` rather
   * than by kind. Omitting the key means "a new episode"; passing one means
   * "a new master for that episode", which follows the same case A/B rule.
   */
  async uploadPodcast(
    bookSlug: string,
    chapterOrder: number,
    file: UploadedAudioFile | undefined,
    input: {
      durationSec: number;
      mediaKey?: string;
      title?: string;
      description?: string;
    },
    adminUserId: string,
  ): Promise<UploadResult> {
    assertUploadableAudio(file);
    if (!Number.isInteger(input.durationSec) || input.durationSec <= 0) {
      throw new BadRequestException({ code: "AUDIO_DURATION_REQUIRED" });
    }
    await this.assertChapterExists(bookSlug, chapterOrder);

    const objectKey = audioObjectKey(
      bookSlug,
      chapterOrder,
      "podcast",
      file.mimetype,
    );

    let next: ChapterMediaDefinition;
    let supersedes: string | null = null;

    if (input.mediaKey) {
      const existing = await this.resolveByKey(
        input.mediaKey,
        bookSlug,
        chapterOrder,
      );
      if (existing.definition.kind !== "PODCAST") {
        throw new BadRequestException({ code: "MEDIA_KIND_MISMATCH" });
      }
      next = existing.playable
        ? this.nextVersionOf(existing.definition, objectKey, input.durationSec)
        : this.firstMasterFor(existing.definition, {
            bookSlug,
            chapterOrder,
            kind: "PODCAST",
            objectKey,
            durationSec: input.durationSec,
          });
      supersedes = existing.draftId;
    } else {
      // A brand-new episode. Its key carries a random leaf so two episodes
      // added the same day cannot collide.
      if (!input.title?.trim() || !input.description?.trim()) {
        throw new BadRequestException({ code: "EPISODE_METADATA_REQUIRED" });
      }
      const mediaKey = `${bookSlug}-c${chapterOrder}-podcast-${Date.now().toString(36)}-v1`;
      next = validateChapterMediaDefinition({
        mediaKey,
        mediaVersion: 1,
        bookSlug,
        chapterOrder,
        kind: "PODCAST",
        status: "PUBLISHED",
        title: input.title.trim(),
        description: input.description.trim(),
        durationSec: input.durationSec,
        accessPolicy: this.policyFor("PODCAST", bookSlug, chapterOrder),
        source: { kind: "R2", objectKey },
        posterObjectKey: null,
        transcriptObjectKey: null,
        chapters: [],
      });
    }

    return this.stage(next, objectKey, file, adminUserId, supersedes);
  }

  // ── Publish ──────────────────────────────────────────────────────────────

  /**
   * Publish a staged master.
   *
   * Podcast is the simple case: flip the row. Audiobook has to move the `Audio`
   * pointer, and everything in this transaction exists so that moving it cannot
   * change what an older version resolves to.
   */
  async publishStagedMaster(draftId: string) {
    const row = await this.prisma.chapterMediaVersion.findUnique({
      where: { id: draftId },
    });
    if (!row) throw new NotFoundException({ code: "MEDIA_DRAFT_NOT_FOUND" });
    if (row.editorialStatus !== "DRAFT") {
      throw new ConflictException({ code: "MEDIA_DEFINITION_PUBLISHED" });
    }

    const staged = validateChapterMediaDefinition(row.definitionJson);
    if (staged.source?.kind !== "R2") {
      throw new ConflictException({ code: "MEDIA_DRAFT_NOT_STAGED" });
    }

    if (staged.kind !== "AUDIOBOOK") {
      await this.prisma.chapterMediaVersion.update({
        where: { id: row.id },
        data: { editorialStatus: "PUBLISHED", publishedAt: new Date() },
      });
      return { mediaKey: staged.mediaKey, mediaVersion: staged.mediaVersion };
    }

    const newKey = staged.source.objectKey;

    return this.prisma.$transaction(async (tx) => {
      const chapter = await tx.chapter.findFirst({
        where: { book: { slug: staged.bookSlug }, order: staged.chapterOrder },
        select: { id: true, audios: { take: 1 } },
      });
      if (!chapter) throw new NotFoundException({ code: "CHAPTER_NOT_FOUND" });

      const audio = chapter.audios[0] ?? null;

      if (audio) {
        const previousValue = audio.fileUrl;
        const previousIsKey = !/^https?:\/\//i.test(previousValue);

        if (!previousIsKey) {
          // The current master is a legacy full URL. We cannot freeze the old
          // version to an object key we do not have, and guessing one would
          // make v1 resolve to bytes nobody verified. Refuse rather than
          // silently break historical playback.
          throw new ConflictException({
            code: "AUDIOBOOK_LEGACY_MASTER_REQUIRES_MIGRATION",
            message:
              "El audiolibro actual apunta a una URL heredada. Migrarlo a una clave de objeto es un paso aparte.",
          });
        }

        // FREEZE FIRST, then move the pointer. Any other order leaves a window
        // where the old version resolves to the new bytes.
        await this.freezePreviousAudiobook(tx, staged, previousValue);

        await tx.audio.update({
          where: { id: audio.id },
          data: {
            fileUrl: newKey,
            durationSeconds: staged.durationSec ?? audio.durationSeconds,
          },
        });
      } else {
        await tx.audio.create({
          data: {
            chapterId: chapter.id,
            title: staged.title,
            fileUrl: newKey,
            durationSeconds: staged.durationSec ?? 0,
          },
        });
      }

      // The published audiobook points at `Audio`, not at R2 — that is what
      // keeps a single current master and one place to change it.
      const published = validateChapterMediaDefinition({
        ...staged,
        source: { kind: "CHAPTER_AUDIO" },
      });

      await tx.chapterMediaVersion.update({
        where: { id: row.id },
        data: {
          definitionJson: published as unknown as object,
          editorialStatus: "PUBLISHED",
          publishedAt: new Date(),
        },
      });

      return { mediaKey: staged.mediaKey, mediaVersion: staged.mediaVersion };
    });
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Rewrite the PREVIOUS audiobook's source from the mutable `CHAPTER_AUDIO`
   * pointer to the exact key it currently resolves to.
   *
   * The narrowest possible published-row edit, and the only one that exists:
   * every other field is copied through untouched, so the version keeps its
   * title, its duration, its access policy and — decisively — its completion
   * identity. It represents the same bytes it always did.
   *
   * When the previous version is still code-owned, the freeze is written as a
   * DB row at the SAME key, which the hybrid repository already prefers.
   */
  private async freezePreviousAudiobook(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    incoming: ChapterMediaDefinition,
    previousObjectKey: string,
  ): Promise<void> {
    const rows = await tx.chapterMediaVersion.findMany({
      where: {
        bookSlug: incoming.bookSlug,
        chapterOrder: incoming.chapterOrder,
        kind: "AUDIOBOOK",
        editorialStatus: "PUBLISHED",
      },
    });

    const source: FrozenSource = { kind: "R2", objectKey: previousObjectKey };

    for (const r of rows) {
      if (r.mediaKey === incoming.mediaKey) continue;
      const def = validateChapterMediaDefinition(r.definitionJson);
      if (def.source?.kind !== "CHAPTER_AUDIO") continue;
      await tx.chapterMediaVersion.update({
        where: { id: r.id },
        data: {
          definitionJson: validateChapterMediaDefinition({
            ...def,
            source,
          }) as unknown as object,
        },
      });
    }

    // Code-owned previous versions have no row yet; write the frozen override at
    // the same key so the hybrid repository serves it instead.
    for (const def of productionChapterMediaRegistry.forChapter(
      incoming.bookSlug,
      incoming.chapterOrder,
    )) {
      if (def.kind !== "AUDIOBOOK") continue;
      if (def.mediaKey === incoming.mediaKey) continue;
      if (def.source?.kind !== "CHAPTER_AUDIO") continue;
      if (rows.some((r) => r.mediaKey === def.mediaKey)) continue;

      await tx.chapterMediaVersion.create({
        data: {
          mediaKey: def.mediaKey,
          mediaVersion: def.mediaVersion,
          bookSlug: def.bookSlug,
          chapterOrder: def.chapterOrder,
          kind: def.kind,
          editorialStatus: "PUBLISHED",
          definitionJson: validateChapterMediaDefinition({
            ...def,
            source,
          }) as unknown as object,
          publishedAt: new Date(),
        },
      });
    }
  }

  /**
   * Write the bytes, then the row. If the row fails, delete the bytes.
   *
   * Only ever the key minted moments ago: an existing master is never deleted
   * to roll anything back, because that would take content away from readers
   * who already have it.
   */
  private async stage(
    definition: ChapterMediaDefinition,
    objectKey: string,
    file: UploadedAudioFile,
    adminUserId: string,
    supersedesDraftId: string | null,
  ): Promise<UploadResult> {
    await this.storage.putObject(file.buffer, objectKey, file.mimetype);

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (supersedesDraftId) {
          // Replacing an unpublished staging attempt. Its bytes stay: they may
          // still be referenced by an editor's open tab, and an unreferenced
          // object under `media/` costs nothing next to deleting a live one.
          await tx.chapterMediaVersion.deleteMany({
            where: { id: supersedesDraftId, editorialStatus: "DRAFT" },
          });
        }
        return tx.chapterMediaVersion.create({
          data: {
            mediaKey: definition.mediaKey,
            mediaVersion: definition.mediaVersion,
            bookSlug: definition.bookSlug,
            chapterOrder: definition.chapterOrder,
            kind: definition.kind,
            editorialStatus: "DRAFT",
            definitionJson: definition as unknown as object,
            createdByUserId: adminUserId,
          },
          select: { id: true },
        });
      });

      return {
        draftId: row.id,
        mediaKey: definition.mediaKey,
        mediaVersion: definition.mediaVersion,
        sourceReady: true,
      };
    } catch (err) {
      // The bytes are referenced by nothing, so removing them takes nothing away.
      try {
        await this.storage.deleteObject(objectKey);
      } catch {
        this.logger.error(
          `orphaned upload could not be removed; key remains under media/`,
        );
      }
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "P2002"
      ) {
        throw new ConflictException({ code: "MEDIA_VERSION_ALREADY_EXISTS" });
      }
      throw err;
    }
  }

  /** A new master for something already playable: new key, next version. */
  private nextVersionOf(
    previous: ChapterMediaDefinition,
    objectKey: string,
    durationSec: number,
  ): ChapterMediaDefinition {
    const version = previous.mediaVersion + 1;
    const mediaKey = previous.mediaKey.replace(/-v\d+$/, `-v${version}`);
    return validateChapterMediaDefinition({
      ...previous,
      mediaKey:
        mediaKey === previous.mediaKey
          ? `${previous.mediaKey}-v${version}`
          : mediaKey,
      mediaVersion: version,
      status: "PUBLISHED",
      durationSec,
      accessPolicy:
        previous.accessPolicy ??
        this.policyFor(previous.kind, previous.bookSlug, previous.chapterOrder),
      source: { kind: "R2", objectKey },
    });
  }

  /** First real bytes for something that has never played: same identity. */
  private firstMasterFor(
    existing: ChapterMediaDefinition | undefined,
    params: {
      bookSlug: string;
      chapterOrder: number;
      kind: ChapterMediaKind;
      objectKey: string;
      durationSec: number;
    },
  ): ChapterMediaDefinition {
    const base =
      existing ??
      ({
        mediaKey: `${params.bookSlug}-c${params.chapterOrder}-${params.kind.toLowerCase()}-v1`,
        mediaVersion: 1,
        bookSlug: params.bookSlug,
        chapterOrder: params.chapterOrder,
        kind: params.kind,
        title: params.kind === "AUDIOBOOK" ? "Audiolibro" : "Podcast",
        description: "Pendiente de descripción editorial.",
        posterObjectKey: null,
        transcriptObjectKey: null,
        chapters: [],
      } as unknown as ChapterMediaDefinition);

    return validateChapterMediaDefinition({
      ...base,
      status: "PUBLISHED",
      durationSec: params.durationSec,
      accessPolicy: this.policyFor(
        params.kind,
        params.bookSlug,
        params.chapterOrder,
      ),
      source: { kind: "R2", objectKey: params.objectKey },
    });
  }

  /**
   * Access policy is SERVER-owned. The browser never sends one, and a new
   * master inherits what the format already used rather than defaulting to
   * anything more open.
   */
  private policyFor(
    kind: ChapterMediaKind,
    bookSlug: string,
    chapterOrder: number,
  ): "PRO_ONLY" | "BOOK_ENTITLEMENT" {
    const sibling = productionChapterMediaRegistry
      .forChapter(bookSlug, chapterOrder)
      .find((d) => d.kind === kind && d.accessPolicy !== null);
    return sibling?.accessPolicy ?? "PRO_ONLY";
  }

  /** The chapter's current definition of a kind, and whether it ever played. */
  private async currentDefinition(
    bookSlug: string,
    chapterOrder: number,
    kind: ChapterMediaKind,
  ) {
    const rows = await this.prisma.chapterMediaVersion.findMany({
      where: { bookSlug, chapterOrder, kind },
      orderBy: [{ mediaVersion: "desc" }],
    });

    for (const r of rows) {
      const def = this.rebuild(r.definitionJson);
      if (!def) continue;
      return {
        definition: def,
        draftId: r.editorialStatus === "DRAFT" ? r.id : null,
        playable:
          r.editorialStatus === "PUBLISHED" &&
          def.status === "PUBLISHED" &&
          def.source !== null,
      };
    }

    const fromCode = productionChapterMediaRegistry
      .forChapter(bookSlug, chapterOrder)
      .filter((d) => d.kind === kind)
      .sort((a, b) => b.mediaVersion - a.mediaVersion)[0];
    if (!fromCode) return null;

    return {
      definition: fromCode,
      draftId: null,
      playable: fromCode.status === "PUBLISHED" && fromCode.source !== null,
    };
  }

  private async resolveByKey(
    mediaKey: string,
    bookSlug: string,
    chapterOrder: number,
  ) {
    const row = await this.prisma.chapterMediaVersion.findFirst({
      where: { mediaKey },
      orderBy: [{ editorialStatus: "asc" }],
    });
    if (row) {
      const def = this.rebuild(row.definitionJson);
      if (!def)
        throw new ConflictException({ code: "MEDIA_DEFINITION_INVALID" });
      this.assertBelongs(def, bookSlug, chapterOrder);
      return {
        definition: def,
        draftId: row.editorialStatus === "DRAFT" ? row.id : null,
        playable:
          row.editorialStatus === "PUBLISHED" &&
          def.status === "PUBLISHED" &&
          def.source !== null,
      };
    }

    const fromCode = productionChapterMediaRegistry.find(mediaKey);
    if (!fromCode)
      throw new NotFoundException({ code: "MEDIA_DEFINITION_NOT_FOUND" });
    this.assertBelongs(fromCode, bookSlug, chapterOrder);
    return {
      definition: fromCode,
      draftId: null,
      playable: fromCode.status === "PUBLISHED" && fromCode.source !== null,
    };
  }

  /** An ADMIN knows keys; the route still decides which chapter they may touch. */
  private assertBelongs(
    def: ChapterMediaDefinition,
    bookSlug: string,
    chapterOrder: number,
  ): void {
    if (def.bookSlug !== bookSlug || def.chapterOrder !== chapterOrder) {
      throw new NotFoundException({ code: "MEDIA_DEFINITION_NOT_FOUND" });
    }
  }

  private rebuild(json: unknown): ChapterMediaDefinition | null {
    try {
      return validateChapterMediaDefinition(json);
    } catch {
      return null;
    }
  }

  private async assertChapterExists(bookSlug: string, chapterOrder: number) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { book: { slug: bookSlug }, order: chapterOrder },
      select: { id: true },
    });
    if (!chapter) throw new NotFoundException({ code: "CHAPTER_NOT_FOUND" });
  }
}
