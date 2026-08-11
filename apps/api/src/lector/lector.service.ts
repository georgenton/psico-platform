import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import { Plan } from "@prisma/client";
import {
  nextPlacedOrder,
  readerTotalChapters,
  resolveNativeChapter,
  resolveNativeUnitById,
  resolveReaderChapter,
  type NativeChapterTarget,
} from "./reader-chapter-resolver";
import type {
  LectorAudioMetadata,
  LectorAudioResponse,
  LectorChapterResponse,
  LectorCompleteResponse,
  LectorSessionHeartbeatResponse,
} from "@psico/types";
import type { Env } from "../config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { StorageService } from "../storage";
import { blockKeyFromLegacyId } from "../content-core/lib/block-key";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ContentAccessService } from "../content-core/access/content-access.service";
import { resolveAnchorTarget } from "./anchor-resolver";
import { withResolvedImageUrls } from "../shared/content-asset";
import type { LectorSessionHeartbeatDto } from "./dto/heartbeat.dto";

/**
 * LectorService — Sprint S6.
 *
 * Aggregates everything the reader needs in one shot:
 *   - book + chapter metadata
 *   - ChapterBlock[] (the actual reading content)
 *   - lessons (Exercise[]) attached to the chapter
 *   - the calling user's highlights + annotations for this chapter
 *   - the user's reading session snapshot (progress, lastBlockId)
 *   - the user's reader preferences (theme/font/fontSize)
 *
 * One round-trip per chapter render so the mobile reader can boot offline
 * after the first fetch. The audio track lives on a separate endpoint
 * (signed URL is expensive to mint and may not even be needed).
 */

/**
 * Lifetime of the chapter-audio signed URL. Exported so the chapter-media
 * layer (GR-2) can report a truthful `expiresAt` for the audiobook instead of
 * keeping a second copy of this number that could drift from the real one.
 */
export const CHAPTER_AUDIO_SIGNED_URL_TTL_SEC = 60 * 60 * 6;

@Injectable()
export class LectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly storage: StorageService,
    private readonly access: ContentAccessService,
  ) {}

  // ─── GET /api/lector/:bookId/:chapterN ──────────────────────────────────

  async getChapter(
    userId: string,
    userPlan: Plan,
    bookIdOrSlug: string,
    chapterOrder: number,
  ): Promise<LectorChapterResponse> {
    // Accept either CUID or slug — the front routes by slug, the editor by id.
    const book = await this.prisma.book.findFirst({
      where: { OR: [{ id: bookIdOrSlug }, { slug: bookIdOrSlug }] },
      include: { author: true },
    });
    if (!book) throw new NotFoundException("BOOK_NOT_FOUND");

    const target = await resolveReaderChapter(this.prisma, {
      bookId: book.id,
      bookSlug: book.slug,
      order: chapterOrder,
    });

    // A chapter Content Core owns outright: no Chapter row, so nothing below
    // can read one. Handled in its own method rather than by scattering null
    // checks through the legacy path, which stays exactly as it was.
    if (target.source === "content-core") {
      return this.getNativeChapter(userId, userPlan, book, target);
    }

    const chapter = await this.prisma.chapter.findUnique({
      where: { bookId_order: { bookId: book.id, order: chapterOrder } },
      include: {
        blocks: { orderBy: { order: "asc" } },
        exercises: { orderBy: { order: "asc" } },
        audios: { take: 1 },
      },
    });
    // `resolveReaderChapter` just found it, so this is belt and braces rather
    // than a real branch — but it keeps the query shape identical to before.
    if (!chapter) throw new NotFoundException("CHAPTER_NOT_FOUND");

    // CC-6E — the ONE content-access policy (shared with the Content Core read +
    // marks surfaces). First chapter is a free preview; later chapters of a PRO
    // book require an active subscription.
    await this.access.assertCanReadContent({
      userId,
      userPlan,
      bookId: book.id,
      chapterOrder,
    });

    const blockIds = chapter.blocks.map((b) => b.id);

    const [
      highlights,
      annotations,
      session,
      prefs,
      completedChapters,
      totalChapters,
    ] = await Promise.all([
      blockIds.length > 0
        ? this.prisma.highlight.findMany({
            where: { userId, blockId: { in: blockIds } },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      blockIds.length > 0
        ? this.prisma.annotation.findMany({
            where: { userId, blockId: { in: blockIds } },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      this.prisma.readingSession.upsert({
        where: { userId_chapterId: { userId, chapterId: chapter.id } },
        create: { userId, chapterId: chapter.id, lastSeenAt: new Date() },
        update: {},
      }),
      this.prisma.readerPreferences.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
      // Status of each lesson is derived from UserProgress on the chapter
      // (a chapter is `completed` when the user POSTs /complete). v1 keeps
      // it simple: all lessons share the chapter status. Per-lesson status
      // arrives with the lesson detail page in a future sprint.
      this.prisma.userProgress.findFirst({
        where: { userId, chapterId: chapter.id },
        select: { completedAt: true },
      }),
      // A legacy chapter of a book that ALSO has native ones: the count the
      // reader needs is the published manifest's, not `Book.totalChapters`,
      // which stops moving the moment a chapter exists without a Chapter row.
      readerTotalChapters(this.prisma, {
        bookSlug: book.slug,
        legacyTotal: book.totalChapters,
      }),
    ]);

    const chapterCompleted = completedChapters !== null;

    return {
      book: {
        id: book.id,
        slug: book.slug,
        title: book.title,
        authorName: book.author?.name ?? null,
        cover: book.cover,
        totalChapters,
      },
      chapter: {
        id: chapter.id,
        order: chapter.order,
        title: chapter.title,
        subtitle: chapter.description,
        durationMinutes: chapter.durationMinutes,
        audioAvailable: chapter.audios.length > 0,
        partNumber: chapter.partNumber ?? null,
        partTitle: chapter.partTitle ?? null,
        // Legacy chapters keep writing by their Chapter id; null tells a client
        // exactly that, without it having to guess from the shape.
        contentUnitId: null,
      },
      // Image URLs resolved on the way out: the bucket is private, so what is
      // stored is an identity rather than something a browser can fetch.
      blocks: withResolvedImageUrls(
        chapter.blocks.map((b) => ({
          id: b.id,
          order: b.order,
          kind: b.kind,
          content: b.content,
          meta: (b.meta as Record<string, unknown> | null) ?? null,
        })),
        this.config.get("R2_PUBLIC_URL", { infer: true }) as string | undefined,
      ),
      lessons: chapter.exercises.map((e) => ({
        id: e.id,
        title: e.title,
        kind: e.type,
        durationMinutes: null,
        status: chapterCompleted
          ? ("completed" as const)
          : ("available" as const),
      })),
      // These marks are queried by legacy blockId ∈ this chapter's blocks, so
      // blockId is always present here (CC-6C made the column nullable for
      // pure-core marks, which the /content marks surface serves instead).
      highlights: highlights.map((h) => ({
        id: h.id,
        blockKey: h.blockId ? blockKeyFromLegacyId(h.blockId) : "",
        blockId: h.blockId,
        startOffset: h.startOffset,
        endOffset: h.endOffset,
        color: h.color,
        note: h.note,
        createdAt: h.createdAt,
      })),
      annotations: annotations.map((a) => ({
        id: a.id,
        blockKey: a.blockId ? blockKeyFromLegacyId(a.blockId) : "",
        blockId: a.blockId,
        text: a.text,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      session: {
        progressPct: session.progressPct,
        lastBlockId: session.lastBlockId,
        timeSpentSec: session.timeSpentSec,
        startedAt: session.startedAt,
        lastSeenAt: session.lastSeenAt,
        completedAt: session.completedAt,
      },
      preferences: {
        theme: prefs.theme as "system" | "light" | "sepia" | "dark",
        font: prefs.font as "serif" | "sans",
        fontSize: prefs.fontSize,
        lineHeight: prefs.lineHeight,
      },
    };
  }

  /**
   * The envelope for a chapter that exists only in Content Core.
   *
   * Every field comes from the published snapshot. The optional extras are
   * empty and say so truthfully rather than being faked:
   *
   *   lessons        — exercises are still a legacy-only concept
   *   audioAvailable — `Chapter.audios` cannot exist without a Chapter
   *   blocks         — clients read the text from the Content Core surface
   *   highlights /   — marks live on the Content Core marks surface, keyed by
   *   annotations      blockKey; the legacy arrays would only ever be empty
   *
   * A chapter with none of those extras is still a perfectly valid chapter.
   */
  private async getNativeChapter(
    userId: string,
    userPlan: Plan,
    book: {
      id: string;
      slug: string;
      title: string;
      cover: string;
      totalChapters: number;
      author: { name: string } | null;
    },
    target: NativeChapterTarget,
  ): Promise<LectorChapterResponse> {
    // #580's gate, by unit identity. Never the legacy chapter-order path: a
    // native unit has no order to look up and no Book row to consult.
    await this.access.assertCanReadUnit({
      userId,
      userPlan,
      editionKey: target.editionKey,
      unitKey: target.unitKey,
    });

    // No `UserProgress` read here: on the legacy path it only drives per-lesson
    // status, and a native chapter has no lessons yet. Completion still reaches
    // the client through `session.completedAt`.
    const [session, prefs, totalChapters] = await Promise.all([
      this.prisma.readingSession.upsert({
        where: {
          userId_contentUnitId: { userId, contentUnitId: target.contentUnitId },
        },
        create: {
          userId,
          contentUnitId: target.contentUnitId,
          lastSeenAt: new Date(),
        },
        update: {},
      }),
      this.prisma.readerPreferences.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
      readerTotalChapters(this.prisma, {
        bookSlug: book.slug,
        legacyTotal: book.totalChapters,
      }),
    ]);

    return {
      book: {
        id: book.id,
        slug: book.slug,
        title: book.title,
        authorName: book.author?.name ?? null,
        cover: book.cover,
        // Derived from the manifest, so a native chapter is actually reachable
        // by navigation. `Book.totalChapters` is never written to.
        totalChapters,
      },
      chapter: {
        // The stable identity of a native chapter IS its unit. Putting a
        // fabricated Chapter id here would be a lie every client then stores.
        id: target.contentUnitId,
        order: target.order,
        title: target.title,
        subtitle: target.summary,
        durationMinutes: target.durationMinutes,
        audioAvailable: false,
        partNumber: target.partNumber,
        partTitle: target.partTitle,
        // The stable write identity, stated in the contract rather than smuggled
        // past the type.
        contentUnitId: target.contentUnitId,
      },
      blocks: [],
      lessons: [],
      highlights: [],
      annotations: [],
      session: {
        progressPct: session.progressPct,
        lastBlockId: session.lastBlockId,
        timeSpentSec: session.timeSpentSec,
        startedAt: session.startedAt,
        lastSeenAt: session.lastSeenAt,
        completedAt: session.completedAt,
      },
      preferences: {
        theme: prefs.theme as "system" | "light" | "sepia" | "dark",
        font: prefs.font as "serif" | "sans",
        fontSize: prefs.fontSize,
        lineHeight: prefs.lineHeight,
      },
    };
  }

  // ─── PATCH /api/lector/session ──────────────────────────────────────────

  async heartbeat(
    userId: string,
    dto: LectorSessionHeartbeatDto,
  ): Promise<LectorSessionHeartbeatResponse> {
    // A native identity, when the client has one, decides the write outright.
    // Position is where the reader NAVIGATED; the unit is what they opened, and
    // a structural publish can separate the two while the tab is open.
    if (dto.contentUnitId) {
      return this.nativeHeartbeat(userId, dto, dto.contentUnitId);
    }

    const chapter = await this.prisma.chapter.findUnique({
      where: {
        bookId_order: { bookId: dto.bookId, order: dto.chapterOrder },
      },
      select: { id: true },
    });

    if (!chapter) {
      // No legacy chapter at that position. Either the client is sending an
      // obsolete payload after an unpublish, or this is a native chapter — the
      // two are told apart by whether a native identity resolves, never by
      // trusting one the client supplied.
      return this.nativeHeartbeat(userId, dto);
    }

    // Guard 1: server caps time delta at 60 s. A tab waking from suspend
    // could otherwise credit hours. The client should heartbeat every 5 s;
    // anything beyond a minute is either lag or fishy.
    const cappedDelta = Math.min(dto.timeSpentDeltaSec, 60);

    // Guard 2: progress never decreases. The user can scroll back to reread
    // a block, but that doesn't subtract from "how much they've experienced".
    const existing = await this.prisma.readingSession.findUnique({
      where: { userId_chapterId: { userId, chapterId: chapter.id } },
      select: { progressPct: true, timeSpentSec: true },
    });

    const nextProgress = Math.max(existing?.progressPct ?? 0, dto.progressPct);
    const nextTimeSpent = (existing?.timeSpentSec ?? 0) + cappedDelta;

    const session = await this.prisma.readingSession.upsert({
      where: { userId_chapterId: { userId, chapterId: chapter.id } },
      create: {
        userId,
        chapterId: chapter.id,
        lastBlockId: dto.lastBlockId,
        progressPct: nextProgress,
        timeSpentSec: nextTimeSpent,
      },
      update: {
        lastBlockId: dto.lastBlockId,
        progressPct: nextProgress,
        timeSpentSec: nextTimeSpent,
      },
    });

    return { ok: true, progressPct: session.progressPct };
  }

  /**
   * Heartbeat for a chapter that exists only in Content Core.
   *
   * The unit is resolved SERVER-side from the book plus the position, against
   * the published manifest. A `contentUnitId` the browser sent would let a
   * caller write progress into an edition they cannot read, so it is never the
   * thing that decides where the write lands.
   *
   * The same soft-fail as the legacy path: an obsolete payload is acked rather
   * than turned into an error a reader would see mid-page.
   */
  private async nativeHeartbeat(
    userId: string,
    dto: LectorSessionHeartbeatDto,
    contentUnitId?: string,
  ): Promise<LectorSessionHeartbeatResponse> {
    const book = await this.prisma.book.findUnique({
      where: { id: dto.bookId },
      select: { slug: true },
    });
    if (!book) return { ok: true, progressPct: dto.progressPct };

    // With an identity: resolve THAT unit, wherever it now sits. Without one:
    // fall back to the position, which is all an older client can offer.
    const target = contentUnitId
      ? await resolveNativeUnitById(this.prisma, {
          bookSlug: book.slug,
          contentUnitId,
        })
      : await resolveNativeChapter(this.prisma, book.slug, dto.chapterOrder);
    // A unit from another book, a draft-only one, or one that has been
    // unpublished resolves to nothing and writes nothing.
    if (!target) return { ok: true, progressPct: dto.progressPct };

    const cappedDelta = Math.min(dto.timeSpentDeltaSec, 60);
    const existing = await this.prisma.readingSession.findUnique({
      where: {
        userId_contentUnitId: { userId, contentUnitId: target.contentUnitId },
      },
      select: { progressPct: true, timeSpentSec: true },
    });
    const nextProgress = Math.max(existing?.progressPct ?? 0, dto.progressPct);
    const nextTimeSpent = (existing?.timeSpentSec ?? 0) + cappedDelta;

    const session = await this.prisma.readingSession.upsert({
      where: {
        userId_contentUnitId: { userId, contentUnitId: target.contentUnitId },
      },
      create: {
        userId,
        contentUnitId: target.contentUnitId,
        lastBlockId: dto.lastBlockId,
        progressPct: nextProgress,
        timeSpentSec: nextTimeSpent,
      },
      update: {
        lastBlockId: dto.lastBlockId,
        progressPct: nextProgress,
        timeSpentSec: nextTimeSpent,
      },
    });
    return { ok: true, progressPct: session.progressPct };
  }

  /**
   * Completion for a chapter that exists only in Content Core.
   *
   * Recorded against the UNIT, so a later reorder moves the chapter without
   * moving what somebody finished.
   *
   * Deliberately no streak side effect — because the legacy path has none
   * either. Parity, not omission.
   */
  private async completeNativeChapter(
    userId: string,
    book: { id: string; slug: string; totalChapters: number },
    chapterOrder: number,
    contentUnitId?: string,
  ): Promise<LectorCompleteResponse> {
    const target = contentUnitId
      ? await resolveNativeUnitById(this.prisma, {
          bookSlug: book.slug,
          contentUnitId,
        })
      : await resolveNativeChapter(this.prisma, book.slug, chapterOrder);
    if (!target) throw new NotFoundException("CHAPTER_NOT_FOUND");

    await this.prisma.$transaction([
      this.prisma.readingSession.upsert({
        where: {
          userId_contentUnitId: { userId, contentUnitId: target.contentUnitId },
        },
        create: {
          userId,
          contentUnitId: target.contentUnitId,
          progressPct: 1,
          completedAt: new Date(),
        },
        update: { progressPct: 1, completedAt: new Date() },
      }),
      this.prisma.userProgress.upsert({
        where: {
          userId_contentUnitId: { userId, contentUnitId: target.contentUnitId },
        },
        create: { userId, contentUnitId: target.contentUnitId },
        update: {},
      }),
    ]);

    // Navigation continues from where the unit ACTUALLY is now, not from the
    // stale position the client was showing — and it asks the manifest what
    // comes next rather than assuming positions are dense.
    const nextChapter = await nextPlacedOrder(this.prisma, {
      bookSlug: book.slug,
      after: target.order,
    });
    return { ok: true, nextChapter };
  }

  // ─── POST /api/lector/:bookId/:chapterN/complete ───────────────────────

  async completeChapter(
    userId: string,
    bookIdOrSlug: string,
    chapterOrder: number,
    contentUnitId?: string,
  ): Promise<LectorCompleteResponse> {
    const book = await this.prisma.book.findFirst({
      where: { OR: [{ id: bookIdOrSlug }, { slug: bookIdOrSlug }] },
      select: { id: true, slug: true, totalChapters: true },
    });
    if (!book) throw new NotFoundException("BOOK_NOT_FOUND");

    if (contentUnitId) {
      return this.completeNativeChapter(
        userId,
        book,
        chapterOrder,
        contentUnitId,
      );
    }

    const chapter = await this.prisma.chapter.findUnique({
      where: { bookId_order: { bookId: book.id, order: chapterOrder } },
      select: { id: true },
    });
    if (!chapter) {
      return this.completeNativeChapter(userId, book, chapterOrder);
    }

    // Two things in one transaction: mark the session completed and record
    // UserProgress. We don't want a partial state where the session shows
    // complete but the book progress doesn't.
    //
    // No streak side effect, despite what an older version of this comment
    // said: `currentStreakDays` is only ever READ (Home), never written here or
    // anywhere else triggered by completion. The native path below matches, so
    // streak behaviour does not depend on which identity a chapter has.
    await this.prisma.$transaction([
      this.prisma.readingSession.upsert({
        where: { userId_chapterId: { userId, chapterId: chapter.id } },
        create: {
          userId,
          chapterId: chapter.id,
          progressPct: 1,
          completedAt: new Date(),
        },
        update: {
          progressPct: 1,
          completedAt: new Date(),
        },
      }),
      this.prisma.userProgress.upsert({
        where: { userId_chapterId: { userId, chapterId: chapter.id } },
        create: { userId, chapterId: chapter.id },
        update: {},
      }),
    ]);

    // Where "next" lives is a question about the book's current structure, and
    // a legacy chapter can be followed by a native one. Ask the manifest first;
    // fall back to the legacy column only for a book Content Core does not
    // serve yet, where the arithmetic is still the only answer available.
    const [placedNext, total] = await Promise.all([
      nextPlacedOrder(this.prisma, {
        bookSlug: book.slug,
        after: chapterOrder,
      }),
      readerTotalChapters(this.prisma, {
        bookSlug: book.slug,
        legacyTotal: book.totalChapters,
      }),
    ]);
    const nextChapter =
      placedNext ?? (chapterOrder < total ? chapterOrder + 1 : null);
    return { ok: true, nextChapter };
  }

  // ─── GET /api/lector/:bookId/:chapterN/audio ───────────────────────────

  async getAudio(
    userPlan: Plan,
    bookIdOrSlug: string,
    chapterOrder: number,
  ): Promise<LectorAudioResponse> {
    if (userPlan === "FREE") throw new ForbiddenException("PRO_REQUIRED");

    const book = await this.prisma.book.findFirst({
      where: { OR: [{ id: bookIdOrSlug }, { slug: bookIdOrSlug }] },
      select: {
        id: true,
        title: true,
        cover: true,
        coverArtUrl: true,
        author: { select: { name: true } },
      },
    });
    if (!book) throw new NotFoundException("BOOK_NOT_FOUND");

    const chapter = await this.prisma.chapter.findUnique({
      where: { bookId_order: { bookId: book.id, order: chapterOrder } },
      include: { audios: { take: 1 } },
    });
    if (!chapter || chapter.audios.length === 0) {
      throw new NotFoundException("AUDIO_NOT_AVAILABLE");
    }

    const audio = chapter.audios[0]!;

    // Audio.fileUrl stores the R2 object KEY (e.g. "audio/<book>/cap-1.mp3").
    // R2 is not served as a public bucket here (R2_PUBLIC_URL points at the
    // authenticated S3 endpoint), so we mint a short-lived presigned GET URL
    // the client streams directly. A 6h TTL comfortably covers a full chapter.
    // Legacy rows that stored a full http(s) URL are returned as-is.
    const isKey = !/^https?:\/\//i.test(audio.fileUrl);
    const url = isKey
      ? await this.storage.getSignedUrl(
          audio.fileUrl,
          CHAPTER_AUDIO_SIGNED_URL_TTL_SEC,
        )
      : audio.fileUrl;

    // Transcript split: server-side we keep the transcript as a single
    // string in `Audio.transcription`. For v1 we ship it as one segment so
    // the client renders a single transcript pane. When VoiceModule learns
    // to do segmented transcripts (Whisper word-level), we'll switch to a
    // proper JSON column.
    const segments = audio.transcription
      ? [
          {
            start: 0,
            end: audio.durationSeconds,
            text: audio.transcription,
            blockId: null,
          },
        ]
      : [];

    // Lock-screen metadata. Returned in the response so the client can:
    //   1. Render artwork + title in its own audio bar UI.
    //   2. Pass them to a future media library that supports dynamic
    //      lock-screen metadata (expo-audio / react-native-track-player).
    // With current expo-av the iOS lock screen / Android MediaSession
    // ONLY reads embedded ID3v2/m4a tags from the audio file itself.
    // See LectorModule README §audio for the ffmpeg embed snippet.
    //
    // Artwork resolution order: explicit coverArtUrl → fallback chain via
    // PUBLIC_URL + cover token. The cover token resolves to a gradient
    // in-app but for lock-screen we need a real PNG, so prefer coverArtUrl.
    //
    // The title is the chapter's own title, with no number in front of it.
    // `chapter.order` is where the unit sits in the reading sequence; in a
    // book whose first unit is a preface it runs one ahead of the editorial
    // number, so prefixing it here would put a wrong chapter number in front
    // of the reader. This metadata is what the WEB player renders — and what
    // a future media client could hand to the OS. The mobile lock screen
    // today reads the embedded ID3/M4A tags instead, as the note above says.
    // No layer stores an editorial label yet — when one exists, it goes here.
    const metadata: LectorAudioMetadata = {
      title: chapter.title,
      subtitle: book.title,
      artist: book.author?.name ?? "Psico Platform",
      artworkUrl: book.coverArtUrl ?? book.cover ?? "",
    };

    return {
      url,
      durationSec: audio.durationSeconds,
      transcript: segments,
      metadata,
    };
  }

  // ─── Helpers used by Highlights/Annotations controllers ────────────────

  async assertBlockExists(blockId: string): Promise<void> {
    const exists = await this.prisma.chapterBlock.findUnique({
      where: { id: blockId },
      select: { id: true, content: true },
    });
    if (!exists) throw new NotFoundException("BLOCK_NOT_FOUND");
  }

  async getBlockContentLength(blockId: string): Promise<number> {
    const block = await this.prisma.chapterBlock.findUnique({
      where: { id: blockId },
      select: { content: true },
    });
    if (!block) throw new NotFoundException("BLOCK_NOT_FOUND");
    return block.content.length;
  }

  /** Throws if the highlight offsets exceed the block content. */
  async validateHighlightOffsets(
    blockId: string,
    startOffset: number,
    endOffset: number,
  ): Promise<void> {
    if (startOffset >= endOffset) {
      throw new BadRequestException("INVALID_OFFSETS");
    }
    const len = await this.getBlockContentLength(blockId);
    if (endOffset > len) {
      throw new BadRequestException("OFFSET_OUT_OF_RANGE");
    }
  }

  /**
   * CC-6B anchor bridge. Resolve a mark's target from `{ blockKey?, blockId? }`
   * to the storage anchor `{ blockId, contentBlockId }`, fail-closed:
   *  - `blockKey` present → the ContentBlock's legacy binding is the anchor; if a
   *    `blockId` is ALSO given it must correspond, else ANCHOR_IDENTITY_MISMATCH;
   *  - `blockKey` for a pure Content Core block (no legacy binding) → not yet
   *    anchorable (ANCHOR_UNSUPPORTED_CORE_BLOCK);
   *  - only `blockId` → legacy path (dual-writes contentBlockId when it exists);
   *  - neither → ANCHOR_MISSING_TARGET.
   * `contentBlockId` is stored for the dual-read bridge but is NEVER a public id.
   */
  resolveAnchorTarget(input: {
    blockKey?: string;
    blockId?: string;
  }): Promise<{ blockId: string; contentBlockId: string | null }> {
    return resolveAnchorTarget(this.prisma, input);
  }
}
