import { Injectable, Logger, NotFoundException } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmbeddingService } from "./embedding/embedding.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { VectorStoreService } from "./vector-store/vector-store.service";

export interface ChatResult {
  reply: string;
  conversationId: string;
  inputTokens: number;
  outputTokens: number;
}

// Max conversation turns loaded into context to cap token spend
const MAX_HISTORY_TURNS = 10;

const SYSTEM_PROMPT = `Eres un companion de apoyo psicoeducativo de Psico Platform.
Tu propósito es ayudar a los usuarios a comprender y aplicar los conceptos de los libros de psicoeducación disponibles en la plataforma.

LÍMITES IMPORTANTES:
- No eres un psicólogo ni un profesional de salud mental.
- No puedes diagnosticar, tratar ni recetar.
- Si el usuario expresa una crisis emocional, ideación suicida o situación de riesgo, responde con empatía y dirige inmediatamente a: Línea de Crisis Ecuador 1800-4-SALUD (1800-472583) o a un profesional de salud mental.

COMPORTAMIENTO:
- Responde siempre en español, con tono cálido, empático y claro.
- Basa tus respuestas en el contenido de los libros proporcionado como contexto.
- Si no tienes suficiente contexto para responder, indícalo honestamente.
- Cita el capítulo o concepto del libro cuando sea relevante.
- Mantén las respuestas concisas (máximo 3 párrafos a menos que se pida más).

Al final de cada respuesta incluye siempre: "⚠️ Recuerda: soy un companion de apoyo, no reemplazo a un profesional de salud mental."`;

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly anthropic: Anthropic;
  private readonly maxContextChunks: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    configService: ConfigService<Env, true>,
  ) {
    this.anthropic = new Anthropic({
      apiKey: configService.get("ANTHROPIC_API_KEY", { infer: true }),
    });
    this.maxContextChunks = configService.get("AI_MAX_CONTEXT_CHUNKS", {
      infer: true,
    });
  }

  async chat(
    userId: string,
    message: string,
    conversationId?: string,
  ): Promise<ChatResult> {
    const conversation = await this.resolveConversation(
      userId,
      message,
      conversationId,
    );

    const queryEmbedding = await this.embeddingService.embed(message);
    const chunks = await this.vectorStore.searchSimilar(
      queryEmbedding,
      this.maxContextChunks,
    );

    const contextBlock =
      chunks.length > 0
        ? `\n\nCONTEXTO DE LOS LIBROS:\n${chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n")}`
        : "";

    const history = await this.prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: MAX_HISTORY_TURNS * 2,
    });

    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({
        role: m.role.toLowerCase() as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        content: `${message}${contextBlock}`,
      },
    ];

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Cache the system prompt — it rarely changes and is ~400 tokens
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });

    const reply =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    await this.prisma.conversationMessage.createMany({
      data: [
        {
          conversationId: conversation.id,
          role: "USER",
          content: message,
          inputTokens: 0,
          outputTokens: 0,
        },
        {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: reply,
          inputTokens,
          outputTokens,
        },
      ],
    });

    this.logger.log(
      `Chat [conv:${conversation.id}] tokens in=${inputTokens} out=${outputTokens}`,
    );

    return {
      reply,
      conversationId: conversation.id,
      inputTokens,
      outputTokens,
    };
  }

  async getConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
  }

  async getMessages(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversation) throw new NotFoundException("Conversation not found");

    return this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
  }

  private async resolveConversation(
    userId: string,
    firstMessage: string,
    conversationId?: string,
  ) {
    if (conversationId) {
      const existing = await this.prisma.conversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!existing) throw new NotFoundException("Conversation not found");
      return existing;
    }

    // Auto-title from first 60 chars of the first message
    const title =
      firstMessage.length > 60 ? firstMessage.slice(0, 60) + "…" : firstMessage;

    return this.prisma.conversation.create({ data: { userId, title } });
  }

  // ─── Weekly narrative (Sprint S38) ─────────────────────────────────────
  //
  // Generates the editorial paragraph for `WeeklySummary` (Patrones Pro
  // feature). The input is intentionally aggregate-only — we NEVER pass the
  // diary's ciphertext or any plaintext body to the LLM. The only data the
  // model sees is mood counts, entry count, dominant mood, and top tag
  // tokens. That contract is what makes ADR 0007 compatible with this
  // feature.
  //
  // We use Claude Sonnet 4.6 with a small token budget (~512 output) and a
  // system prompt that pins the LLM to a warm, brief, non-pathologizing
  // voice. The output is parsed into `{ headline, narrative }`; if anything
  // goes wrong (timeout, parse failure, missing key) the caller falls back
  // to the rule-based `composeNarrative`.

  async generateWeeklyNarrative(stats: {
    entryCount: number;
    dominantMood: string;
    moodCounts: Record<string, number>;
    topTags: string[]; // up to ~5 tags, ordered by frequency
    weekStartIso: string; // for context, formatted "YYYY-MM-DD"
  }): Promise<{ headline: string; narrative: string }> {
    const moodLine = Object.entries(stats.moodCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([mood, n]) => `${mood}=${n}`)
      .join(", ");

    const tagsLine = stats.topTags.length
      ? stats.topTags.join(", ")
      : "(ninguna)";

    const userPrompt = [
      `Genera un resumen editorial breve para la semana que comenzó el ${stats.weekStartIso}.`,
      ``,
      `DATOS (agregados, sin contenido del diario):`,
      `- Entradas: ${stats.entryCount}`,
      `- Mood dominante: ${stats.dominantMood}`,
      `- Conteo por mood: ${moodLine}`,
      `- Tags más usados: ${tagsLine}`,
      ``,
      `FORMATO de salida (estricto):`,
      `HEADLINE: <una sola oración, ≤90 caracteres, en segunda persona>`,
      `NARRATIVE: <2 a 3 párrafos, en segunda persona, separados por una línea en blanco, total ≤450 caracteres>`,
      ``,
      `No inventes hechos. No agregues citas. No incluyas el saludo "Hola". No menciones que eres una IA.`,
    ].join("\n");

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: WEEKLY_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const parsed = parseWeeklyOutput(text);
    if (!parsed) {
      // Shape mismatch — let the caller fall back to the rule-based path.
      throw new Error("WEEKLY_NARRATIVE_PARSE_FAILED");
    }

    this.logger.log(
      `WeeklyNarrative tokens in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
    );
    return parsed;
  }
}

// ─── Weekly narrative — module-level helpers ──────────────────────────────

const WEEKLY_SYSTEM_PROMPT = `Eres el editor del resumen semanal del diario de Psico Platform.
Voz: cálida, breve, validante, no diagnóstica. Segunda persona.

REGLAS:
- Habla SOLO de patrones derivados de la metadata (conteos, moods, tags).
- NO interpretes el contenido del diario — no lo tienes, no lo inventes.
- NO uses lenguaje clínico ("trastorno", "síndrome", "depresión").
- Si el mood dominante es difícil (tristeza, miedo, ansiedad), valida sin patologizar.
- Si las entradas son pocas (≤3), reconoce el inicio sin presión.
- Cierra con un "para esta semana, intenta…" concreto y simple.`;

function parseWeeklyOutput(
  raw: string,
): { headline: string; narrative: string } | null {
  // Expected format (strict, generated by our prompt):
  //   HEADLINE: <single line>
  //   NARRATIVE: <one or more paragraphs>
  const lines = raw.split("\n");
  let headline = "";
  const narrativeLines: string[] = [];
  let mode: "none" | "narrative" = "none";
  for (const line of lines) {
    if (line.startsWith("HEADLINE:")) {
      headline = line.slice("HEADLINE:".length).trim();
      mode = "none";
    } else if (line.startsWith("NARRATIVE:")) {
      narrativeLines.push(line.slice("NARRATIVE:".length).trim());
      mode = "narrative";
    } else if (mode === "narrative") {
      narrativeLines.push(line);
    }
  }
  const narrative = narrativeLines.join("\n").trim();
  if (!headline || !narrative) return null;
  return { headline, narrative };
}
