import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * AI helper intents (Sprint S71.C-AI).
 *
 * - `revisar` — revisar tono editorial general (warmth, clarity).
 * - `ejemplo` — sugerir un ejemplo concreto que ilustre la idea.
 * - `tono`    — reformular en un tono específico (más cálido / clínico).
 * - `simplificar` — reducir complejidad lexical para audiencia general.
 */
export type AuthorAiIntent = "revisar" | "ejemplo" | "tono" | "simplificar";

export class AuthorAiHelpDto {
  @IsString()
  @IsIn(["revisar", "ejemplo", "tono", "simplificar"])
  intent!: AuthorAiIntent;

  /** Texto sobre el cual operar (el bloque del editor). */
  @IsString()
  @MinLength(1, { message: "El texto seleccionado no puede estar vacío." })
  @MaxLength(8000)
  text!: string;

  /** ID opcional del bloque para audit / instrumentation futura. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  blockId?: string;

  /** Contexto del capítulo o del libro completo (1000 chars). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  context?: string;
}
