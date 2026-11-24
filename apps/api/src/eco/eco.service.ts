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
import { Observable, ReplaySubject, Subject } from "rxjs";
import type { Env } from "../config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmbeddingService } from "../ai/embedding/embedding.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { VectorStoreService } from "../ai/vector-store/vector-store.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { captureException } from "../observability/sentry";
import {
  ecoExhaustedMessage,
  ecoQuotaWindow,
  ecoRemaining,
  type EcoQuotaWindow,
} from "./eco-quota";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UsageService } from "../subscription/usage.service";
import {
  EcoStageError,
  describeEcoFailure,
  runStage,
  toSafeFailure,
  type EcoFailureCategory,
} from "./eco-failure";
import {
  CRISIS_LLM_SENTINEL,
  crisisNotice,
  isCrisisText,
  type CrisisNotice,
} from "./crisis";
import { ECO_PERSONA, buildSystemPrompt } from "./persona";

// La cuota de FREE —10 mensajes por día UTC— vivía aquí como constante local,
// y el comentario decía que era «consistente con /usage». No lo era: /usage
// publicaba otro número y otra ventana. Hoy la política entera vive en
// `eco-quota.ts` y las dos superficies la leen de ahí; ver `FREE_ECO_DAILY_LIMIT`.

/** How many turns (user+assistant pairs) we send to the LLM as context. */
const MAX_HISTORY_TURNS = 8;

/** Max messages returned per `getThread` page. */
const THREAD_PAGE_SIZE = 50;

/** How long the crisis notice waits for the profile's country. */
const CRISIS_COUNTRY_WAIT_MS = 1_000;

/**
 * How long the stream stays open, after the notice, for what is written next.
 * The installed clients paint the notice when the stream CLOSES, so waiting
 * without a limit for the database would hold it back just the same.
 */
const CRISIS_RECORD_WAIT_MS = 3_000;

/** What is read of a person to answer them: plan, zone and country. */
interface EcoUser {
  plan: Plan;
  profile: { timezone: string | null; country: string | null } | null;
}

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
   *   1. Run layer-1 crisis detection on the plaintext, before anything that
   *      can refuse or fail.
   *      → if positive: emit the `crisis` event, and only then, as best effort,
   *        persist the USER message and the CRISIS one (assistantText = the
   *        canned notice) and emit `done`. See `runCrisis`.
   *   2. Validate quota.
   *   3. Validate thread ownership.
   *   4. Insert the USER message (ciphertext only — plaintext stays in RAM).
   *   5. Kick off Anthropic stream with RAG-augmented system prompt.
   *      → on the first content delta, check for `[CRISIS]` sentinel.
   *      → if sentinel: emit the notice, then persist it.
   *      → otherwise: relay tokens as `delta` events until completion.
   *   6. Persist ASSISTANT message (LLM-generated plaintext).
   *   7. Bust the /usage cache + emit `done` with remaining quota.
   */
  sendMessage(
    userId: string,
    body: EcoSendMessageRequest,
  ): Observable<{ data: EcoSseEvent }> {
    // A replay: the runner starts now and Nest subscribes some ticks later.
    // The crisis notice may have next to nothing to wait for, and whether it
    // arrives must not depend on which of the two takes more ticks.
    const subject = new ReplaySubject<{ data: EcoSseEvent }>();
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
    // La correlación que se registra tiene que haberla acreditado el servidor.
    //
    // `body.threadId` lo elige quien llama: que tenga forma de identificador
    // no demuestra que exista ni que sea suyo. Validar la FORMA no basta —una
    // cadena alfanumérica cualquiera pasaba el filtro y aterrizaba en el
    // registro y en Sentry—. Este contenedor sólo se rellena después de que
    // la consulta de pertenencia haya devuelto un hilo de ESTA persona; si el
    // fallo ocurre antes, no hay correlación y no se escribe ninguna.
    const acreditado: { threadId?: string } = {};
    try {
      await this.runSendMessageInner(userId, body, subject, acreditado);
    } catch (err) {
      // Any uncaught error becomes a single `error` SSE event so the client
      // can show a retry banner. We DO NOT leak the user's plaintext here.
      //
      // La línea decía sólo el mensaje del error. Con dos dependencias
      // externas en el mismo camino —embeddings y modelo—, `Status code: 401`
      // no dice a cuál escribirle. Ahora se nombra la etapa, la dependencia y
      // una categoría cerrada; el mensaje original sigue delante porque es lo
      // que da la pista concreta, y el `stack` del SDK viaja en `cause`.
      // Lo que sale de aquí es una representación SEGURA, no el error.
      //
      // Antes se concatenaba `err.message`, se entregaba `err.stack` al logger
      // y se pasaba `err` entero a Sentry. Las tres cosas transportan texto
      // crudo del proveedor: un mensaje puede traer el cuerpo que se le envió,
      // el stack empieza por ese mismo mensaje, y el objeto arrastra `cause`,
      // `original` y cualquier `response.body` que el SDK haya colgado. En un
      // camino donde el texto de la persona viaja in-flight hacia el modelo,
      // eso es una fuga esperando una excepción con el contenido dentro.
      //
      // `toSafeFailure` deja sólo constantes del código, un número de estado,
      // marcos de pila sin su primera línea y una correlación validada.
      const categoria = this.logFailure(err, acreditado);
      subject.next({
        data: {
          event: "error",
          data: {
            code:
              err instanceof HttpException
                ? this.extractCode(err)
                : "ECO_UNKNOWN",
            // Una negativa deliberada lleva SU PROPIO mensaje, y ese mensaje es
            // nuestro: lo escribió este servicio unas líneas más arriba. El
            // genérico existe para no repetirle a nadie lo que diga un proveedor
            // cuando algo se cae de verdad, y para eso se queda — pero aplicado
            // a una cuota agotada miente dos veces: nada salió mal, y reintentar
            // «en unos segundos» no funciona hasta medianoche UTC.
            //
            // Medido contra el servicio desplegado el 2026-11-16: con la cuota
            // FREE agotada, el código llegaba bien (`ECO_QUOTA_EXCEEDED`) y la
            // burbuja del chat enseñaba el genérico, porque la pantalla pinta
            // `ev.data.message` tal cual.
            message: this.messageForClient(err, categoria),
          },
        },
      });
    } finally {
      subject.complete();
    }
  }

  /** Deja constancia del fallo, sin nada de la persona ni del proveedor. */
  private logFailure(
    err: unknown,
    acreditado: { threadId?: string },
  ): EcoFailureCategory {
    const seguro = toSafeFailure(err, { threadId: acreditado.threadId });
    const atribucion = {
      stage: seguro.stage,
      dependency: seguro.dependency,
      category: seguro.category,
      upstreamStatus: seguro.upstreamStatus,
    };
    const linea = `Eco sendMessage failed · ${describeEcoFailure(atribucion, {
      threadId: seguro.threadId ?? undefined,
    })}`;

    if (atribucion.category === "deliberate_refusal") {
      // Una cuota agotada o un hilo ajeno no son una caída: el servicio dijo
      // que no a propósito. Se registran como aviso y sin traza, igual que
      // `HttpExceptionFilter` hace con cualquier 4xx — y no se envían a
      // Sentry, que es para lo que hay que ir a mirar.
      this.logger.warn(linea);
    } else {
      // Ni el stack crudo como segundo argumento: los marcos ya van en la
      // línea, sin la primera —que es el mensaje del proveedor—.
      this.logger.error(
        seguro.frames.length > 0
          ? `${linea} frames=${seguro.frames.join(" | ")}`
          : linea,
      );
      // Este camino nunca pasaba por el filtro HTTP —el error viaja DENTRO
      // del stream SSE—, así que ningún fallo de Eco llegaba a Sentry. Va un
      // error SINTÉTICO con la etiqueta segura, nunca el original.
      captureException(new Error(`eco.sendMessage ${linea}`), { ...seguro });
    }
    return atribucion.category;
  }

  private extractCode(err: HttpException): string {
    const res = err.getResponse();
    if (typeof res === "object" && res !== null && "code" in res) {
      return String((res as { code: unknown }).code);
    }
    return err.message;
  }

  /** El genérico de siempre, salvo cuando dijimos que no a propósito. */
  private messageForClient(err: unknown, category: EcoFailureCategory): string {
    const GENERICO = "Algo salió mal. Reintenta en unos segundos.";
    if (category !== "deliberate_refusal" || !(err instanceof HttpException)) {
      return GENERICO;
    }
    // Y sólo desde NUESTRO sobre: `{ code, message }`. Un `HttpException` con
    // mensaje suelto puede traer el texto por defecto de Nest o, algún día,
    // algo que no escribimos aquí. Sin las dos claves, el genérico.
    const res = err.getResponse();
    if (typeof res !== "object" || res === null) return GENERICO;
    const sobre = res as { code?: unknown; message?: unknown };
    if (typeof sobre.code !== "string" || typeof sobre.message !== "string") {
      return GENERICO;
    }
    return sobre.message.length > 0 ? sobre.message : GENERICO;
  }

  private async runSendMessageInner(
    userId: string,
    body: EcoSendMessageRequest,
    subject: Subject<{ data: EcoSseEvent }>,
    acreditado: { threadId?: string } = {},
  ): Promise<void> {
    // ── 1. Layer-1 crisis detection ──────────────────────────────────────
    // First, before the quota: whoever asks for help gets the notice, not «you
    // have no messages left».
    if (isCrisisText(body.textPlaintext)) {
      await this.runCrisis(userId, body, subject, acreditado);
      return;
    }

    // ── 2. Quota gate ────────────────────────────────────────────────────
    const cuota = await this.resolveEcoQuota(userId);
    const remainingBefore = cuota.remaining;
    if (remainingBefore !== null && remainingBefore <= 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          code: "ECO_QUOTA_EXCEEDED",
          // Compuesto de la ventana real y de la zona de la persona. El
          // mensaje anterior era uno solo para todos: prometía «vuelve mañana»
          // a quien reinicia hoy a las 19:00, y le recomendaba «hazte Pro» a
          // una cuenta PRO — y a cualquiera, una contratación que el piloto no
          // ofrece. Ver `eco-quota.ts`.
          message: ecoExhaustedMessage({
            window: cuota.window,
            timezone: cuota.timezone,
            now: new Date(),
          }),
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // ── 3. Thread ownership ──────────────────────────────────────────────
    const thread = await this.requireOwnThread(userId, body.threadId);
    // Desde aquí el identificador está acreditado: la consulta de arriba
    // comprobó que existe Y que es de esta persona. Antes de este punto no
    // hay correlación que registrar.
    acreditado.threadId = thread.id;

    // ── 4. Persist the user message (ciphertext only) ────────────────────
    await this.saveUserMessage(thread.id, body);

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

    // Las dos dependencias externas del envío viven una detrás de la otra, y
    // hasta ahora un fallo de cualquiera producía la misma línea de registro.
    // `runStage` sólo les pone etiqueta: no reintenta, no envuelve la
    // respuesta y no cambia el camino feliz.
    const queryEmbedding = await runStage("embeddings", "voyage", () =>
      this.embeddingService.embed(body.textPlaintext),
    );
    const chunks = await runStage("retrieval", "database", () =>
      this.vectorStore.searchSimilar(
        queryEmbedding,
        this.maxContextChunks,
        scopeBookId, // undefined = platform-wide (unchanged pre-Fase-H behavior)
      ),
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
      // Si no, es el modelo el que se cayó: se etiqueta aquí porque es el
      // punto donde el fallo del proveedor se vuelve observable, y sin
      // etiqueta se confundía con el de embeddings dos llamadas antes.
      if (!crisisDetected) throw new EcoStageError("model", "anthropic", err);
    }

    // ── 6. Persist + finalise ────────────────────────────────────────────
    if (crisisDetected) {
      const notice = this.emitCrisis(subject, cuota.country);
      await this.afterNotice(this.saveNotice(thread.id, notice), acreditado);
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
        remainingBefore === null ? null : Math.max(0, remainingBefore - 1),
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

  // ─── Crisis (private) ──────────────────────────────────────────────────────

  /**
   * The person's own text asks for help, so the notice goes out first: nothing
   * that can refuse, fail or hang stands in front of it.
   *
   * It waits for one thing, the profile's country, and only for
   * `CRISIS_COUNTRY_WAIT_MS`: with the right country it is a better notice. A
   * read that fails or is late counts as «nobody has declared one», which the
   * notice already knows how to say.
   */
  private async runCrisis(
    userId: string,
    body: EcoSendMessageRequest,
    subject: Subject<{ data: EcoSseEvent }>,
    acreditado: { threadId?: string },
  ): Promise<void> {
    const user = this.readUser(userId);
    const country = await within(user, CRISIS_COUNTRY_WAIT_MS).then(
      (row) => row?.profile?.country ?? null,
      () => null,
    );
    const notice = this.emitCrisis(subject, country);
    await this.afterNotice(
      this.recordCrisis(userId, user, body, notice, subject, acreditado),
      acreditado,
    );
  }

  /** Sends the notice. It reads and writes nothing. */
  private emitCrisis(
    subject: Subject<{ data: EcoSseEvent }>,
    country: string | null,
  ): CrisisNotice {
    const notice = crisisNotice(country);
    subject.next({ data: { event: "crisis", data: notice } });
    return notice;
  }

  /**
   * What happens after the notice: best effort, with a deadline, and its
   * failure is logged and goes no further. An `error` event here would tell
   * somebody who has just been helped that something went wrong.
   */
  private async afterNotice(
    work: Promise<void>,
    acreditado: { threadId?: string },
  ): Promise<void> {
    try {
      await within(work, CRISIS_RECORD_WAIT_MS);
    } catch (err) {
      this.logFailure(err, acreditado);
    }
  }

  /**
   * Keeps the exchange in the thread and emits `done`.
   *
   * The message is written even with no quota left: it was sent, and without
   * it the notice would be re-read with nothing before it. It counts like any
   * other, so `used` can pass the limit; `ecoRemaining` stays at zero.
   *
   * A thread that is not theirs gets nothing written and no `done`, exactly
   * like one that does not exist. `done` also needs a saved message to name
   * and a quota that could be read; without them the stream just closes.
   */
  private async recordCrisis(
    userId: string,
    user: Promise<EcoUser | null>,
    body: EcoSendMessageRequest,
    notice: CrisisNotice,
    subject: Subject<{ data: EcoSseEvent }>,
    acreditado: { threadId?: string },
  ): Promise<void> {
    const thread = await this.requireOwnThread(userId, body.threadId);
    acreditado.threadId = thread.id;
    const userMessage = await this.saveUserMessage(thread.id, body);
    await this.saveNotice(thread.id, notice);
    // Counted after the write, so the live count already includes it.
    const { remaining } = await this.resolveEcoQuota(userId, user);
    await this.bumpQuotaAndEmitDone(userId, userMessage.id, subject, remaining);
  }

  /**
   * Persist the crisis-derivation message so the thread is re-readable with
   * the same content the user saw at the time.
   */
  private async saveNotice(
    threadId: string,
    notice: CrisisNotice,
  ): Promise<void> {
    await this.prisma.ecoMessage.create({
      data: {
        threadId,
        kind: "CRISIS",
        assistantText: notice.text,
      },
    });
  }

  // ─── Shared steps (private) ────────────────────────────────────────────────

  /** The same 404 for a thread that is not theirs and for one that is not. */
  private async requireOwnThread(
    userId: string,
    threadId: string,
  ): Promise<{ id: string }> {
    const thread = await this.prisma.ecoThread.findFirst({
      where: { id: threadId, userId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException("ECO_THREAD_NOT_FOUND");
    return thread;
  }

  /** Ciphertext only: the plaintext never reaches the database. */
  private async saveUserMessage(
    threadId: string,
    body: EcoSendMessageRequest,
  ): Promise<{ id: string }> {
    return this.prisma.ecoMessage.create({
      data: {
        threadId,
        kind: "USER",
        textCiphertext: body.textCiphertext,
        textNonce: body.textNonce,
      },
      select: { id: true },
    });
  }

  private async bumpQuotaAndEmitDone(
    userId: string,
    messageId: string,
    subject: Subject<{ data: EcoSseEvent }>,
    quotaRemaining: number | null,
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

    subject.next({
      data: {
        event: "done",
        data: {
          messageId,
          quotaRemaining,
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

  /**
   * La cuota, resuelta por la MISMA función que informa a Mi Plan.
   *
   * Devuelve la ventana entera, no sólo el resto, porque el mensaje de
   * agotamiento necesita saber cuánto cabía y cuándo vuelve — y la zona de la
   * persona, para decir la hora en su reloj y no en UTC.
   *
   * El país del perfil viaja en la misma consulta: así el aviso de crisis no
   * depende de una lectura más que pueda fallar justo ahí. Quien ya la tenga
   * en vuelo —el aviso de la capa 1, que la necesita antes— la pasa.
   */
  private async resolveEcoQuota(
    userId: string,
    reading: Promise<EcoUser | null> = this.readUser(userId),
  ): Promise<{
    window: EcoQuotaWindow;
    used: number;
    remaining: number | null;
    timezone: string | null;
    country: string | null;
  }> {
    const [user, sub] = await Promise.all([
      reading,
      this.prisma.subscription.findUnique({
        where: { userId },
        select: {
          currentPeriodStart: true,
          currentPeriodEnd: true,
          status: true,
        },
      }),
    ]);
    const plan: Plan = user?.plan ?? "FREE";
    const window = ecoQuotaWindow(plan, sub, new Date());
    // Sin límite no hay nada que contar, y contar sería una consulta por
    // mensaje que a B2B no le cambia la respuesta.
    const used =
      window.limit === null
        ? 0
        : await this.countUserMessagesInPeriod(
            userId,
            window.start,
            window.end,
          );
    return {
      window,
      used,
      remaining: ecoRemaining(window, used),
      timezone: user?.profile?.timezone ?? null,
      country: user?.profile?.country ?? null,
    };
  }

  /** Plan, zona y país, en una sola consulta. */
  private async readUser(userId: string): Promise<EcoUser | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        profile: { select: { timezone: true, country: true } },
      },
    });
  }

  private async computeQuotaRemaining(userId: string): Promise<number | null> {
    return (await this.resolveEcoQuota(userId)).remaining;
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

/**
 * Waits for `work` up to `ms`, then gives up on waiting. It does not cancel
 * it: whatever it still does, it does on its own, and its late failure is
 * handled by the race rather than left loose.
 */
async function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("ECO_DEADLINE")), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
