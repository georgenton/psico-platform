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

  @ApiProperty({
    description:
      "Creado en Content Studio y todavía sin publicar: puede descartarse.",
  })
  isNewDraftChapter!: boolean;

  @ApiProperty({
    description:
      "El título se administra aquí. Falso para capítulos que aún tienen fila legacy.",
  })
  titleEditable!: boolean;

  @ApiProperty({
    description:
      "Está en la revisión que se edita. Falso solo para un capítulo legacy que Content Core nunca ingirió: se lista porque los lectores sí lo ven, pero no puede editarse todavía.",
  })
  ingested!: boolean;

  @ApiProperty({
    description:
      "Puede abrirse en el editor. Falso para un capítulo pendiente de sincronización, que se lista pero no tiene nada que editar.",
  })
  editable!: boolean;
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

  @ApiProperty({
    description:
      "La revisión que se está editando (el borrador si existe, si no la publicada). Es el token que debe enviar una creación.",
  })
  editingRevisionId!: string;

  @ApiProperty({
    description:
      "El servidor decide si el libro admite un capítulo nuevo ahora mismo. El cliente no lo deduce: la regla vive en el servidor.",
  })
  chapterCreationAvailable!: boolean;

  @ApiProperty({
    nullable: true,
    enum: ["PENDING_SYNC"],
    description:
      "Por qué no se puede crear, cuando no se puede. Null cuando sí se puede.",
  })
  creationBlockedReason!: "PENDING_SYNC" | null;

  @ApiProperty({
    description:
      "El servidor decide si el libro admite reordenar ahora mismo. Requiere entitlement nativo (Edition.accessPlan) y estructura sincronizada.",
  })
  reorderAvailable!: boolean;

  @ApiProperty({
    nullable: true,
    enum: ["NATIVE_ENTITLEMENT_REQUIRED", "PENDING_SYNC"],
    description:
      "Por qué no se puede reordenar, cuando no se puede. Null cuando sí se puede.",
  })
  reorderBlockedReason!: "NATIVE_ENTITLEMENT_REQUIRED" | "PENDING_SYNC" | null;

  @ApiProperty() changedUnitCount!: number;

  @ApiProperty({
    description:
      "El borrador cambia la FORMA del libro (algo se movió, o cambió el conjunto de capítulos), no sólo el texto.",
  })
  structureChanged!: boolean;

  @ApiProperty({
    type: [ContentStudioChapterRowDto],
    description:
      "En el orden del borrador activo si lo hay, si no en el publicado. El cliente no reconstruye el manifiesto.",
  })
  chapters!: ContentStudioChapterRowDto[];
}

/** Reordering: the new concurrency token, and what the draft now says. */
export class ContentStudioReorderResponseDto {
  @ApiProperty({ description: "El nuevo token de concurrencia." })
  revisionId!: string;

  @ApiProperty() revisionNumber!: number;
  @ApiProperty() changedUnitCount!: number;
  @ApiProperty() structureChanged!: boolean;
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

  @ApiProperty({
    description:
      "El título se administra aquí. Falso para capítulos que aún tienen fila legacy.",
  })
  titleEditable!: boolean;

  @ApiProperty({
    description:
      "Este capítulo tiene panel de multimedia. Falso para capítulos nativos: el catálogo de medios sigue anclado al mundo legacy.",
  })
  mediaAdminAvailable!: boolean;

  @ApiProperty({
    description:
      "Creado en Content Studio y todavía sin publicar: puede descartarse.",
  })
  isNewDraftChapter!: boolean;

  @ApiProperty({ type: [ContentStudioBlockDto] })
  blocks!: ContentStudioBlockDto[];
}

export class ContentStudioSaveResponseDto {
  @ApiProperty({ description: "El nuevo token de concurrencia." })
  revisionId!: string;

  @ApiProperty() revisionNumber!: number;
  @ApiProperty() changedUnitCount!: number;
}

/** Creating a chapter: where it landed, plus the new concurrency token. */
export class ContentStudioCreateChapterResponseDto {
  @ApiProperty({ description: "La posición en la que quedó el capítulo." })
  chapterOrder!: number;

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

  @ApiProperty({
    description:
      "Se pidió subir un video y el archivo todavía no llegó. No se puede publicar así.",
  })
  awaitingUpload!: boolean;

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

  @ApiProperty({
    description:
      "El borrador tiene un máster subido desde Contenido; publicarlo pasa por la ruta de máster.",
  })
  stagedMaster!: boolean;

  @ApiProperty({ nullable: true, type: String })
  draftId!: string | null;
}

export class ContentStudioChapterMediaResponseDto {
  @ApiProperty() bookSlug!: string;
  @ApiProperty() chapterOrder!: number;

  @ApiProperty({ type: [ContentStudioMediaCardDto] })
  media!: ContentStudioMediaCardDto[];

  @ApiProperty({
    description:
      "Si la subida de video puede ofrecerse hoy. En falso, el CMS muestra el estado real en vez de un botón que terminaría en error.",
  })
  videoUploadAvailable!: boolean;

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

/**
 * What an upload tells the browser.
 *
 * Enough to continue the flow, and nothing about where the bytes live. No
 * object key, no bucket, no signed URL, no access policy — those are provider
 * and entitlement facts, and a JSON response is not the place for them.
 */
export class ContentStudioMediaUploadResponseDto {
  @ApiProperty() draftId!: string;
  @ApiProperty() mediaKey!: string;
  @ApiProperty() mediaVersion!: number;

  @ApiProperty({
    description: "El máster quedó almacenado. Todavía sin publicar.",
  })
  sourceReady!: boolean;
}

/**
 * Where to send a chapter video, and until when.
 *
 * The URL is one-time, carries no credential and expires on its own, which is
 * what makes it safe to hand to a browser. The provider's identifier for the
 * video is NOT here: the browser has no use for it, and a value in a response
 * body is a value in a screenshot.
 */
export class ContentStudioVideoUploadIntentDto {
  @ApiProperty() draftId!: string;
  @ApiProperty() mediaKey!: string;
  @ApiProperty() mediaVersion!: number;

  @ApiProperty({
    description: "URL de un solo uso para enviar el archivo directamente.",
  })
  uploadUrl!: string;

  @ApiProperty({ description: "Cuándo deja de servir esa URL." })
  expiresAt!: string;
}

/** How an in-flight video upload is doing, in our vocabulary rather than the provider's. */
export class ContentStudioVideoUploadStatusDto {
  @ApiProperty() draftId!: string;

  @ApiProperty({
    enum: ["AWAITING_UPLOAD", "PROCESSING", "READY", "ERROR"],
    description:
      "AWAITING_UPLOAD: el archivo aún no llegó. PROCESSING: llegó y se está procesando. READY: se puede publicar.",
  })
  state!: "AWAITING_UPLOAD" | "PROCESSING" | "READY" | "ERROR";

  @ApiProperty({
    description: "El video quedó asociado y ya se puede publicar.",
  })
  sourceReady!: boolean;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Medida por el proveedor sobre el archivo real.",
  })
  durationSec!: number | null;
}
