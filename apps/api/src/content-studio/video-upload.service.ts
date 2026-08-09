import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  CloudflareStreamUploadService,
  type StreamIngestState,
} from "../lector/media/cloudflare-stream-upload.service";
import {
  productionChapterMediaRegistry,
  validateChapterMediaDefinition,
  type ChapterMediaDefinition,
} from "../lector/media/chapter-media.catalog";

/**
 * Content Studio — uploading a chapter VIDEO.
 *
 * The shape differs from audio (C2B) in one decisive way: the bytes never pass
 * through this server. Cloudflare allocates the video and hands back a one-time
 * URL; the browser posts the file straight there. So an upload here is not one
 * request that either succeeded or failed — it is a small state machine the
 * editor can walk away from and come back to.
 *
 *   intent      → a video is allocated, the draft holds `pendingVideoUid`,
 *                 the definition has NO source (nothing is playable yet)
 *   ↓ browser posts the file to Cloudflare, with no involvement from us
 *   status      → we ask the provider; while it encodes, nothing changes here
 *   ↓ provider says ready
 *   promotion   → the source is written, the duration comes from the PROVIDER,
 *                 and `pendingVideoUid` is cleared
 *   publish     → the ordinary media publish, which now has a real source
 *
 * Two invariants hold the whole thing together:
 *
 * 1. `source !== null` keeps meaning "actually playable", everywhere, for every
 *    kind. A Stream UID that exists but has no bytes behind it is not a source,
 *    so it is not stored as one. This is what lets the reader-facing repository,
 *    the admin card and the publish rule stay ignorant of C3 entirely.
 *
 * 2. A draft still holding `pendingVideoUid` cannot be published. That is a
 *    provider-free rule — no network call, no readiness guess — and it is
 *    precisely the "publish requires ready" gate, expressed as data rather than
 *    as a check somebody could forget to run.
 *
 * Video is 0..N, like podcast: a chapter may carry several. An episode is
 * addressed by its own `mediaKey`; omitting it means "a new one".
 */

/** What the browser needs, and nothing more. The video UID is not in here. */
export interface VideoUploadIntent {
  draftId: string;
  mediaKey: string;
  mediaVersion: number;
  /** One-time, credential-free, expires on its own. */
  uploadUrl: string;
  expiresAt: string;
}

export interface VideoUploadStatus {
  draftId: string;
  state: StreamIngestState;
  /** True once the source is written and the draft can be published. */
  sourceReady: boolean;
  durationSec: number | null;
}

/**
 * Subtitle language for a new video.
 *
 * Server-owned, like the access policy: the browser does not choose it, because
 * it is the language the video is actually in, not a preference. Spanish is the
 * only language the catalogue currently ships.
 */
const DEFAULT_CAPTION_LANGUAGE = "es";

@Injectable()
export class VideoUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stream: CloudflareStreamUploadService,
  ) {}

  /**
   * Whether the CMS may offer video upload at all.
   *
   * Surfaced to the browser as a plain boolean so the editor is never led
   * through a flow that ends in a provider error. The reason it is false is
   * never sent: "no configurado" and "sin capacidad contratada" are the same
   * fact to an editor, and only one of them is anybody else's business.
   */
  uploadsAvailable(): boolean {
    return this.stream.uploadsAvailable();
  }

  /**
   * Allocate a video and stage a draft pointing at it.
   *
   * Case A — this video has never been playable (runtime «En producción»).
   * Re-recording it keeps the existing identity: no completion can exist against
   * something that never played, so minting a new version would churn identity
   * for nobody's benefit.
   *
   * Case B — it is already playable. A new file is a different video, so it
   * takes a new key and `mediaVersion + 1`. Overwriting v1 would silently change
   * what a finished watch meant.
   */
  async createUploadIntent(
    bookSlug: string,
    chapterOrder: number,
    input: { mediaKey?: string; title?: string; description?: string },
    adminUserId: string,
  ): Promise<VideoUploadIntent> {
    // Checked here and not only in the UI. A hidden button is a courtesy; this
    // is the rule. Refusing before any provider call also means an editor who
    // reaches this route another way gets a clean answer rather than a quota
    // error phrased in someone else's vocabulary.
    if (!this.uploadsAvailable()) {
      throw new ServiceUnavailableException({
        code: "VIDEO_UPLOAD_UNAVAILABLE",
      });
    }
    await this.assertChapterExists(bookSlug, chapterOrder);

    let next: ChapterMediaDefinition;
    let supersedesDraftId: string | null = null;

    if (input.mediaKey) {
      const existing = await this.resolveByKey(
        input.mediaKey,
        bookSlug,
        chapterOrder,
      );
      if (existing.definition.kind !== "VIDEO") {
        throw new BadRequestException({ code: "MEDIA_KIND_MISMATCH" });
      }
      next = existing.playable
        ? this.nextVersionOf(existing.definition) // case B
        : this.sameIdentity(existing.definition); // case A
      supersedesDraftId = existing.draftId;
    } else {
      if (!input.title?.trim() || !input.description?.trim()) {
        throw new BadRequestException({ code: "VIDEO_METADATA_REQUIRED" });
      }
      next = this.newVideo(
        bookSlug,
        chapterOrder,
        input.title.trim(),
        input.description.trim(),
      );
    }

    // Allocate FIRST: if the provider refuses (unconfigured, out of capacity,
    // unreachable) there is no half-made draft to explain afterwards.
    const allocated = await this.stream.createDirectUpload({
      name: `${next.mediaKey} · ${next.title}`,
    });

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (supersedesDraftId) {
          // Replacing an unpublished staging attempt. Its Stream asset is left
          // alone: an editor may still have that upload URL open in another tab.
          await tx.chapterMediaVersion.deleteMany({
            where: { id: supersedesDraftId, editorialStatus: "DRAFT" },
          });
        }
        return tx.chapterMediaVersion.create({
          data: {
            mediaKey: next.mediaKey,
            mediaVersion: next.mediaVersion,
            bookSlug: next.bookSlug,
            chapterOrder: next.chapterOrder,
            kind: "VIDEO",
            editorialStatus: "DRAFT",
            definitionJson: next as unknown as object,
            pendingVideoUid: allocated.videoUid,
            createdByUserId: adminUserId,
          },
          select: { id: true },
        });
      });

      return {
        draftId: row.id,
        mediaKey: next.mediaKey,
        mediaVersion: next.mediaVersion,
        uploadUrl: allocated.uploadUrl,
        expiresAt: allocated.expiresAt,
      };
    } catch (err) {
      // We allocated a video and then failed to record it, so nothing references
      // it and nobody can be watching it. Leaving it would quietly consume
      // storage on an account that bills for exactly that.
      await this.stream.deleteVideo(allocated.videoUid);
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

  /**
   * Ask the provider how the upload is going, and promote it if it finished.
   *
   * Promotion is idempotent and one-way: once the source is written the pending
   * marker is gone, so a second call reports `READY` from our own row without
   * touching the provider at all. That matters because the CMS polls this.
   */
  async getUploadStatus(draftId: string): Promise<VideoUploadStatus> {
    const row = await this.prisma.chapterMediaVersion.findUnique({
      where: { id: draftId },
    });
    if (!row) throw new NotFoundException({ code: "MEDIA_DRAFT_NOT_FOUND" });
    if (row.kind !== "VIDEO") {
      throw new BadRequestException({ code: "MEDIA_KIND_MISMATCH" });
    }

    const def = validateChapterMediaDefinition(row.definitionJson);

    if (!row.pendingVideoUid) {
      // Already promoted, or never an upload at all (an adopted code video).
      return {
        draftId: row.id,
        state: def.source !== null ? "READY" : "AWAITING_UPLOAD",
        sourceReady: def.source !== null,
        durationSec: def.durationSec,
      };
    }

    const status = await this.stream.getStatus(row.pendingVideoUid);

    if (status.state !== "READY") {
      return {
        draftId: row.id,
        state: status.state,
        sourceReady: false,
        durationSec: null,
      };
    }

    // Ready. The duration comes from the provider measuring the actual file —
    // there is no form field for it, because a typed number would be a guess
    // about content the provider has already inspected.
    const promoted = validateChapterMediaDefinition({
      ...def,
      status: "PUBLISHED",
      durationSec: status.durationSec ?? def.durationSec,
      // Server-owned, and inherited from whatever the chapter's videos already
      // used rather than defaulting to anything more open.
      accessPolicy:
        def.accessPolicy ?? this.policyFor(def.bookSlug, def.chapterOrder),
      source: {
        kind: "CLOUDFLARE_STREAM",
        videoUid: row.pendingVideoUid,
        captionLanguage: DEFAULT_CAPTION_LANGUAGE,
      },
    });

    await this.prisma.chapterMediaVersion.update({
      where: { id: row.id },
      data: {
        definitionJson: promoted as unknown as object,
        pendingVideoUid: null,
      },
    });

    return {
      draftId: row.id,
      state: "READY",
      sourceReady: true,
      durationSec: promoted.durationSec,
    };
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** A brand-new video: fresh key, no source, publicly «En producción». */
  private newVideo(
    bookSlug: string,
    chapterOrder: number,
    title: string,
    description: string,
  ): ChapterMediaDefinition {
    return validateChapterMediaDefinition({
      mediaKey: `${bookSlug}-c${chapterOrder}-video-${Date.now().toString(36)}-v1`,
      mediaVersion: 1,
      bookSlug,
      chapterOrder,
      kind: "VIDEO",
      // Runtime DRAFT until the bytes land: this is the honest public state of
      // a video that has been announced but cannot be watched.
      status: "DRAFT",
      title,
      description,
      durationSec: null,
      // The catalog holds «En producción» to mean exactly that: no file, and no
      // entitlement decision yet either. Both are made together at promotion,
      // when there is something to gate.
      accessPolicy: null,
      source: null,
      posterObjectKey: null,
      transcriptObjectKey: null,
      chapters: [],
    });
  }

  /** Case A — never played, so the identity is reused and the source cleared. */
  private sameIdentity(previous: ChapterMediaDefinition) {
    return validateChapterMediaDefinition({
      ...previous,
      status: "DRAFT",
      durationSec: null,
      source: null,
      accessPolicy: null,
    });
  }

  /** Case B — already playable, so a new file is a new version. */
  private nextVersionOf(previous: ChapterMediaDefinition) {
    const version = previous.mediaVersion + 1;
    const rekeyed = previous.mediaKey.replace(/-v\d+$/, `-v${version}`);
    return validateChapterMediaDefinition({
      ...previous,
      mediaKey:
        rekeyed === previous.mediaKey
          ? `${previous.mediaKey}-v${version}`
          : rekeyed,
      mediaVersion: version,
      status: "DRAFT",
      durationSec: null,
      source: null,
      accessPolicy: null,
    });
  }

  /**
   * Access policy is SERVER-owned. The browser never sends one, and a new video
   * inherits what the format already used rather than defaulting to anything
   * more open.
   */
  private policyFor(
    bookSlug: string,
    chapterOrder: number,
  ): "PRO_ONLY" | "BOOK_ENTITLEMENT" {
    const sibling = productionChapterMediaRegistry
      .forChapter(bookSlug, chapterOrder)
      .find((d) => d.kind === "VIDEO" && d.accessPolicy !== null);
    return sibling?.accessPolicy ?? "PRO_ONLY";
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
      const def = validateChapterMediaDefinition(row.definitionJson);
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
    if (!fromCode) {
      throw new NotFoundException({ code: "MEDIA_DEFINITION_NOT_FOUND" });
    }
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

  private async assertChapterExists(bookSlug: string, chapterOrder: number) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { book: { slug: bookSlug }, order: chapterOrder },
      select: { id: true },
    });
    if (!chapter) throw new NotFoundException({ code: "CHAPTER_NOT_FOUND" });
  }
}
