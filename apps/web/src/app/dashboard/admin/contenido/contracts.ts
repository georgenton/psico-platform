import type { ApiComponents } from "@psico/api-client";

/**
 * Content Studio's shapes, taken FROM the OpenAPI contract rather than restated
 * beside it.
 *
 * These are aliases into the generated client, so if the API changes a field the
 * editor stops compiling instead of silently reading `undefined`. A hand-written
 * mirror of a response shape is a guess that looks like a type.
 */

type S = ApiComponents["schemas"];

export type BookSummary = S["ContentStudioBookSummaryDto"];
export type BookList = S["ContentStudioBookListResponseDto"];
export type BookState = S["ContentStudioBookStateResponseDto"];
export type ChapterRow = S["ContentStudioChapterRowDto"];
export type StudioBlock = S["ContentStudioBlockDto"];
export type ChapterContent = S["ContentStudioChapterResponseDto"];
export type ChapterPreview = S["ContentStudioPreviewResponseDto"];
export type SaveResult = S["ContentStudioSaveResponseDto"];
export type PublishResult = S["ContentStudioPublishResponseDto"];
export type CoverResult = S["ContentStudioCoverResponseDto"];
export type ChapterImageResult = S["ContentStudioChapterImageResponseDto"];
export type ChapterMediaList = S["ContentStudioChapterMediaResponseDto"];
export type MediaCard = S["ContentStudioMediaCardDto"];
export type MediaDraftRef = S["ContentStudioMediaDraftRefDto"];
export type MediaPublishResult = S["ContentStudioMediaPublishResponseDto"];
export type MediaUploadResult = S["ContentStudioMediaUploadResponseDto"];
export type VideoUploadIntent = S["ContentStudioVideoUploadIntentDto"];
export type VideoUploadStatus = S["ContentStudioVideoUploadStatusDto"];

/**
 * How big a chapter video may be, mirrored for the file picker.
 *
 * The provider enforces its own limits and measures the duration itself; this
 * only spares the editor starting a transfer that was never going to finish.
 */
export const VIDEO_ACCEPT =
  "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** The ingest states, as plain unions for the same reason as `MediaKind`. */
export type VideoUploadState =
  | "AWAITING_UPLOAD"
  | "PROCESSING"
  | "READY"
  | "ERROR";

/**
 * The audio the server actually accepts, mirrored for the file picker.
 *
 * Narrower than `/autor`'s eight on purpose: WAV is uncompressed and a
 * chapter-length master would exceed the size limit, and OGG/WebM have no
 * Safari support — which is most of this product's iOS audience. The server
 * remains the authority; this only stops the editor picking something that was
 * always going to be refused.
 */
export const AUDIO_ACCEPT =
  "audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/x-m4a,.mp3,.m4a";
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;

/**
 * The media enums as plain unions.
 *
 * The generated client models each as a runtime TS `enum`, which a string
 * literal is not assignable to. Enum members ARE assignable to their literal
 * types, so this still type-checks against the contract without pulling a value
 * dependency into the bundle. Same reasoning as `RevisionStatus`.
 */
export type MediaKind = "AUDIOBOOK" | "PODCAST" | "VIDEO";
export type MediaRuntimeAvailability = "COMING_SOON" | "AVAILABLE";
export type MediaProvenance = "CODE" | "DATABASE";
export type MediaEditorialStatus = "CODE_OWNED" | "DRAFT" | "PUBLISHED";

/** A card whose enum fields accept literals — for fixtures and local state. */
export type MediaCardOverrides = Partial<
  Omit<
    MediaCard,
    "kind" | "runtimeAvailability" | "provenance" | "editorialStatus"
  >
> & {
  kind?: MediaKind;
  runtimeAvailability?: MediaRuntimeAvailability;
  provenance?: MediaProvenance;
  editorialStatus?: MediaEditorialStatus;
  stagedMaster?: boolean;
  awaitingUpload?: boolean;
};

export const MEDIA_KIND_LABEL: Record<string, string> = {
  AUDIOBOOK: "Audiolibro",
  PODCAST: "Podcast",
  VIDEO: "Video",
};

/**
 * The revision status as a plain union.
 *
 * The generated client models it as a runtime TS `enum`, and importing that
 * would pull a value dependency into the bundle just to hold two strings in
 * component state. Enum members are assignable to their literal types, so this
 * still type-checks against the contract.
 */
export type RevisionStatus = "DRAFT" | "PUBLISHED";

/** What a save sends per block: content only, never identity. */
export interface StudioBlockInput {
  kind: string;
  content: string;
  meta?: Record<string, unknown>;
}

/**
 * The kinds this vertical can edit. Everything else in a chapter — images,
 * audio, video, exercises — is preserved and shown read-only, because
 * administering it needs uploads and a media contract (Block C). Preserved is
 * not the same as supported, and the UI says which one it means.
 */
export const EDITABLE_KINDS = [
  "PARAGRAPH",
  "HEADING",
  "QUOTE",
  "PAUSE",
] as const;

/**
 * IMAGE is administered, but not as a textarea — it has a file, alt text, a
 * caption and a credit. It gets its own editor row, so it is neither "editable
 * text" nor "preserved read-only".
 */
export function isImageKind(kind: string): boolean {
  return kind === "IMAGE";
}
export type EditableKind = (typeof EDITABLE_KINDS)[number];

export const KIND_LABEL: Record<string, string> = {
  PARAGRAPH: "Párrafo",
  HEADING: "Título",
  QUOTE: "Cita",
  PAUSE: "Pausa",
  IMAGE: "Imagen",
  AUDIO: "Audio",
  VIDEO: "Video",
  EXERCISE: "Ejercicio",
};

export function isEditableKind(kind: string): kind is EditableKind {
  return (EDITABLE_KINDS as readonly string[]).includes(kind);
}
