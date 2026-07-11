import { IsIn, IsInt, IsString, Length, Min } from "class-validator";
import type { ResonanceSource } from "@psico/types";

/**
 * Fase E (V2, ARC cycle) — payload of an EXPLICIT resonance confirmation.
 * The concept comes from the shared CHAPTER_CONCEPTS catalog (or its stable
 * fallback), so the label travels with the key: the map can render it even
 * if the catalog entry is later re-curated.
 */
export class ConfirmResonanceDto {
  /** Stable concept key (persisted; never renamed in the catalog). */
  @IsString()
  @Length(1, 80)
  conceptKey!: string;

  /** Human label shown on the map ("Mis resonancias"). */
  @IsString()
  @Length(1, 120)
  conceptLabel!: string;

  @IsString()
  @Length(1, 80)
  bookSlug!: string;

  @IsInt()
  @Min(1)
  chapterOrder!: number;

  /** Where the confirmation happened (provenance). */
  @IsIn(["highlight", "eco", "exercise"])
  source!: ResonanceSource;
}
