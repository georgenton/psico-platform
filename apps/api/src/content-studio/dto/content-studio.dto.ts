import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
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

  /**
   * Only for a chapter Content Studio owns outright. Omitted means "leave the
   * title alone"; sending one for a legacy-backed chapter is refused rather
   * than ignored, so the editor never sees a rename that did not happen.
   */
  @ApiPropertyOptional({
    description:
      "Nuevo título. Solo para capítulos creados en Content Studio (titleEditable).",
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiProperty({ type: [ContentBlockInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentBlockInputDto)
  blocks!: ContentBlockInputDto[];
}

/** Creating a chapter: a title and the revision the editor was looking at. */
export class CreateChapterDto {
  @ApiProperty({ description: "La revisión que el editor cargó." })
  @IsString()
  expectedRevisionId!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  title!: string;
}

/** Discarding a chapter that was never published. */
export class DiscardChapterDto {
  @ApiProperty({ description: "El borrador del que se descarta el capítulo." })
  @IsString()
  expectedRevisionId!: string;
}

/**
 * Rearranging the book's chapters.
 *
 * `orderedChapterOrders` carries the CURRENT order values of the revision named
 * by `expectedRevisionId`, in the sequence the editor wants them. They are
 * locators inside that exact revision — not identities — which is why the
 * concurrency token is not optional here: read against any other revision the
 * numbers would name different chapters.
 *
 * Shape only. That every current position appears exactly once, that nothing
 * crosses a part boundary, and that the edition may be reordered at all are
 * facts about the manifest, so they are decided where the manifest is — inside
 * the transaction, not by a decorator.
 */
export class ReorderChaptersDto {
  @ApiProperty({ description: "La revisión que el editor cargó." })
  @IsString()
  @MaxLength(200)
  expectedRevisionId!: string;

  @ApiProperty({
    type: [Number],
    example: [3, 1, 2],
    description:
      "Las posiciones actuales de esa revisión, en el orden deseado. Deben ser todas, exactamente una vez.",
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @IsInt({ each: true })
  @Min(1, { each: true })
  orderedChapterOrders!: number[];
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

/**
 * Audio upload — what accompanies the file.
 *
 * Multipart, so these arrive as strings and are coerced. Deliberately absent:
 * `objectKey`, `accessPolicy`, `status`, `bucket`. The server mints the key and
 * derives the policy; a browser that could choose either would be choosing what
 * plays and who may play it.
 */
export class UploadAudiobookDto {
  @ApiProperty({ description: "Duración real del máster, en segundos." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationSec!: number;
}

export class UploadPodcastEpisodeDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationSec!: number;

  @ApiProperty({
    required: false,
    description:
      "Presente para reemplazar el máster de un episodio existente; ausente para crear uno nuevo.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mediaKey?: string;

  @ApiProperty({ required: false, maxLength: MEDIA_TITLE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(MEDIA_TITLE_MAX)
  title?: string;

  @ApiProperty({ required: false, maxLength: MEDIA_DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(MEDIA_DESCRIPTION_MAX)
  description?: string;
}

/**
 * C3 — asking for somewhere to put a chapter video.
 *
 * No file field: the browser never sends the bytes here. It asks for a
 * destination, uploads straight to the provider, and comes back to ask whether
 * it landed.
 *
 * No duration either, unlike the audio DTOs. The provider measures the file it
 * actually received, so a typed number would be a guess competing with a fact.
 */
export class CreateVideoUploadIntentDto {
  @ApiProperty({
    required: false,
    description:
      "Presente para reemplazar un video existente; ausente para crear uno nuevo.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mediaKey?: string;

  @ApiProperty({ required: false, maxLength: MEDIA_TITLE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(MEDIA_TITLE_MAX)
  title?: string;

  @ApiProperty({ required: false, maxLength: MEDIA_DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(MEDIA_DESCRIPTION_MAX)
  description?: string;
}
