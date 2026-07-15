import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { deriveMoodNormalization } from "../mood/mood-normalization";
import type {
  CreateDiaryEntryResponse,
  DeleteDiaryEntryResponse,
  DiaryDetailResponse,
  DiaryEntryDetail,
  DiaryEntryKind,
  DiaryEntrySummary,
  DiaryListResponse,
  DiaryMoodMap,
  DiaryPromptOfTheDay,
  DiaryRawCiphersResponse,
  DiaryTagCount,
  ShareDiaryEntryResponse,
} from "@psico/types";
import type { CreateDiaryEntryDto } from "./dto/create-entry.dto";
import type { UpdateDiaryEntryDto } from "./dto/update-entry.dto";
import type { ListDiaryEntriesQueryDto } from "./dto/list-entries-query.dto";
import type { ShareDiaryEntryDto } from "./dto/share-entry.dto";

const DEFAULT_PER_PAGE = 30;
const MAX_SHARE_DAYS = 30;
const DEFAULT_SHARE_DAYS = 7;
const RELATED_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReflexionesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── List ──────────────────────────────────────────────────────────────────

  async list(
    userId: string,
    query: ListDiaryEntriesQueryDto,
  ): Promise<DiaryListResponse> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? DEFAULT_PER_PAGE;
    const skip = (page - 1) * perPage;

    const where = this.buildListWhere(userId, query);

    const [rows, total, moodMap, tagsBucket] = await Promise.all([
      this.prisma.diaryEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage,
        include: { prompt: { select: { id: true, text: true } } },
      }),
      this.prisma.diaryEntry.count({ where }),
      this.computeMoodMap(userId, query),
      this.computeTagCounts(userId),
    ]);

    return {
      entries: rows.map((row) => this.toSummary(row)),
      moodMap,
      tags: tagsBucket,
      pagination: { page, perPage, total },
    };
  }

  // ─── Detail ────────────────────────────────────────────────────────────────

  async getDetail(
    userId: string,
    entryId: string,
  ): Promise<DiaryDetailResponse> {
    const entry = await this.prisma.diaryEntry.findFirst({
      where: { id: entryId, userId },
      include: { prompt: { select: { id: true, text: true } } },
    });
    if (!entry) throw new NotFoundException(`Entry '${entryId}' not found`);

    // Related entries: same mood OR overlapping tags within ±30 days of the
    // current entry. We return IDs only — the client correlates with its
    // already-decrypted cache.
    const since = new Date(entry.createdAt.getTime() - 30 * DAY_MS);
    const until = new Date(entry.createdAt.getTime() + 30 * DAY_MS);
    const related = await this.prisma.diaryEntry.findMany({
      where: {
        userId,
        id: { not: entryId },
        createdAt: { gte: since, lte: until },
        OR: [
          { mood: entry.mood },
          entry.tags.length > 0 ? { tags: { hasSome: entry.tags } } : {},
        ],
      },
      orderBy: { createdAt: "desc" },
      take: RELATED_LIMIT,
      select: { id: true },
    });

    return {
      entry: this.toDetail(entry),
      relatedEntryIds: related.map((r) => r.id),
    };
  }

  // ─── Create / update / delete ──────────────────────────────────────────────

  async create(
    userId: string,
    dto: CreateDiaryEntryDto,
  ): Promise<CreateDiaryEntryResponse> {
    this.assertExcerptPairing(dto.excerptCiphertext, dto.excerptNonce);
    if (dto.promptId) {
      await this.assertPromptExists(dto.promptId);
    }

    const created = await this.prisma.diaryEntry.create({
      data: {
        userId,
        // PR-2A · the raw mood is REQUIRED by the DTO, so it is preserved
        // untouched here (never null in PR-2A). Normalization is server-owned:
        // source=DIARY, and PR-2A carries NO explicit-selection signal from the
        // composer, so a reflexion is never eligible yet (a defaulted "ok" →
        // ambiguous_default, any other canonical → pre_normalizer_review,
        // legacy/unknown → excluded raw). The null-capable composer lands in
        // PR-2B, not here.
        mood: dto.mood,
        ...deriveMoodNormalization({
          raw: dto.mood,
          source: "DIARY",
          explicitlySelected: false,
        }),
        kind: dto.kind ?? "free",
        promptId: dto.promptId ?? null,
        textCiphertext: dto.textCiphertext,
        textNonce: dto.textNonce,
        excerptCiphertext: dto.excerptCiphertext ?? null,
        excerptNonce: dto.excerptNonce ?? null,
        tags: dto.tags ?? [],
        audioUrl: dto.audioUrl ?? null,
        audioDurationSec: dto.audioDurationSec ?? null,
      },
      select: { id: true, createdAt: true, excerptCiphertext: true },
    });

    return {
      ok: true,
      id: created.id,
      createdAt: created.createdAt,
      excerptCiphertext: created.excerptCiphertext,
    };
  }

  async update(
    userId: string,
    entryId: string,
    dto: UpdateDiaryEntryDto,
  ): Promise<DiaryDetailResponse> {
    const existing = await this.prisma.diaryEntry.findFirst({
      where: { id: entryId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Entry '${entryId}' not found`);

    // Cipher/nonce MUST move together. Allowing one without the other would
    // let a buggy client persist a body decryptable only with a wrong nonce.
    if (
      (dto.textCiphertext && !dto.textNonce) ||
      (!dto.textCiphertext && dto.textNonce)
    ) {
      throw new BadRequestException(
        "CIPHER_NONCE_PAIRING: textCiphertext and textNonce must change together",
      );
    }
    this.assertExcerptPairing(dto.excerptCiphertext, dto.excerptNonce);

    await this.prisma.diaryEntry.update({
      where: { id: entryId },
      data: {
        // PR-2A · when the mood changes, re-derive the server-owned columns.
        ...(dto.mood !== undefined && {
          mood: dto.mood ?? null,
          ...deriveMoodNormalization({
            raw: dto.mood ?? null,
            source: "DIARY",
            explicitlySelected: false,
          }),
        }),
        ...(dto.textCiphertext && {
          textCiphertext: dto.textCiphertext,
          textNonce: dto.textNonce!,
        }),
        ...(dto.excerptCiphertext !== undefined && {
          excerptCiphertext: dto.excerptCiphertext ?? null,
          excerptNonce: dto.excerptNonce ?? null,
        }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
      },
    });

    return this.getDetail(userId, entryId);
  }

  async remove(
    userId: string,
    entryId: string,
  ): Promise<DeleteDiaryEntryResponse> {
    const existing = await this.prisma.diaryEntry.findFirst({
      where: { id: entryId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Entry '${entryId}' not found`);

    // The cascade on SharedDiaryEntry.entryId is SetNull so the audit trail
    // ("user X shared an entry on day Y") survives even when the source is gone.
    await this.prisma.diaryEntry.delete({ where: { id: entryId } });
    return { ok: true };
  }

  // ─── Prompt rotation ───────────────────────────────────────────────────────

  /**
   * GET /diario/prompt-of-the-day — deterministic by day-of-year hash so the
   * client can cache aggressively. If the user dismissed a prompt today via
   * the reflection-prompts endpoint, we DO NOT fall through (different
   * surface — diario prompts are not dismissible).
   */
  async getPromptOfTheDay(): Promise<DiaryPromptOfTheDay | null> {
    const prompts = await this.prisma.diaryPrompt.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, text: true },
    });
    if (prompts.length === 0) return null;

    const idx = this.dayOfYear(new Date()) % prompts.length;
    return prompts[idx];
  }

  // ─── Share with therapist ──────────────────────────────────────────────────

  async share(
    userId: string,
    entryId: string,
    dto: ShareDiaryEntryDto,
  ): Promise<ShareDiaryEntryResponse> {
    const entry = await this.prisma.diaryEntry.findFirst({
      where: { id: entryId, userId },
      select: { id: true },
    });
    if (!entry) throw new NotFoundException(`Entry '${entryId}' not found`);

    // v1 does not have TherapyModule yet. Per ADR 0007 §E and Plan v2 §5.11,
    // we accept the share request but the therapist read endpoint
    // (/api/terapia/shared-entries/:id) lands in v2. We persist the blob now
    // so users can start sharing; the row is consumable as soon as v2 ships.
    // If you need a server-side "has therapy active" check, gate here.

    const expiresAt = this.resolveExpiry(dto.expiresAt);
    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("EXPIRY_IN_PAST");
    }

    const row = await this.prisma.sharedDiaryEntry.create({
      data: {
        entryId,
        therapistId: dto.therapistId,
        userId,
        ciphertextForTherapist: dto.ciphertextForTherapist,
        wrappedKey: dto.wrappedKey,
        userOneShotPubKey: dto.userOneShotPubKey,
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    });

    return { ok: true, shareId: row.id, shareUntil: row.expiresAt };
  }

  // ─── Raw ciphers (used by password-change-with-rekey) ─────────────────────

  /**
   * Return every entry's cipher payload — no mood, no tags, no metadata.
   *
   * Used exclusively by the password-change-with-rekey flow: the client
   * derives the new master key, fetches all ciphers in one round-trip,
   * decrypts each one with the OLD diaryKey, re-encrypts with the NEW
   * diaryKey, and then POSTs the rekeyed bundle to `/user/password-change-
   * with-rekey`.
   *
   * Per ADR 0007 §G this endpoint MUST NOT log ciphertext (the
   * `diario.privacy.spec.ts` walker enforces it). It also does not call
   * the related-entry vector search the detail endpoint runs, because the
   * caller doesn't need any of that.
   */
  async listRawCiphers(userId: string): Promise<DiaryRawCiphersResponse> {
    const rows = await this.prisma.diaryEntry.findMany({
      where: { userId },
      select: {
        id: true,
        textCiphertext: true,
        textNonce: true,
        excerptCiphertext: true,
        excerptNonce: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      entries: rows.map((row) => ({
        id: row.id,
        textCiphertext: row.textCiphertext,
        textNonce: row.textNonce,
        excerptCiphertext: row.excerptCiphertext,
        excerptNonce: row.excerptNonce,
      })),
    };
  }

  // ─── Stats hook used by HomeService/UsersService ──────────────────────────

  async countEntriesSince(userId: string, since: Date): Promise<number> {
    return this.prisma.diaryEntry.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  async countTotalEntries(userId: string): Promise<number> {
    return this.prisma.diaryEntry.count({ where: { userId } });
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private buildListWhere(userId: string, query: ListDiaryEntriesQueryDto) {
    const where: Record<string, unknown> = { userId };
    if (query.mood) where.mood = query.mood;
    if (query.tag) where.tags = { has: query.tag };
    if (query.from || query.to) {
      const range: Record<string, Date> = {};
      if (query.from) range.gte = new Date(query.from);
      if (query.to) {
        // Inclusive: bump to end of day.
        const end = new Date(query.to);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
      where.createdAt = range;
    }
    return where;
  }

  private async computeMoodMap(
    userId: string,
    query: ListDiaryEntriesQueryDto,
  ): Promise<DiaryMoodMap> {
    // Always compute over the visible window (last 60 days when no `from`).
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.now() - 60 * DAY_MS);
    const to = query.to
      ? (() => {
          const t = new Date(query.to);
          t.setHours(23, 59, 59, 999);
          return t;
        })()
      : new Date();

    const rows = await this.prisma.diaryEntry.findMany({
      where: { userId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "desc" },
      select: { mood: true, createdAt: true },
    });

    // Most recent mood per day wins (the orderBy desc + first-write semantics
    // of the Map fold give us that for free). PR-2A · a null-mood entry (no
    // pick) contributes no mood — it is skipped, not defaulted.
    const byDay: Record<string, string> = {};
    for (const row of rows) {
      if (row.mood == null) continue;
      const key = this.isoDate(row.createdAt);
      if (!(key in byDay)) byDay[key] = row.mood;
    }
    return { byDay };
  }

  private async computeTagCounts(userId: string): Promise<DiaryTagCount[]> {
    // Postgres array aggregation via unnest is not exposed by Prisma; we
    // pull the tag arrays and bucket in memory. For the typical user this
    // is <1000 entries which fits easily.
    const rows = await this.prisma.diaryEntry.findMany({
      where: { userId },
      select: { tags: true },
    });
    const counter = new Map<string, number>();
    for (const row of rows) {
      for (const tag of row.tags) {
        counter.set(tag, (counter.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counter.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  private async assertPromptExists(promptId: string): Promise<void> {
    const exists = await this.prisma.diaryPrompt.findUnique({
      where: { id: promptId },
      select: { id: true },
    });
    if (!exists) {
      throw new BadRequestException(`PROMPT_NOT_FOUND: ${promptId}`);
    }
  }

  private assertExcerptPairing(
    cipher: string | undefined,
    nonce: string | undefined,
  ): void {
    if ((cipher && !nonce) || (!cipher && nonce)) {
      throw new BadRequestException(
        "EXCERPT_PAIRING: excerptCiphertext and excerptNonce must be sent together",
      );
    }
  }

  private resolveExpiry(input?: string): Date {
    const now = Date.now();
    if (!input) return new Date(now + DEFAULT_SHARE_DAYS * DAY_MS);
    const requested = new Date(input);
    const max = new Date(now + MAX_SHARE_DAYS * DAY_MS);
    if (requested.getTime() > max.getTime()) {
      throw new ForbiddenException(
        `SHARE_EXPIRY_TOO_LONG: max ${MAX_SHARE_DAYS} days`,
      );
    }
    return requested;
  }

  private toSummary(row: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    // PR-2A · the DB column is nullable (schema-forward), but the PR-2A API
    // cannot create a null-mood entry (the DTO requires `mood`). So a null here
    // means a data-integrity violation — a row written outside the PR-2A API
    // path before the null-capable PR-2B lands. We FAIL EXPLICITLY rather than
    // fabricate a neutral "ok"; the response contract stays `mood: string`.
    mood: string | null;
    kind: string;
    promptId: string | null;
    prompt: { id: string; text: string } | null;
    tags: string[];
    excerptCiphertext: string | null;
    excerptNonce: string | null;
    audioUrl: string | null;
    audioDurationSec: number | null;
  }): DiaryEntrySummary {
    if (row.mood == null) {
      // Never coalesce to a mood the user didn't pick. PR-2B turns the whole
      // stack null-capable atomically; until then a null row is a bug to surface.
      throw new InternalServerErrorException(
        `DIARY_MOOD_INTEGRITY: entry '${row.id}' has a null mood, which the PR-2A API cannot create`,
      );
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      mood: row.mood,
      kind: this.toKind(row.kind),
      promptId: row.promptId,
      promptText: row.prompt?.text ?? null,
      tags: row.tags,
      excerptCiphertext: row.excerptCiphertext,
      excerptNonce: row.excerptNonce,
      audioUrl: row.audioUrl,
      audioDurationSec: row.audioDurationSec,
    };
  }

  private toDetail(row: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    mood: string | null;
    kind: string;
    promptId: string | null;
    prompt: { id: string; text: string } | null;
    tags: string[];
    textCiphertext: string;
    textNonce: string;
    excerptCiphertext: string | null;
    excerptNonce: string | null;
    audioUrl: string | null;
    audioDurationSec: number | null;
  }): DiaryEntryDetail {
    return {
      ...this.toSummary(row),
      textCiphertext: row.textCiphertext,
      textNonce: row.textNonce,
    };
  }

  private toKind(value: string): DiaryEntryKind {
    return value === "prompted" || value === "voz" ? value : "free";
  }

  private dayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date.getTime() - start.getTime()) / DAY_MS);
  }

  private isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
