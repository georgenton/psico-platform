import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
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
