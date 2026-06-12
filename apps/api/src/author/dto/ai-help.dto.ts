import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * AI helper intents (Sprint S71.C-AI). Determines the LLM prompt
 * scaffold used to transform the author's selected text:
 *
 * - `revisar` — revisar tono editorial general (warmth, clarity).
 * - `ejemplo` — sugerir un ejemplo concreto que ilustre la idea.
 * - `tono`    — reformular en un tono específico (más cálido / clínico).
 * - `simplificar` — reducir complejidad lexical para audiencia general.
 */
export type AuthorAiIntent = "revisar" | "ejemplo" | "tono" | "simplificar";

/**
 * Body for `POST /api/autor/libros/:id/ai-help` — invoke the editor's
 * AI helper on a block of text.
 *
 * AUTHOR-only + throttled at the controller level (10/min). The server
 * routes to Claude with an intent-specific system prompt and returns
 * the rewritten suggestion. The author can accept or reject in the
 * editor — `text` is never auto-saved.
 *
 * Pure metadata operation — no DB writes besides the AI usage audit
 * row that captures (`authorId`, `intent`, `inputTokens`,
 * `outputTokens`).
 */
export class AuthorAiHelpDto {
  /**
   * Which transform to apply. Plugin emits the enum in OpenAPI from
   * `@IsIn`.
   */
  @IsString()
  @IsIn(["revisar", "ejemplo", "tono", "simplificar"])
  intent!: AuthorAiIntent;

  /**
   * Source text from the editor block (1–8000 chars). The LLM
   * receives this verbatim. Author keeps full control — server never
   * autosaves the LLM output back into the book.
   */
  @IsString()
  @MinLength(1, { message: "El texto seleccionado no puede estar vacío." })
  @MaxLength(8000)
  text!: string;

  /**
   * Optional `AuthorBookChapterBlock.id` the text was selected from.
   * Used for the AI usage audit row + future per-block instrumentation.
   * Omit if the helper is invoked over a free-form selection.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  blockId?: string;

  /**
   * Optional chapter / book context (up to 1000 chars). Injected into
   * the system prompt as "el lector ha leído hasta este punto" so the
   * LLM keeps tone consistent. Typically the chapter summary + the
   * previous block.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  context?: string;
}
