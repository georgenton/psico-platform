import { ApiProperty } from "@nestjs/swagger";

/**
 * Content Studio response DTOs.
 *
 * These exist for one reason: without them the generated client types every
 * successful response as `content?: never`, so the editor UI would consume six
 * endpoints with no idea what they return and every field access would be a
 * hand-written guess. A contract nobody can compile against is not a contract.
 *
 * They describe what the editor needs and nothing else. No internal ids leak:
 * an edition id, a unit key or a `ContentBlock` row id would tell the browser
 * things it must never send back.
 *
 * `meta` is the exception to the strictness, and deliberately so. An IMAGE or
 * AUDIO block carries metadata this vertical does not administer yet; declaring
 * it as an open object keeps it round-tripping untouched instead of being
 * flattened into `Record<string, never>` — which is the same as losing it.
 */

const OPEN_OBJECT = {
  type: Object,
  additionalProperties: true,
  description:
    "Metadatos del bloque. Forma libre: depende del kind y este vertical no la administra todavía.",
};

export class ContentStudioBookSummaryDto {
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) subtitle!: string | null;
  @ApiProperty({ nullable: true, type: String }) authorName!: string | null;
  @ApiProperty({ nullable: true, type: String }) categoryLabel!: string | null;
  @ApiProperty({ description: "Plan mínimo para leerlo." }) plan!: string;
  @ApiProperty() isPublished!: boolean;
  @ApiProperty() totalChapters!: number;
}

export class ContentStudioBookListResponseDto {
  @ApiProperty({ type: [ContentStudioBookSummaryDto] })
  books!: ContentStudioBookSummaryDto[];
}

export class ContentStudioBookDto {
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) subtitle!: string | null;
  @ApiProperty({ nullable: true, type: String }) authorName!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "La portada vigente del catálogo, o null si no hay ninguna.",
  })
  coverArtUrl!: string | null;
}

export class ContentStudioChapterRowDto {
  @ApiProperty() order!: number;

  @ApiProperty({
    description:
      "El título tal como está en la revisión que se edita — el borrador si existe, si no lo publicado.",
  })
  title!: string;

  @ApiProperty({ description: "El borrador cambia este capítulo." })
  changed!: boolean;
}

export class ContentStudioBookStateResponseDto {
  @ApiProperty({ type: ContentStudioBookDto })
  book!: ContentStudioBookDto;

  @ApiProperty({ nullable: true, type: Number })
  publishedRevisionNumber!: number | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "El borrador activo del LIBRO, o null si no hay ninguno.",
  })
  draftRevisionId!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  draftRevisionNumber!: number | null;

  @ApiProperty() changedUnitCount!: number;

  @ApiProperty({ type: [ContentStudioChapterRowDto] })
  chapters!: ContentStudioChapterRowDto[];
}

export class ContentStudioBlockDto {
  @ApiProperty({ description: "Identidad pública y estable del bloque." })
  blockKey!: string;

  @ApiProperty({ example: "PARAGRAPH" }) kind!: string;
  @ApiProperty() order!: number;
  @ApiProperty() content!: string;

  @ApiProperty({ ...OPEN_OBJECT, nullable: true, required: false })
  meta!: Record<string, unknown> | null;
}

export class ContentStudioChapterResponseDto {
  @ApiProperty() bookSlug!: string;
  @ApiProperty() chapterOrder!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ nullable: true, type: Number })
  durationMinutes!: number | null;

  @ApiProperty({
    description:
      "El token de concurrencia. Debe volver tal cual en el siguiente guardado.",
  })
  revisionId!: string;

  @ApiProperty() revisionNumber!: number;

  @ApiProperty({ enum: ["DRAFT", "PUBLISHED"] })
  revisionStatus!: "DRAFT" | "PUBLISHED";

  @ApiProperty({ description: "Capítulos que el borrador del libro cambia." })
  changedUnitCount!: number;

  @ApiProperty({ type: [ContentStudioBlockDto] })
  blocks!: ContentStudioBlockDto[];
}

export class ContentStudioSaveResponseDto {
  @ApiProperty({ description: "El nuevo token de concurrencia." })
  revisionId!: string;

  @ApiProperty() revisionNumber!: number;
  @ApiProperty() changedUnitCount!: number;
}

export class ContentStudioPreviewResponseDto {
  @ApiProperty() bookSlug!: string;
  @ApiProperty() chapterOrder!: number;
  @ApiProperty() revisionId!: string;
  @ApiProperty() revisionNumber!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ nullable: true, type: Number })
  durationMinutes!: number | null;

  @ApiProperty({ type: [ContentStudioBlockDto] })
  blocks!: ContentStudioBlockDto[];
}

export class ContentStudioPublishResponseDto {
  @ApiProperty() revisionId!: string;
  @ApiProperty() revisionNumber!: number;

  @ApiProperty({
    description: "Cuántos capítulos cambiaba el borrador al publicarse.",
  })
  changedUnitCountBeforePublish!: number;
}

export class ContentStudioCoverResponseDto {
  @ApiProperty({ description: "La portada ya vigente en el catálogo." })
  coverArtUrl!: string;
}

export class ContentStudioChapterImageResponseDto {
  @ApiProperty({
    description:
      "Dónde quedó la imagen. Todavía no forma parte del capítulo: eso ocurre al guardar el borrador.",
  })
  imageUrl!: string;
}

/**
 * Chapter media, as an admin browser is allowed to see it.
 *
 * Deliberately not the definition. An object key, a Stream UID or an access
 * policy decide what plays and who may play it; putting them in a JSON response
 * would leak our storage layout into a browser tab for no editorial benefit.
 * The admin edits copy, so the admin sees copy — plus honest booleans about what
 * exists.
 */
export class ContentStudioMediaChapterMarkDto {
  @ApiProperty() startSec!: number;
  @ApiProperty() label!: string;
}

export class ContentStudioMediaCardDto {
  @ApiProperty({ enum: ["AUDIOBOOK", "PODCAST", "VIDEO"] })
  kind!: "AUDIOBOOK" | "PODCAST" | "VIDEO";

  @ApiProperty() mediaKey!: string;
  @ApiProperty() mediaVersion!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: Number }) durationSec!: number | null;

  @ApiProperty({ type: [ContentStudioMediaChapterMarkDto] })
  chapters!: ContentStudioMediaChapterMarkDto[];

  @ApiProperty({
    enum: ["COMING_SOON", "AVAILABLE"],
    description: "Lo que el lector ve hoy.",
  })
  runtimeAvailability!: "COMING_SOON" | "AVAILABLE";

  @ApiProperty({ description: "Si hay un archivo realmente asociado." })
  sourceReady!: boolean;

  @ApiProperty() hasTranscript!: boolean;
  @ApiProperty() hasPoster!: boolean;
  @ApiProperty() hasCaptions!: boolean;

  @ApiProperty({
    enum: ["CODE", "DATABASE"],
    description: "De dónde sale la definición vigente.",
  })
  provenance!: "CODE" | "DATABASE";

  @ApiProperty({ enum: ["CODE_OWNED", "DRAFT", "PUBLISHED"] })
  editorialStatus!: "CODE_OWNED" | "DRAFT" | "PUBLISHED";

  @ApiProperty({ nullable: true, type: String })
  draftId!: string | null;
}

export class ContentStudioChapterMediaResponseDto {
  @ApiProperty() bookSlug!: string;
  @ApiProperty() chapterOrder!: number;

  @ApiProperty({ type: [ContentStudioMediaCardDto] })
  media!: ContentStudioMediaCardDto[];

  @ApiProperty({
    enum: ["AUDIOBOOK", "PODCAST", "VIDEO"],
    isArray: true,
    description:
      "Formatos que el capítulo no tiene. Sin esto el CMS sólo podría decir «no hay» sin ofrecer nada.",
  })
  missingKinds!: Array<"AUDIOBOOK" | "PODCAST" | "VIDEO">;
}

export class ContentStudioMediaDraftRefDto {
  @ApiProperty() draftId!: string;
  @ApiProperty() mediaKey!: string;
}

export class ContentStudioMediaPublishResponseDto {
  @ApiProperty() draftId!: string;
  @ApiProperty() mediaKey!: string;
  @ApiProperty() mediaVersion!: number;
}
