import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsObject, IsString, Max, Min } from "class-validator";

/**
 * CMS V1 (#637) — the write DTOs.
 *
 * `definition` is deliberately typed as a plain object and NOT decorated with
 * `@ValidateNested`. The global pipe runs with `whitelist` +
 * `forbidNonWhitelisted`, and descending into the definition here would strip
 * scene payload fields it does not know about — silently mangling exactly the
 * thing we are trying to store faithfully.
 *
 * The real check is `validateExperienceDefinition`, which rebuilds the object
 * field by field and rejects unknown keys itself. One validator, the same one
 * the runtime trusts (ADR 0021).
 */
export class SaveExperienceDefinitionDto {
  @ApiProperty({
    description:
      "Un ChapterExperienceDefinition completo. El servidor decide status, versión, publishedAt y autor: lo que venga en esos campos se ignora.",
    type: Object,
  })
  @IsObject()
  definition!: Record<string, unknown>;
}

export class ListChapterExperiencesQueryDto {
  @ApiProperty({ example: "emociones-en-construccion" })
  @IsString()
  bookSlug!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  chapterOrder!: number;
}
