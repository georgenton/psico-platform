import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import { Plan } from "@prisma/client";
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
import { resolveAnchorTarget } from "./anchor-resolver";
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
@Injectable()
export class LectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly storage: StorageService,
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

    const chapter = await this.prisma.chapter.findUnique({
      where: { bookId_order: { bookId: book.id, order: chapterOrder } },
      include: {
        blocks: { orderBy: { order: "asc" } },
        exercises: { orderBy: { order: "asc" } },
        audios: { take: 1 },
      },
    });
    if (!chapter) throw new NotFoundException("CHAPTER_NOT_FOUND");

    // Pro gate — the first chapter of every book is always free preview;
    // later chapters of PRO/ANNUAL books require an active subscription.
    if (book.plan === "PRO" && chapterOrder > 1 && userPlan === "FREE") {
      throw new ForbiddenException("PRO_REQUIRED");
    }

    const blockIds = chapter.blocks.map((b) => b.id);

    const [highlights, annotations, session, prefs, completedChapters] =
      await Promise.all([
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
      ]);

    const chapterCompleted = completedChapters !== null;

    return {
      book: {
        id: book.id,
        slug: book.slug,
        title: book.title,
        authorName: book.author?.name ?? null,
        cover: book.cover,
        totalChapters: book.totalChapters,
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
      },
      blocks: chapter.blocks.map((b) => ({
        id: b.id,
        order: b.order,
        kind: b.kind,
        content: b.content,
        meta: (b.meta as Record<string, unknown> | null) ?? null,
      })),
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

  // ─── PATCH /api/lector/session ──────────────────────────────────────────

  async heartbeat(
    userId: string,
    dto: LectorSessionHeartbeatDto,
  ): Promise<LectorSessionHeartbeatResponse> {
    const chapter = await this.prisma.chapter.findUnique({
      where: {
        bookId_order: { bookId: dto.bookId, order: dto.chapterOrder },
      },
      select: { id: true },
    });

    if (!chapter) {
      // The client could be sending an obsolete payload after a chapter was
      // unpublished. Soft-fail: ack the request without persisting.
      return { ok: true, progressPct: dto.progressPct };
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

  // ─── POST /api/lector/:bookId/:chapterN/complete ───────────────────────

  async completeChapter(
    userId: string,
    bookIdOrSlug: string,
    chapterOrder: number,
  ): Promise<LectorCompleteResponse> {
    const book = await this.prisma.book.findFirst({
      where: { OR: [{ id: bookIdOrSlug }, { slug: bookIdOrSlug }] },
      select: { id: true, totalChapters: true },
    });
    if (!book) throw new NotFoundException("BOOK_NOT_FOUND");

    const chapter = await this.prisma.chapter.findUnique({
      where: { bookId_order: { bookId: book.id, order: chapterOrder } },
      select: { id: true },
    });
    if (!chapter) throw new NotFoundException("CHAPTER_NOT_FOUND");

    // Persist three things in one transaction: mark session completed,
    // record UserProgress, push the streak counter on the user. We don't
    // want a partial state where the session shows complete but the
    // book progress doesn't.
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

    const nextChapter =
      chapterOrder < book.totalChapters ? chapterOrder + 1 : null;
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
      ? await this.storage.getSignedUrl(audio.fileUrl, 60 * 60 * 6)
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
    const metadata: LectorAudioMetadata = {
      title: `Cap. ${chapter.order} · ${chapter.title}`,
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
