import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type { AuthorAiIntent } from "./dto/ai-help.dto";

export interface AiHelpResult {
  intent: AuthorAiIntent;
  suggestion: string;
  /** "model" or "fallback" — frontend can show "(generado por IA)" or "(sugerencia local)" */
  source: "model" | "fallback";
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * AuthorAiService — Sprint S71.C-AI.
 *
 * Wraps Claude (Sonnet 4.6) to give the editor four helpers: revisar tono,
 * sugerir ejemplo, cambiar tono, simplificar. Returns the suggestion as a
 * single JSON response (no SSE in v1 — easier to consume from the editor's
 * inline modal, can upgrade later).
 *
 * Privacy: text del autor NO es E2E (es contenido público que va al
 * catálogo). Mandar al LLM está justificado. No persistimos las
 * sugerencias — son one-shot helpers.
 *
 * Cost containment: cap a 600 tokens output. Cuando la key no está
 * configurada, el servicio devuelve un fallback rule-based en lugar de
 * romper. Igual que generateWeeklyNarrative en S38.
 */
@Injectable()
export class AuthorAiService {
  private readonly logger = new Logger("AuthorAiService");
  private readonly anthropic: Anthropic | null;
  private readonly model = "claude-sonnet-4-6";

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>("ANTHROPIC_API_KEY");
    this.anthropic = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.anthropic) {
      this.logger.warn(
        "ANTHROPIC_API_KEY missing — AI helpers will use rule-based fallback.",
      );
    }
  }

  async generateSuggestion(
    intent: AuthorAiIntent,
    text: string,
    context: string | undefined,
  ): Promise<AiHelpResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException("EMPTY_TEXT");
    }

    if (!this.anthropic) {
      return {
        intent,
        suggestion: this.fallback(intent, trimmed),
        source: "fallback",
      };
    }

    const system = SYSTEM_PROMPTS[intent];
    const userPrompt = this.buildUserPrompt(intent, trimmed, context);

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 600,
        system,
        messages: [{ role: "user", content: userPrompt }],
      });

      const block = response.content.find((c) => c.type === "text");
      const raw =
        block && block.type === "text" ? block.text : "";
      const suggestion = this.cleanOutput(raw);
      if (!suggestion) {
        this.logger.warn(`[author-ai] empty LLM output for intent=${intent}`);
        return {
          intent,
          suggestion: this.fallback(intent, trimmed),
          source: "fallback",
        };
      }

      return {
        intent,
        suggestion,
        source: "model",
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      };
    } catch (e) {
      this.logger.warn(
        `[author-ai] LLM error intent=${intent}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      // Don't fail the editor flow — give the author SOMETHING usable.
      const status =
        e instanceof Error && /5\d{2}/.test(e.message)
          ? "upstream"
          : "fallback";
      if (status === "upstream") {
        throw new ServiceUnavailableException("AI_PROVIDER_UNAVAILABLE");
      }
      return {
        intent,
        suggestion: this.fallback(intent, trimmed),
        source: "fallback",
      };
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private buildUserPrompt(
    intent: AuthorAiIntent,
    text: string,
    context: string | undefined,
  ): string {
    const ctx = context?.trim()
      ? `Contexto del libro (no lo repitas en tu respuesta):\n${context.trim()}\n\n`
      : "";
    return `${ctx}Texto del autor a procesar:\n${text}\n\nResponde SOLO con el texto ajustado. Sin preámbulos, sin explicaciones, sin etiquetas. Mantén el mismo idioma del texto original.`;
  }

  /** Strip prefixes Claude sometimes adds despite the instruction. */
  private cleanOutput(raw: string): string {
    return raw
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/^(aquí|here|texto ajustado|sugerencia)[:\-—]\s*/i, "")
      .trim();
  }

  /** Rule-based fallback — no LLM. Trivial transformations to avoid
   * returning the literal input. Used when ANTHROPIC_API_KEY missing or
   * LLM call returns empty / hits 4xx. */
  private fallback(intent: AuthorAiIntent, text: string): string {
    switch (intent) {
      case "simplificar":
        return text
          .split(/(?<=\.) +/)
          .map((s) => s.length > 140 ? s.slice(0, 140).trimEnd() + "…" : s)
          .join(" ");
      case "ejemplo":
        return `${text}\n\nPor ejemplo: imagina una situación cotidiana donde esto se manifieste…`;
      case "tono":
        return text.replace(/\bdebes\b/gi, "te invito a").replace(/\btienes que\b/gi, "vale la pena");
      case "revisar":
      default:
        return text;
    }
  }
}

const SYSTEM_PROMPTS: Record<AuthorAiIntent, string> = {
  revisar:
    "Eres un editor de psicoeducación cálido y experto. Revisas el tono y la claridad de un fragmento escrito por un autor de la plataforma. Devuelve UNA versión revisada del mismo texto: misma idea central, mejor cadencia, menos jerga clínica innecesaria. Conserva la estructura del autor — no agregues nuevos párrafos. Si el texto ya está bien, devuélvelo casi idéntico.",
  ejemplo:
    "Eres un editor de psicoeducación experto. El autor te da un fragmento y necesita un ejemplo concreto que ilustre el concepto. Devuelve el texto original SEGUIDO de un párrafo breve (3-5 oraciones) con un ejemplo accesible y verosímil de la vida cotidiana en LATAM. No incluyas etiquetas como 'Por ejemplo:'.",
  tono:
    "Eres un editor de psicoeducación. Reformula el texto del autor en un tono más cálido y cercano, sin perder rigor. Evita lenguaje clínico distante. Usa segunda persona (tú) con respeto. Mantén la estructura — no expandas.",
  simplificar:
    "Eres un editor de psicoeducación. El autor te da un fragmento y quiere bajarlo a un nivel de lectura simple (B1-B2 español). Reduce oraciones largas, sustituye terminología clínica por sinónimos accesibles, mantén el significado. Devuelve solo el texto simplificado.",
};
