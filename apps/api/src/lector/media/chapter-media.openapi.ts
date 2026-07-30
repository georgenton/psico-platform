import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

/**
 * GR-2 — CLOSED OpenAPI schemas for the three chapter-media operations.
 *
 * Raw schema objects rather than class DTOs, for the same reason the Guide
 * surface uses them (CC-7.4D): the published contract should state exactly what
 * the shared types promise, with `additionalProperties: false` everywhere,
 * instead of Nest inferring `{ type: "object" }` from a `Promise<T>` return and
 * the generated client collapsing it to `Record<string, never>`.
 *
 * These schemas are a 1:1 restatement of `@psico/types/chapter-media`. What is
 * absent there is absent here, and that absence is the contract: no storage key,
 * no provider identity (`videoUid`, `accountId`, `customerCode`), no token, no
 * `accessPolicy`, no `provider`, no `userId`, no `editionId`, no `unitId`.
 *
 * The signed URL appears in the ACCESS response and nowhere else — never in the
 * manifest, never in the command answer.
 */

const MEDIA_KEY: SchemaObject = {
  type: "string",
  description: "Clave de catálogo del medio — fija también su versión.",
};

const MEDIA_VERSION: SchemaObject = {
  type: "integer",
  minimum: 1,
  description: "Un máster nuevo es una VERSIÓN nueva, nunca una edición.",
};

const MEDIA_KIND: SchemaObject = {
  type: "string",
  enum: ["AUDIOBOOK", "PODCAST", "VIDEO"],
};

/** A script decision, not a provider fact: it exists before the master does. */
const CHAPTER_MARK: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["startSec", "label"],
  properties: {
    startSec: { type: "number", minimum: 0 },
    label: { type: "string" },
  },
};

const MEDIA_SUMMARY: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "mediaKey",
    "mediaVersion",
    "kind",
    "title",
    "description",
    "durationSec",
    "availability",
    "hasTranscript",
    "hasCaptions",
    "chapters",
  ],
  properties: {
    mediaKey: MEDIA_KEY,
    mediaVersion: MEDIA_VERSION,
    kind: MEDIA_KIND,
    title: { type: "string" },
    description: { type: "string" },
    durationSec: {
      type: "number",
      nullable: true,
      minimum: 0,
      description: "Duración editorial, o null mientras no exista el máster.",
    },
    availability: {
      type: "string",
      enum: ["AVAILABLE", "COMING_SOON"],
      description:
        "`COMING_SOON` es honesto: el formato está anunciado y no hay asset.",
    },
    hasTranscript: { type: "boolean" },
    hasCaptions: { type: "boolean" },
    chapters: { type: "array", items: CHAPTER_MARK },
  },
};

/** GET /api/lector/:bookId/:chapterOrder/media — metadata only, signs nothing. */
export const CHAPTER_MEDIA_MANIFEST_RESPONSE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["bookSlug", "chapterOrder", "items"],
  properties: {
    bookSlug: { type: "string" },
    chapterOrder: { type: "integer", minimum: 1 },
    items: { type: "array", items: MEDIA_SUMMARY },
  },
};

const EXPIRES_AT: SchemaObject = {
  type: "string",
  format: "date-time",
  description:
    "Instante ISO-8601 en que conviene volver a pedir. No promete que la " +
    "URL siga válida hasta entonces.",
};

const AUDIO_ACCESS: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "mediaKey",
    "mediaVersion",
    "url",
    "expiresAt",
    "transcriptUrl",
    "posterUrl",
  ],
  properties: {
    kind: { type: "string", enum: ["AUDIOBOOK", "PODCAST"] },
    mediaKey: MEDIA_KEY,
    mediaVersion: MEDIA_VERSION,
    url: {
      type: "string",
      description: "URL firmada de corta vida — es un bearer temporal.",
    },
    expiresAt: EXPIRES_AT,
    transcriptUrl: { type: "string", nullable: true },
    posterUrl: { type: "string", nullable: true },
  },
};

const VIDEO_ACCESS: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "mediaKey",
    "mediaVersion",
    "embedUrl",
    "expiresAt",
    "transcriptUrl",
    "posterUrl",
    "defaultTextTrack",
  ],
  properties: {
    kind: { type: "string", enum: ["VIDEO"] },
    mediaKey: MEDIA_KEY,
    mediaVersion: MEDIA_VERSION,
    embedUrl: {
      type: "string",
      description:
        "URL del reproductor gestionado del proveedor. La identidad del " +
        "proveedor nunca viaja como campo aparte.",
    },
    expiresAt: EXPIRES_AT,
    transcriptUrl: { type: "string", nullable: true },
    posterUrl: { type: "string", nullable: true },
    defaultTextTrack: { type: "string", nullable: true },
  },
};

/**
 * GET /api/lector/media/:mediaKey/access — the ONLY place a signed URL exists.
 *
 * Two branches because they are genuinely different shapes: audio is a URL for
 * `<audio>`, video is an embed URL for the managed player.
 *
 * La unión se discrimina estructuralmente por el campo `kind`, requerido y
 * literal en cada rama.
 *
 * No se usa el objeto OpenAPI `discriminator` porque las ramas están declaradas
 * inline; en OpenAPI 3.0 un `discriminator` solo es portable con schemas
 * referidos.
 */
export const CHAPTER_MEDIA_ACCESS_RESPONSE: SchemaObject = {
  oneOf: [AUDIO_ACCESS, VIDEO_ACCESS],
};

/**
 * POST /api/lector/media/:mediaKey/complete — the body.
 *
 * Deliberately empty and CLOSED. The media kind, its version, the editorial
 * unit and the idempotency key are all derived server-side from `mediaKey` and
 * the authenticated actor, so there is nothing for a client to send — and
 * anything it does send would be a claim the server must not trust.
 */
export const CHAPTER_MEDIA_COMPLETE_BODY: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
  description:
    "Sin campos. Se acepta ausencia de body o `{}`; cualquier propiedad " +
    "adicional se rechaza con `MEDIA_INVALID_PAYLOAD`.",
};

/** The answer of the completion command, on both 201 and 200. */
export const CHAPTER_MEDIA_COMMAND_RESPONSE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["created", "replayed"],
  properties: {
    created: {
      type: "boolean",
      description: "Esta llamada escribió la finalización (HTTP 201).",
    },
    replayed: {
      type: "boolean",
      description:
        "Una llamada idéntica anterior ya la escribió; ahora no corrió nada " +
        "(HTTP 200).",
    },
  },
};
