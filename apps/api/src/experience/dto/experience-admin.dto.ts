import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * CMS V1 (#637) — the write DTOs.
 *
 * ── `expectedContentUnitId` ─────────────────────────────────────────────────
 *
 * C.3A (#639) — the stable chapter the client BELIEVES it is editing.
 *
 * A hint and never an authority. The server re-derives the identity from the
 * published manifest on every write and refuses when the two disagree, so this
 * cannot move a binding anywhere; what it CAN do is turn "an editor pressed
 * publish on a page rendered before a reorder" from a silent write into a
 * refusal the editor can act on.
 *
 * Shaped like a cuid because that is what `ContentUnit.id` is: an unbounded
 * string would be a free-text field on an admin write path for no reason.
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

  @ApiPropertyOptional({
    description:
      "El ContentUnit que el cliente cree estar editando. El servidor lo vuelve a derivar del manifiesto publicado y rechaza si no coincide: nunca lo usa como fuente.",
    example: "clx0000000000000000000000",
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  // The literal, not a named constant: the Swagger plugin serialises whatever
  // token it finds, and a named one reaches the published contract as the
  // WORD `CUID_LIKE` — a pattern no client could ever satisfy.
  @Matches(/^[a-z0-9]+$/)
  expectedContentUnitId?: string;
}

/**
 * The same hint, for the commands that carry no definition.
 *
 * Publish and next-draft take their chapter from the stored row, so they have
 * nothing else to send — but they are exactly the commands most likely to be
 * pressed on a page that has been open a while, which is when a reorder can
 * have happened underneath.
 */
export class ExperienceBindingHintDto {
  @ApiPropertyOptional({
    description:
      "El ContentUnit que el cliente cree estar editando. Pista, no autoridad.",
    example: "clx0000000000000000000000",
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[a-z0-9]+$/)
  expectedContentUnitId?: string;
}

/**
 * C.4 — the pin an editor picked.
 *
 * Closed and shallow on purpose: two integers-and-a-string is the whole
 * vocabulary, and the server validates the pair against its registry and the
 * chapter's anchor before it means anything.
 */
export class GuidePinDto {
  @ApiProperty({ example: "eec-c1-cuerpo-antes-que-mente" })
  @IsString()
  guideKey!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(999_999_999)
  guideVersion!: number;
}

export class RebindExperienceDraftDto {
  @ApiProperty({ type: GuidePinDto })
  @IsObject()
  @ValidateNested()
  @Type(() => GuidePinDto)
  guidePin!: GuidePinDto;

  @ApiPropertyOptional({
    description:
      "El ContentUnit que el cliente cree estar editando. Pista, no autoridad.",
    example: "clx0000000000000000000000",
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[a-z0-9]+$/)
  expectedContentUnitId?: string;
}

export class ListSelectableGuidesQueryDto {
  @ApiProperty({ example: "emociones-en-construccion" })
  @IsString()
  bookSlug!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  chapterOrder!: number;

  /**
   * Whose point of view. With it, the guide this lineage already holds reads
   * `OWNED_BY_THIS_EXPERIENCE` instead of "taken by somebody".
   */
  @ApiProperty({ required: false, example: "eec-c1-cuerpo-antes-que-mente" })
  @IsOptional()
  @IsString()
  experienceKey?: string;
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

/**
 * C.4 (#639) — the RESPONSE shapes, published rather than implied.
 *
 * Nest infers request bodies from decorated DTOs and infers nothing at all
 * about responses. An endpoint that returns JSON and declares no schema reaches
 * `openapi-typescript` as `content?: never` — a generated client that types the
 * answer as "no body", which is not merely thin, it is wrong. Every consumer
 * then either casts or believes it.
 *
 * These are declaration-only classes: the service returns plain objects and
 * nothing constructs them. They exist so the contract says what actually comes
 * back.
 */
export class SelectableGuideOptionDto {
  @ApiProperty({ example: "eec-c1-cuerpo-antes-que-mente" })
  guideKey!: string;

  @ApiProperty({ example: 1 })
  guideVersion!: number;

  @ApiProperty({
    description: "Pasos de la guía, para dimensionar el trabajo.",
  })
  stepCount!: number;

  @ApiProperty({
    enum: [
      "AVAILABLE",
      "OWNED_BY_THIS_EXPERIENCE",
      "RESERVED_BY_ANOTHER_EXPERIENCE",
    ],
    description:
      "Decidida en el servidor bajo el lock del capítulo. Una guía reservada se lista como reservada, nunca se oculta — y no se revela quién la tiene.",
  })
  availability!:
    | "AVAILABLE"
    | "OWNED_BY_THIS_EXPERIENCE"
    | "RESERVED_BY_ANOTHER_EXPERIENCE";
}

/**
 * What a rebind returns.
 *
 * The row id and nothing else, deliberately: the guide it now holds is not
 * echoed, because the authority for that is the reservation the client should
 * re-read, not a value it was handed by the call that changed it.
 */
export class RebindExperienceDraftResultDto {
  @ApiProperty({ description: "El borrador que cambió de guía." })
  id!: string;
}

/** What archiving returns. Terminal, so there is nothing else to report. */
export class ArchiveExperienceDraftResultDto {
  @ApiProperty({ description: "El borrador archivado. La fila no se borra." })
  id!: string;
}
