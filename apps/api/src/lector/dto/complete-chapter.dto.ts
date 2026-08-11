import { IsOptional, IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Completing the chapter the reader actually opened.
 *
 * The route still addresses a chapter by position, and for a legacy chapter
 * that is enough. For a native one it is not: a structural publish can move the
 * chapter while the page is open, and completing by position would mark
 * whichever chapter slid into that slot as read.
 *
 * Optional, so every existing client keeps working unchanged.
 */
export class CompleteChapterDto {
  @ApiProperty({
    required: false,
    description:
      "Identidad estable del capítulo nativo que el lector abrió. Prevalece sobre la posición de la ruta.",
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  contentUnitId?: string;
}
