import { Injectable, Logger, NotFoundException } from "@nestjs/common";
<<<<<<< HEAD
import type { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../config";
import type { PrismaService } from "../prisma";
import type { EmbeddingService } from "./embedding/embedding.service";
import type { VectorStoreService } from "./vector-store/vector-store.service";
=======
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
>>>>>>> origin/main

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
}
