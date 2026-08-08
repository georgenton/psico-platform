import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Content Studio write DTOs.
 *
 * The browser sends CONTENT. It cannot send an edition, a unit key, a revision
 * number, a chapter id or a `ContentBlock` identity — those are resolved from
 * the route server-side, so a request cannot reach across books.
 *
 * Title, summary and duration are NOT here. The editor does not administer them
 * yet, and a field an admin could change through curl but not through the UI is
 * a promise the product has not made — the server carries them forward from the
 * base revision instead.
 *
 * `meta` is the one loosely-typed field, and deliberately so: an IMAGE or AUDIO
 * block carries metadata this vertical does not administer yet, and it must
 * survive a text edit untouched rather than be stripped by a schema that has not
 * learned about it.
 */
export class ContentBlockInputDto {
  @ApiProperty({ example: "PARAGRAPH" })
  @IsString()
  @MaxLength(40)
  kind!: string;

  @ApiProperty({ description: "El texto del bloque." })
  @IsString()
  @MaxLength(100_000)
  content!: string;

  @ApiProperty({
    required: false,
    type: Object,
    additionalProperties: true,
    description:
      "Metadatos del bloque. Forma libre a propósito: un IMAGE o AUDIO trae metadatos que este vertical todavía no administra, y deben sobrevivir una edición de texto intactos.",
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class SaveChapterDraftDto {
  @ApiProperty({ description: "La revisión que el editor cargó." })
  @IsString()
  expectedRevisionId!: string;

  @ApiProperty({ type: [ContentBlockInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentBlockInputDto)
  blocks!: ContentBlockInputDto[];
}

export class PublishBookDto {
  @ApiProperty({ description: "El borrador que el editor está publicando." })
  @IsString()
  expectedDraftRevisionId!: string;
}

export class PreviewQueryDto {
  @ApiProperty()
  @IsString()
  revisionId!: string;
}

/**
 * Chapter media — what an admin browser may send.
 *
 * Editorial copy only. `mediaKey`, `mediaVersion`, `kind`, `status`,
 * `accessPolicy` and everything provider-shaped are absent by design: those
 * decide what plays and who may play it, and the server carries them forward
 * from the stored definition. Same rule as the chapter title in Block B2.
 */
/** Mirrors `validateChapterMediaDefinition`, so the boundary rejects what the
 * domain would reject anyway — with a message that names the field. */
export const MEDIA_TITLE_MAX = 160;
export const MEDIA_DESCRIPTION_MAX = 400;

export class MediaChapterMarkDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  startSec!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  label!: string;
}

export class UpdateMediaDraftDto {
  // The limits are the DOMAIN's, not looser ones. `validateChapterMediaDefinition`
  // caps title at 160 and description at 400, so accepting more here would only
  // move the rejection from a clear 400 to an opaque one deeper in.
  @ApiProperty({ maxLength: MEDIA_TITLE_MAX })
  @IsString()
  @MaxLength(MEDIA_TITLE_MAX)
  title!: string;

  @ApiProperty({ maxLength: MEDIA_DESCRIPTION_MAX })
  @IsString()
  @MaxLength(MEDIA_DESCRIPTION_MAX)
  description!: string;

  // `type: Number` is load-bearing: without it Swagger emits an untyped schema
  // and the generated client collapses this to `Record<string, never>`, which
  // type-checks against nothing an editor could send.
  @ApiProperty({ required: false, nullable: true, type: Number, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number | null;

  @ApiProperty({ type: [MediaChapterMarkDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaChapterMarkDto)
  chapters!: MediaChapterMarkDto[];
}

export class CreateComingSoonMediaDto {
  @ApiProperty({ enum: ["AUDIOBOOK", "PODCAST", "VIDEO"] })
  @IsIn(["AUDIOBOOK", "PODCAST", "VIDEO"])
  kind!: "AUDIOBOOK" | "PODCAST" | "VIDEO";

  @ApiProperty({ maxLength: MEDIA_TITLE_MAX })
  @IsString()
  @MaxLength(MEDIA_TITLE_MAX)
  title!: string;

  @ApiProperty({ maxLength: MEDIA_DESCRIPTION_MAX })
  @IsString()
  @MaxLength(MEDIA_DESCRIPTION_MAX)
  description!: string;
}
