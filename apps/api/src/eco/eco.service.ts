import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Plan, EcoMessageKind as DbKind } from "@prisma/client";
import type {
  EcoMessageReportReason,
  EcoPersona,
  EcoSendMessageRequest,
  EcoSource,
  EcoSseEvent,
  EcoThreadCreatedResponse,
  EcoThreadListResponse,
  EcoThreadResponse,
} from "@psico/types";
import { chapterConcept } from "@psico/types";
import { Observable, Subject } from "rxjs";
import type { Env } from "../config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmbeddingService } from "../ai/embedding/embedding.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { VectorStoreService } from "../ai/vector-store/vector-store.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { PLAN_QUOTAS } from "../subscription/quotas";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UsageService } from "../subscription/usage.service";
import {
  CRISIS_HOTLINE,
  CRISIS_LLM_SENTINEL,
  CRISIS_MESSAGE,
  CRISIS_PATH,
  isCrisisText,
} from "./crisis";
import { ECO_PERSONA, buildSystemPrompt } from "./persona";

/**
 * FREE-tier quota: 10 user messages per UTC day. Hardcoded here rather than
 * in `PLAN_QUOTAS` because the period semantics differ — FREE resets daily,
 * PRO/ANNUAL/B2B follow the billing period (consistent with /usage).
 */
const FREE_DAILY_LIMIT = 10;

/** How many turns (user+assistant pairs) we send to the LLM as context. */
const MAX_HISTORY_TURNS = 8;

/** Max messages returned per `getThread` page. */
const THREAD_PAGE_SIZE = 50;

@Injectable()
export class EcoService {
  private readonly logger = new Logger(EcoService.name);
  private readonly anthropic: Anthropic;
  private readonly maxContextChunks: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageService: UsageService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    config: ConfigService<Env, true>,
  ) {
    this.anthropic = new Anthropic({
      apiKey: config.get("ANTHROPIC_API_KEY", { infer: true }),
    });
    this.maxContextChunks = config.get("AI_MAX_CONTEXT_CHUNKS", {
      infer: true,
    });
  }

  // ─── Persona ───────────────────────────────────────────────────────────────

  getCaps(): EcoPersona {
    return {
      name: ECO_PERSONA.name,
      voice: ECO_PERSONA.voice,
      caps: [...ECO_PERSONA.caps],
    };
  }

  // ─── Threads ───────────────────────────────────────────────────────────────

  async listThreads(userId: string): Promise<EcoThreadListResponse> {
    const rows = await this.prisma.ecoThread.findMany({
      where: { userId },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        titleCiphertext: true,
        titleNonce: true,
        lastMessageAt: true,
        _count: { select: { messages: true } },
      },
      take: 50,
    });
    return {
      rail: rows.map((r) => ({
        id: r.id,
        titleCiphertext: r.titleCiphertext,
        titleNonce: r.titleNonce,
        lastMessageAt: r.lastMessageAt,
        messageCount: r._count.messages,
      })),
    };
  }

  async createThread(userId: string): Promise<EcoThreadCreatedResponse> {
    const row = await this.prisma.ecoThread.create({
      data: { userId },
      select: { id: true, createdAt: true },
    });
    return { id: row.id, createdAt: row.createdAt };
  }

  async getThread(
    userId: string,
    threadId: string,
    cursor: string | undefined,
  ): Promise<EcoThreadResponse> {
    const thread = await this.prisma.ecoThread.findFirst({
      where: { id: threadId, userId },
      select: {
        id: true,
        titleCiphertext: true,
        titleNonce: true,
        createdAt: true,
        lastMessageAt: true,
      },
    });
    if (!thread) throw new NotFoundException("ECO_THREAD_NOT_FOUND");

    const messages = await this.prisma.ecoMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: THREAD_PAGE_SIZE + 1, // +1 to detect hasMore
    });

    const hasMore = messages.length > THREAD_PAGE_SIZE;
    const page = hasMore ? messages.slice(0, THREAD_PAGE_SIZE) : messages;

    return {
      thread,
      messages: page.map((m) => ({
        id: m.id,
        kind: this.kindToWire(m.kind),
        textCiphertext: m.textCiphertext,
        textNonce: m.textNonce,
        assistantText: m.assistantText,
        suggestedBookId: m.suggestedBookId,
        createdAt: m.createdAt,
      })),
      hasMore,
    };
  }

  async deleteThread(userId: string, threadId: string): Promise<void> {
    const existing = await this.prisma.ecoThread.findFirst({
      where: { id: threadId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("ECO_THREAD_NOT_FOUND");
    await this.prisma.ecoThread.delete({ where: { id: threadId } });
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  /**
   * Streams an Eco reply via Server-Sent Events. The Observable emits
   * `MessageEvent`-shaped objects that NestJS's @Sse() decorator serialises
   * onto the response.
   *
   * The flow is:
   *   1. Validate quota.
   *   2. Validate thread ownership.
   *   3. Insert the USER message (ciphertext only — plaintext stays in RAM).
   *   4. Run layer-1 crisis detection on the plaintext.
   *      → if positive: emit `crisis` event, persist a CRISIS message
   *        (assistantText = hard-coded copy), bump quota, done.
   *   5. Otherwise: kick off Anthropic stream with RAG-augmented system prompt.
   *      → on the first content delta, check for `[CRISIS]` sentinel.
   *      → if sentinel: same path as #4.
   *      → otherwise: relay tokens as `delta` events until completion.
   *   6. Persist ASSISTANT message (LLM-generated plaintext).
   *   7. Bust the /usage cache + emit `done` with remaining quota.
   */
  sendMessage(
    userId: string,
    body: EcoSendMessageRequest,
  ): Observable<{ data: EcoSseEvent }> {
    const subject = new Subject<{ data: EcoSseEvent }>();
    // Fire-and-forget. The runner is responsible for emitting at least one
    // event AND completing the subject — never just one or the other.
    void this.runSendMessage(userId, body, subject);
    return subject.asObservable();
  }

  /** Optional reconciliation call from the design doc. v1 just returns the quota. */
  async reportUsage(
    userId: string,
  ): Promise<{ quotaRemaining: number | null }> {
    return { quotaRemaining: await this.computeQuotaRemaining(userId) };
  }

  async reportMessage(
    userId: string,
    messageId: string,
    reason: EcoMessageReportReason,
    comment: string | undefined,
  ): Promise<{ ok: true }> {
    const message = await this.prisma.ecoMessage.findFirst({
      where: { id: messageId, thread: { userId } },
      select: { id: true },
    });
    if (!message) throw new NotFoundException("ECO_MESSAGE_NOT_FOUND");

    await this.prisma.ecoMessageReport.create({
      data: { messageId, userId, reason, comment },
    });
    return { ok: true };
  }

  /** Used by UsageService (S7) — Eco messages count = USER-kind in period. */
  async countUserMessagesInPeriod(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    return this.prisma.ecoMessage.count({
      where: {
        kind: "USER",
        createdAt: { gte: start, lt: end },
        thread: { userId },
      },
    });
  }

  // ─── Streaming pipeline (private) ──────────────────────────────────────────

  private async runSendMessage(
    userId: string,
    body: EcoSendMessageRequest,
    subject: Subject<{ data: EcoSseEvent }>,
  ): Promise<void> {
    try {
      await this.runSendMessageInner(userId, body, subject);
    } catch (err) {
      // Any uncaught error becomes a single `error` SSE event so the client
      // can show a retry banner. We DO NOT leak the user's plaintext here.
      this.logger.error(`Eco sendMessage failed: ${(err as Error).message}`);
      subject.next({
        data: {
          event: "error",
          data: {
            code:
              err instanceof HttpException
                ? this.extractCode(err)
                : "ECO_UNKNOWN",
            message: "Algo salió mal. Reintenta en unos segundos.",
          },
        },
      });
    } finally {
      subject.complete();
    }
  }

  private extractCode(err: HttpException): string {
    const res = err.getResponse();
    if (typeof res === "object" && res !== null && "code" in res) {
      return String((res as { code: unknown }).code);
    }
    return err.message;
  }

  private async runSendMessageInner(
    userId: string,
    body: EcoSendMessageRequest,
    subject: Subject<{ data: EcoSseEvent }>,
  ): Promise<void> {
    // ── 1. Quota gate ────────────────────────────────────────────────────
    const remainingBefore = await this.computeQuotaRemaining(userId);
    if (remainingBefore !== null && remainingBefore <= 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          code: "ECO_QUOTA_EXCEEDED",
          message:
            "Has usado tus mensajes de Eco para hoy. Vuelve mañana o hazte Pro.",
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // ── 2. Thread ownership ──────────────────────────────────────────────
    const thread = await this.prisma.ecoThread.findFirst({
      where: { id: body.threadId, userId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException("ECO_THREAD_NOT_FOUND");

    // ── 3. Persist the user message (ciphertext only) ────────────────────
    const userMessage = await this.prisma.ecoMessage.create({
      data: {
        threadId: thread.id,
        kind: "USER",
        textCiphertext: body.textCiphertext,
        textNonce: body.textNonce,
      },
      select: { id: true },
    });

    // ── 4. Layer-1 crisis detection ──────────────────────────────────────
    if (isCrisisText(body.textPlaintext)) {
      await this.emitCrisis(thread.id, subject);
      await this.bumpQuotaAndEmitDone(
        userId,
        userMessage.id,
        subject,
        remainingBefore,
      );
      return;
    }

    // ── 5. RAG lookup + Anthropic stream ─────────────────────────────────
    // Fase H — reading scope: when the message comes from the reader dock,
    // scope RAG to that book, anchor the prompt in the chapter theme, and
    // prepare the resonance offer (Eco PROPOSES; the user confirms).
    let scopeBookId: string | undefined;
    let chapterTheme: string | undefined;
    let resonanceOffer: {
      conceptKey: string;
      conceptLabel: string;
      bookSlug: string;
      chapterOrder: number;
    } | null = null;
    if (body.scope) {
      const [book, chapter] = await Promise.all([
        this.prisma.book.findUnique({
          where: { slug: body.scope.bookSlug },
          select: { id: true },
        }),
        this.prisma.chapter.findFirst({
          where: {
            book: { slug: body.scope.bookSlug },
            order: body.scope.chapterOrder,
          },
          select: { title: true },
        }),
      ]);
      scopeBookId = book?.id;
      const concept = chapterConcept(
        body.scope.bookSlug,
        body.scope.chapterOrder,
        chapter?.title ?? "",
      );
      chapterTheme = concept.label || undefined;
      resonanceOffer = {
        conceptKey: concept.key,
        conceptLabel: concept.label,
        bookSlug: body.scope.bookSlug,
        chapterOrder: body.scope.chapterOrder,
      };
    }

    const queryEmbedding = await this.embeddingService.embed(
      body.textPlaintext,
    );
    const chunks = await this.vectorStore.searchSimilar(
      queryEmbedding,
      this.maxContextChunks,
      scopeBookId, // undefined = platform-wide (unchanged pre-Fase-H behavior)
    );
    const bookContext =
      chunks.length > 0
        ? chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n")
        : undefined;
    const sources = await this.buildSources(chunks);

    const history = await this.loadHistoryForLLM(thread.id);

    const stream = this.anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: buildSystemPrompt({ bookContext, chapterTheme }),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        ...history,
        { role: "user" as const, content: body.textPlaintext },
      ],
    });

    // Collect the full reply and watch for the [CRISIS] sentinel on the
    // first non-whitespace token.
    let buffered = "";
    let sentinelChecked = false;
    let crisisDetected = false;

    stream.on("text", (delta: string) => {
      if (crisisDetected) return;
      buffered += delta;

      if (!sentinelChecked) {
        const trimmed = buffered.trimStart();
        if (trimmed.startsWith(CRISIS_LLM_SENTINEL)) {
          crisisDetected = true;
          // Do NOT relay any delta — we replace the reply with the canned
          // crisis message downstream.
          stream.controller.abort();
          return;
        }
        // Wait until we have enough chars to be sure the sentinel isn't
        // starting late. 32 chars is generous (longer than the sentinel).
        if (trimmed.length >= CRISIS_LLM_SENTINEL.length + 4) {
          sentinelChecked = true;
        }
      }

      subject.next({
        data: { event: "delta", data: { text: delta } },
      });
    });

    // Wait for the stream to settle (either complete or aborted by us).
    let usage: { input_tokens: number; output_tokens: number } | null = null;
    try {
      const final = await stream.finalMessage();
      usage = final.usage;
    } catch (err) {
      // If we aborted because of CRISIS_LLM_SENTINEL, this is expected.
      if (!crisisDetected) throw err;
    }

    // ── 6. Persist + finalise ────────────────────────────────────────────
    if (crisisDetected) {
      await this.emitCrisis(thread.id, subject);
    } else {
      const assistant = await this.prisma.ecoMessage.create({
        data: {
          threadId: thread.id,
          kind: "ASSISTANT",
          assistantText: buffered,
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
        },
        select: { id: true },
      });
      await this.prisma.ecoThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date() },
      });

      await this.bumpQuotaAndEmitDone(
        userId,
        assistant.id,
        subject,
        remainingBefore,
        // Fase H — surface the retrieved book/chapter sources and (for reader
        // conversations) the confirmable resonance offer.
        { sources, resonanceOffer },
      );
    }
  }

  /**
   * Fase H — deterministic source attribution from the actual RAG hits.
   * Dedups by book+chapter and resolves titles. Never LLM-claimed; the UI
   * labels it "contexto consultado".
   */
  private async buildSources(
    chunks: ReadonlyArray<{ bookId: string; chapterId: string | null }>,
  ): Promise<EcoSource[]> {
    if (chunks.length === 0) return [];
    const bookIds = [...new Set(chunks.map((c) => c.bookId))];
    const chapterIds = [
      ...new Set(
        chunks.map((c) => c.chapterId).filter((x): x is string => !!x),
      ),
    ];
    const [books, chapters] = await Promise.all([
      this.prisma.book.findMany({
        where: { id: { in: bookIds } },
        select: { id: true, title: true },
      }),
      chapterIds.length
        ? this.prisma.chapter.findMany({
            where: { id: { in: chapterIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
    ]);
    const bookTitle = new Map(books.map((b) => [b.id, b.title]));
    const chapterTitle = new Map(chapters.map((c) => [c.id, c.title]));

    const seen = new Set<string>();
    const sources: EcoSource[] = [];
    for (const c of chunks) {
      const key = `${c.bookId}:${c.chapterId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const bt = bookTitle.get(c.bookId);
      if (!bt) continue;
      sources.push({
        bookTitle: bt,
        chapterTitle: c.chapterId
          ? (chapterTitle.get(c.chapterId) ?? null)
          : null,
      });
    }
    return sources;
  }

  private async emitCrisis(
    threadId: string,
    subject: Subject<{ data: EcoSseEvent }>,
  ): Promise<void> {
    // Persist the crisis-derivation message so the thread is re-readable
    // with the same content the user saw at the time.
    await this.prisma.ecoMessage.create({
      data: {
        threadId,
        kind: "CRISIS",
        assistantText: CRISIS_MESSAGE,
      },
    });
    subject.next({
      data: {
        event: "crisis",
        data: {
          text: CRISIS_MESSAGE,
          hotline: CRISIS_HOTLINE,
          crisisPath: CRISIS_PATH,
        },
      },
    });
  }

  private async bumpQuotaAndEmitDone(
    userId: string,
    messageId: string,
    subject: Subject<{ data: EcoSseEvent }>,
    remainingBefore: number | null,
    // Fase H — normal (non-crisis) replies carry the retrieved sources and
    // the optional reader resonance offer. Crisis paths omit both.
    extras?: {
      sources?: EcoSource[];
      resonanceOffer?: {
        conceptKey: string;
        conceptLabel: string;
        bookSlug: string;
        chapterOrder: number;
      } | null;
    },
  ): Promise<void> {
    // Invalidate the /usage cache so the next dashboard load shows fresh
    // counts. We don't INCR a Redis counter because /usage SUMs live.
    await this.usageService.invalidate(userId);

    const remainingAfter =
      remainingBefore === null ? null : Math.max(0, remainingBefore - 1);

    subject.next({
      data: {
        event: "done",
        data: {
          messageId,
          quotaRemaining: remainingAfter,
          ...(extras?.sources && extras.sources.length > 0
            ? { sources: extras.sources }
            : {}),
          ...(extras && "resonanceOffer" in extras
            ? { resonanceOffer: extras.resonanceOffer ?? null }
            : {}),
        },
      },
    });
  }

  // ─── Quota math ────────────────────────────────────────────────────────────

  private async computeQuotaRemaining(userId: string): Promise<number | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    const plan: Plan = user?.plan ?? "FREE";

    if (plan === "FREE") {
      const since = this.startOfUtcToday();
      const used = await this.countUserMessagesInPeriod(
        userId,
        since,
        new Date(since.getTime() + 24 * 60 * 60 * 1000),
      );
      return Math.max(0, FREE_DAILY_LIMIT - used);
    }

    const quota = PLAN_QUOTAS[plan].eco;
    if (quota === null) return null; // B2B unlimited

    const period = await this.resolveBillingPeriod(userId);
    const used = await this.countUserMessagesInPeriod(
      userId,
      period.start,
      period.end,
    );
    return Math.max(0, quota - used);
  }

  private async resolveBillingPeriod(
    userId: string,
  ): Promise<{ start: Date; end: Date }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        currentPeriodStart: true,
        currentPeriodEnd: true,
        status: true,
      },
    });
    if (
      sub &&
      (sub.status === "ACTIVE" ||
        sub.status === "TRIALING" ||
        sub.status === "PAST_DUE")
    ) {
      return { start: sub.currentPeriodStart, end: sub.currentPeriodEnd };
    }
    const now = new Date();
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    };
  }

  private startOfUtcToday(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Loads the last N message pairs from the DB and converts them to the
   * Anthropic `MessageParam` shape. USER messages have ciphertext only —
   * we can't decrypt server-side, so they're omitted from the LLM context.
   *
   * This is a v1 limitation: the LLM only sees the CURRENT user turn plus
   * the ASSISTANT history. Multi-turn coherence on the user side is partial.
   * Mitigation: client could include a summary in the prompt (S10.5).
   */
  private async loadHistoryForLLM(
    threadId: string,
  ): Promise<Anthropic.MessageParam[]> {
    const rows = await this.prisma.ecoMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_TURNS * 2,
    });
    return rows
      .reverse()
      .filter((m) => m.kind === "ASSISTANT" && m.assistantText)
      .map((m) => ({
        role: "assistant" as const,
        content: m.assistantText!,
      }));
  }

  private kindToWire(
    kind: DbKind,
  ): "user" | "assistant" | "crisis" | "suggestion" {
    return kind.toLowerCase() as "user" | "assistant" | "crisis" | "suggestion";
  }
}
