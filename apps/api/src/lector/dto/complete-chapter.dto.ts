import { IsOptional, IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Completing the chapter the reader actually opened.
 *
 * The route still addresses a chapter by position, and that was never enough:
 * a structural publish can move the chapter while the page is open, so
 * completing by position would mark whichever chapter slid into that slot as
 * read. Both structures need a stable name for that reason — `contentUnitId`
 * for a native chapter, `chapterId` for a legacy one.
 *
 * Both optional, so every existing client keeps working unchanged. Sending
 * both at once is rejected rather than resolved: they name different chapters.
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

  @ApiProperty({
    required: false,
    description:
      "Identidad estable del capítulo legado que el lector abrió. Prevalece sobre la posición de la ruta.",
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  chapterId?: string;
}
