import { IsIn, IsInt, Max, Min } from "class-validator";
import { CHECKIN_ITEM_KEYS } from "@psico/types";

/**
 * Body for `POST /api/mood/checkin` — one micro-checkin answer (Mapa Emocional
 * Etapa 2). Plain ordinal score, no text (ADR 0007).
 */
export class LogCheckinDto {
  /**
   * Which question was answered. Must be one of the CHECKIN_ITEMS keys from
   * `@psico/types` (compile-time shared catalog; adding an item there is
   * enough — no migration, the column is String).
   */
  @IsIn(CHECKIN_ITEM_KEYS as string[])
  itemKey!: string;

  /** Answer on the shared CHECKIN_SCALE: 0 = "Para nada" … 4 = "Totalmente". */
  @IsInt()
  @Min(0)
  @Max(4)
  score!: number;
}
