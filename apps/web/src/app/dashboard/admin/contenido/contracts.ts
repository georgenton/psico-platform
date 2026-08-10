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
