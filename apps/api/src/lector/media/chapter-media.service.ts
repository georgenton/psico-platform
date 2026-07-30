import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Plan, PrismaClient } from "@prisma/client";
import type {
  ChapterMediaAccessResponse,
  ChapterMediaManifestResponse,
  ChapterMediaSummary,
} from "@psico/types";
import type { ValidatedLearningEvent } from "../../learning/validated-learning-event";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LearningCatalogResolver } from "../../learning/learning-catalog.resolver";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LearningEventRepository } from "../../learning/learning-event.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
import { StorageService } from "../../storage";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ContentAccessService } from "../../content-core/access/content-access.service";
import { unitKeyFromLegacyChapterId } from "../../content-core/lib/block-key";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LectorService } from "../lector.service";
import { CHAPTER_AUDIO_SIGNED_URL_TTL_SEC } from "../lector.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CloudflareStreamAccessService } from "./cloudflare-stream-access.service";
import {
  ChapterMediaCatalogError,
  productionChapterMediaRegistry,
} from "./chapter-media.catalog";
import type {
  ChapterMediaCatalogRegistry,
  ChapterMediaDefinition,
} from "./chapter-media.catalog";
import { chapterMediaCompletionIdempotencyKey } from "./chapter-media-idempotency";

/**
 * GR-2 — the chapter media surface: what exists, how to play it, and the single
 * completion event.
 *
 * Reuse is the point of this service. It does not open a second S3 client, does
 * not create an audio table, does not re-implement entitlement, and does not
 * write learning events directly:
 *
 *   - the audiobook signs through `LectorService.getAudio`, the path that
 *     already serves `GET /api/lector/:book/:order/audio`;
 *   - new R2 objects sign through the shared `StorageService`;
 *   - the video signs through the small Stream access service;
 *   - entitlement is `ContentAccessService`, the one content gate (CC-6E);
 *   - the completion goes through `LearningEventRepository.appendValidated`,
 *     the single writer.
 */

/** New R2 objects — podcast, transcript, poster. */
export const R2_MEDIA_SIGNED_URL_TTL_SEC = 60 * 60;

/**
 * The registry is injected rather than imported so a test can exercise real
 * PostgreSQL against fixture definitions (an R2 podcast, a Stream video, a
 * second version) without those fixtures ever entering the productive list.
 * `LectorModule` binds it to `productionChapterMediaRegistry`.
 */
export const CHAPTER_MEDIA_REGISTRY = "CHAPTER_MEDIA_REGISTRY";

export const DEFAULT_CHAPTER_MEDIA_REGISTRY = productionChapterMediaRegistry;

@Injectable()
export class ChapterMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: ContentAccessService,
    private readonly lector: LectorService,
    private readonly stream: CloudflareStreamAccessService,
    private readonly catalog: LearningCatalogResolver,
    private readonly events: LearningEventRepository,
    @Inject(CHAPTER_MEDIA_REGISTRY)
    private readonly registry: ChapterMediaCatalogRegistry,
  ) {}

  // ─── GET /api/lector/:bookIdOrSlug/:chapterOrder/media ───────────────────

  /**
   * Metadata + availability. Signs nothing: a manifest that carried signed URLs
   * would leak a bearer into every page load, cached or not.
   *
   * Availability answers "does the asset exist", not "may this person play it".
   * A FREE reader legitimately sees the audiobook listed as AVAILABLE and gets
   * the Pro upsell when they ask for access — the same shape the audio bar has
   * always used.
   */
  async getManifest(
    userId: string,
    userPlan: Plan,
    bookIdOrSlug: string,
    chapterOrder: number,
  ): Promise<ChapterMediaManifestResponse> {
    const book = await this.prisma.book.findFirst({
      where: { OR: [{ id: bookIdOrSlug }, { slug: bookIdOrSlug }] },
      select: { slug: true },
    });
    if (!book) throw new NotFoundException("BOOK_NOT_FOUND");

    // The shared gate's discovery form: validates the book and refuses a book
    // this person cannot see at all.
    await this.access.assertCanSeeBook({
      userId,
      userPlan,
      bookSlug: book.slug,
    });

    const items = this.registry
      .forChapter(book.slug, chapterOrder)
      .map(toSummary);

    return { bookSlug: book.slug, chapterOrder, items };
  }

  // ─── GET /api/lector/media/:mediaKey/access ──────────────────────────────

  /**
   * The only place a signed URL exists. Called after the person picks a format,
   * never during server rendering.
   */
  async getAccess(
    userId: string,
    userPlan: Plan,
    mediaKey: string,
  ): Promise<ChapterMediaAccessResponse> {
    const def = this.requirePlayable(mediaKey);
    await this.assertEntitled(userId, userPlan, def);

    const [transcriptUrl, posterUrl] = await Promise.all([
      this.signOptional(def.transcriptObjectKey),
      this.signOptional(def.posterObjectKey),
    ]);

    const source = def.source!;

    if (source.kind === "CLOUDFLARE_STREAM") {
      const access = await this.stream.createAccess({
        videoUid: source.videoUid,
        captionLanguage: source.captionLanguage,
      });
      return {
        kind: "VIDEO",
        mediaKey: def.mediaKey,
        mediaVersion: def.mediaVersion,
        embedUrl: access.embedUrl,
        expiresAt: access.expiresAt,
        transcriptUrl,
        posterUrl,
        defaultTextTrack: access.defaultTextTrack,
      };
    }

    // AUDIOBOOK | PODCAST — both hand the browser a URL for `<audio>`.
    const audioKind = def.kind === "AUDIOBOOK" ? "AUDIOBOOK" : "PODCAST";

    if (source.kind === "CHAPTER_AUDIO") {
      // Reuse: the existing chapter-audio path signs the existing `Audio` row.
      // Its NotFoundException means the catalog says PUBLISHED while the row is
      // missing — an ops gap, reported as "not available yet", never as a 500.
      const audio = await this.lector
        .getAudio(userPlan, def.bookSlug, def.chapterOrder)
        .catch(() => {
          throw new NotFoundException("MEDIA_NOT_AVAILABLE");
        });
      return {
        kind: audioKind,
        mediaKey: def.mediaKey,
        mediaVersion: def.mediaVersion,
        url: audio.url,
        expiresAt: expiresIn(CHAPTER_AUDIO_SIGNED_URL_TTL_SEC),
        transcriptUrl,
        posterUrl,
      };
    }

    const url = await this.storage.getSignedUrl(
      source.objectKey,
      R2_MEDIA_SIGNED_URL_TTL_SEC,
    );
    return {
      kind: audioKind,
      mediaKey: def.mediaKey,
      mediaVersion: def.mediaVersion,
      url,
      expiresAt: expiresIn(R2_MEDIA_SIGNED_URL_TTL_SEC),
      transcriptUrl,
      posterUrl,
    };
  }

  // ─── POST /api/lector/media/:mediaKey/complete ───────────────────────────

  /**
   * The completion command. It accepts no context from the client: the kind,
   * the version, the editorial unit and the idempotency key are all derived
   * server-side from `mediaKey` plus the authenticated actor.
   *
   * One transaction, so the entitlement snapshot and the append either both
   * hold or neither happened. `created` maps to 201, `replayed` to 200.
   *
   * What the event means: the client reported the player reached its end.
   * Nothing about comprehension, attention or feeling — and nothing reaches the
   * Emotional Map.
   */
  async complete(
    userId: string,
    userPlan: Plan,
    mediaKey: string,
  ): Promise<{ created: boolean; replayed: boolean }> {
    const def = this.requirePlayable(mediaKey);

    return this.prisma.$transaction(async (tx) => {
      const chapterId = await this.resolveChapterId(def, tx);
      const unitKey = unitKeyFromLegacyChapterId(chapterId);
      const ctx = await this.catalog.resolveUnit(unitKey, tx);

      // The shared gate, on the transaction's snapshot (CC-7.4C). Both the gate
      // and the payload use the RESOLVER's key: `unitKey` above only opens the
      // lookup, and the resolver is the authority on the canonical value.
      await this.access.assertCanReadUnit(
        { userId, userPlan, editionKey: ctx.editionKey, unitKey: ctx.unitKey },
        tx,
      );
      this.assertPolicy(userPlan, def);

      const event: ValidatedLearningEvent<"chapter_media_completed"> = {
        userId,
        idempotencyKey: chapterMediaCompletionIdempotencyKey(
          def.mediaKey,
          def.mediaVersion,
        ),
        type: "chapter_media_completed",
        payload: {
          mediaKey: def.mediaKey,
          mediaKind: def.kind,
          mediaVersion: def.mediaVersion,
          unitKey: ctx.unitKey,
        },
        editionId: ctx.editionId,
        unitId: ctx.unitId,
      };

      const result = await this.events.appendValidated(event, tx);
      return { created: result.created, replayed: result.replayed };
    });
  }

  // ─── internals ──────────────────────────────────────────────────────────

  /** Unknown key → 404. DRAFT or source-less → "not available yet". */
  private requirePlayable(mediaKey: string): ChapterMediaDefinition {
    let def: ChapterMediaDefinition;
    try {
      def = this.registry.getExact(mediaKey);
    } catch (err) {
      if (err instanceof ChapterMediaCatalogError) {
        throw new NotFoundException("MEDIA_NOT_FOUND");
      }
      throw err;
    }
    if (def.status !== "PUBLISHED" || def.source === null) {
      throw new NotFoundException("MEDIA_NOT_AVAILABLE");
    }
    return def;
  }

  /**
   * Both gates, in order: the shared content policy first (it also proves the
   * book and chapter exist), then the format's own policy.
   */
  private async assertEntitled(
    userId: string,
    userPlan: Plan,
    def: ChapterMediaDefinition,
  ): Promise<void> {
    const book = await this.prisma.book.findUnique({
      where: { slug: def.bookSlug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException("BOOK_NOT_FOUND");

    await this.access.assertCanReadContent({
      userId,
      userPlan,
      bookId: book.id,
      chapterOrder: def.chapterOrder,
    });
    this.assertPolicy(userPlan, def);
  }

  /**
   * `PRO_ONLY` is a whole-format benefit and does not care about the chapter
   * number — it is what chapter audio already enforces. `BOOK_ENTITLEMENT`
   * adds nothing beyond the shared gate that already ran.
   */
  private assertPolicy(userPlan: Plan, def: ChapterMediaDefinition): void {
    if (def.accessPolicy === "PRO_ONLY" && userPlan === "FREE") {
      throw new ForbiddenException("PRO_REQUIRED");
    }
  }

  private async resolveChapterId(
    def: ChapterMediaDefinition,
    tx: Pick<PrismaClient, "book" | "chapter">,
  ): Promise<string> {
    const book = await tx.book.findUnique({
      where: { slug: def.bookSlug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException("BOOK_NOT_FOUND");

    const chapter = await tx.chapter.findUnique({
      where: { bookId_order: { bookId: book.id, order: def.chapterOrder } },
      select: { id: true },
    });
    if (!chapter) throw new NotFoundException("CHAPTER_NOT_FOUND");
    return chapter.id;
  }

  private async signOptional(objectKey: string | null): Promise<string | null> {
    if (!objectKey) return null;
    return this.storage.getSignedUrl(objectKey, R2_MEDIA_SIGNED_URL_TTL_SEC);
  }
}

function expiresIn(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * The public projection. Every provider-shaped field of the definition —
 * `source`, `accessPolicy`, `posterObjectKey`, `transcriptObjectKey`,
 * `bookSlug`, `chapterOrder` — is dropped or reduced to a boolean here. That is
 * the whole reason this function exists instead of a spread.
 */
export function toSummary(def: ChapterMediaDefinition): ChapterMediaSummary {
  return {
    mediaKey: def.mediaKey,
    mediaVersion: def.mediaVersion,
    kind: def.kind,
    title: def.title,
    description: def.description,
    durationSec: def.durationSec,
    availability:
      def.status === "PUBLISHED" && def.source !== null
        ? "AVAILABLE"
        : "COMING_SOON",
    hasTranscript: def.transcriptObjectKey !== null,
    hasCaptions: def.source?.kind === "CLOUDFLARE_STREAM",
    chapters: def.chapters.map((mark) => ({
      startSec: mark.startSec,
      label: mark.label,
    })),
  };
}
