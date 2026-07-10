import { IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator"; // prettier-ignore

/**
 * Body for `POST /api/emotional-map/text-features` — Etapa 6 (Fase B).
 *
 * The diary is E2E-encrypted; the CLIENT analyzed the decrypted text locally
 * (`analyzeReflectionText` in @psico/types) and sends ONLY these numbers.
 * Privacy invariant: every field is numeric except the optional entry id —
 * there is deliberately no field that could carry text, and the global
 * whitelist ValidationPipe strips anything extra.
 */
export class LogTextFeaturesDto {
  /** Diary entry the features belong to; enables idempotent re-save upsert. */
  @IsOptional()
  @IsString()
  @Length(10, 64)
  entryId?: string;

  /** Tokens in the analyzed entry. */
  @IsInt()
  @Min(5)
  @Max(100000)
  wordCount!: number;

  /** First-person singular pronoun density in [0,1]. */
  @IsNumber() @Min(0) @Max(1) selfFocus!: number;
  /** Positive-affect word density in [0,1]. */
  @IsNumber() @Min(0) @Max(1) positive!: number;
  /** Negative-affect word density in [0,1]. */
  @IsNumber() @Min(0) @Max(1) negative!: number;
  /** Cognitive-insight marker density in [0,1]. */
  @IsNumber() @Min(0) @Max(1) insight!: number;
  /** Causal-language density in [0,1]. */
  @IsNumber() @Min(0) @Max(1) causal!: number;
  /** Absolutist word density in [0,1]. */
  @IsNumber() @Min(0) @Max(1) absolutist!: number;
  /** Social-reference density in [0,1]. */
  @IsNumber() @Min(0) @Max(1) social!: number;
  /** Self-kind talk density in [0,1]. */
  @IsNumber() @Min(0) @Max(1) selfKind!: number;
  /** Self-critical talk density in [0,1]. */
  @IsNumber() @Min(0) @Max(1) selfCritic!: number;
}
