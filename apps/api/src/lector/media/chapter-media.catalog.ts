import type { ChapterMediaKind } from "@psico/types";

/**
 * GR-2 — the code-owned chapter media catalog.
 *
 * Product authority: docs/product/guided-reading-v1.md §4 (media strategy) and
 * docs/product/chapter-01-media-package.md (what is still pending).
 *
 * This is a small authority, deliberately: no CMS, no authoring surface, no
 * scene engine. A chapter's representations are editorial decisions, so they
 * live in reviewed code and change through a reviewed diff.
 *
 * Same shape as the Guide catalog (`apps/api/src/guide/guide-catalog.ts`): a
 * runtime validator that reconstructs field by field over a closed key grammar,
 * a registry that rejects duplicates, and a PRODUCTION list holding only
 * approved definitions. Test fixtures live in specs and never reach it.
 *
 * What a definition may NOT contain, enforced at runtime:
 *
 *   - a URL of any kind (the storage key is not a URL, and the signed URL is
 *     minted per request, never stored);
 *   - a token or any secret;
 *   - a userId;
 *   - emotional language — this catalog describes formats, not feelings.
 */

export class ChapterMediaCatalogError extends Error {
  constructor(readonly code: ChapterMediaCatalogErrorCode) {
    // Codes only — never the received value.
    super(code);
    this.name = "ChapterMediaCatalogError";
  }
}

export type ChapterMediaCatalogErrorCode =
  | "CHAPTER_MEDIA_CATALOG_INVALID_DEFINITION"
  | "CHAPTER_MEDIA_CATALOG_DUPLICATE_DEFINITION"
  | "CHAPTER_MEDIA_CATALOG_UNKNOWN_DEFINITION";

const fail = (): never => {
  throw new ChapterMediaCatalogError(
    "CHAPTER_MEDIA_CATALOG_INVALID_DEFINITION",
  );
};

// ─── Internal vocabulary (never leaves the server) ───────────────────────────

export type ChapterMediaStatus = "DRAFT" | "PUBLISHED";

/**
 * `PRO_ONLY` — the whole format is a Pro benefit, chapter number irrelevant.
 * This is what chapter audio already does today.
 *
 * `BOOK_ENTITLEMENT` — defer to the shared content gate (CC-6E): a FREE person
 * reads/hears chapter 1 of a Pro book, not chapter 7.
 */
export type ChapterMediaAccessPolicy = "PRO_ONLY" | "BOOK_ENTITLEMENT";

/**
 * Where the bytes are. `CHAPTER_AUDIO` means "the `Audio` row this chapter
 * already has" — GR-2 reuses that path instead of duplicating audio storage.
 */
export type ChapterMediaSource =
  | { kind: "CHAPTER_AUDIO" }
  | { kind: "R2"; objectKey: string }
  | { kind: "CLOUDFLARE_STREAM"; videoUid: string; captionLanguage: string };

export interface ChapterMediaChapterMarkDefinition {
  startSec: number;
  label: string;
}

export interface ChapterMediaDefinition {
  mediaKey: string;
  mediaVersion: number;

  bookSlug: string;
  chapterOrder: number;

  kind: ChapterMediaKind;
  status: ChapterMediaStatus;

  title: string;
  description: string;
  durationSec: number | null;

  accessPolicy: ChapterMediaAccessPolicy | null;

  source: ChapterMediaSource | null;

  posterObjectKey: string | null;
  transcriptObjectKey: string | null;

  chapters: ChapterMediaChapterMarkDefinition[];
}

// ─── Key + value grammar ─────────────────────────────────────────────────────

/**
 * Closed ASCII, lowercase, stable: alphanumeric start, then `a-z 0-9 . _ : -`,
 * max 200 chars. No whitespace, no controls, no uppercase — and NO silent case
 * normalization: an uppercase key is rejected, never lowered.
 */
const KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;

/** Object keys additionally allow `/` (they are storage paths). */
const OBJECT_KEY_RE = /^[a-z0-9][a-z0-9._:/-]{0,299}$/;

const URL_RE = /:\/\//;

export function isValidChapterMediaKey(value: unknown): value is string {
  return typeof value === "string" && KEY_RE.test(value);
}

function requireKey(value: unknown): string {
  if (!isValidChapterMediaKey(value)) fail();
  return value as string;
}

function requireObjectKey(value: unknown): string {
  if (typeof value !== "string" || !OBJECT_KEY_RE.test(value)) fail();
  // Belt and braces: a key that looks like a URL is a mis-copied asset link.
  if (URL_RE.test(value as string)) fail();
  return value as string;
}

/** Human-facing editorial copy: non-empty, single-line, bounded, no URLs. */
function requireText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") fail();
  const text = value as string;
  if (text.length === 0 || text.length > maxLength) fail();
  if (text !== text.trim()) fail();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) fail();
  if (URL_RE.test(text)) fail();
  return text;
}

function requirePositiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    fail();
  }
  return value as number;
}

function requireNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail();
  }
  return value as number;
}

function nullableNonNegativeInt(value: unknown): number | null {
  if (value === null) return null;
  return requireNonNegativeInt(value);
}

/** A plain object: `Object.prototype` or `null` prototype — nothing else. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Fail on any own key outside the exact allowlist (extra keys = invalid). */
function assertExactKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Reflect.ownKeys(obj)) {
    if (typeof key !== "string" || !allowed.includes(key)) fail();
  }
}

const KINDS: readonly ChapterMediaKind[] = ["AUDIOBOOK", "PODCAST", "VIDEO"];
const STATUSES: readonly ChapterMediaStatus[] = ["DRAFT", "PUBLISHED"];
const POLICIES: readonly ChapterMediaAccessPolicy[] = [
  "PRO_ONLY",
  "BOOK_ENTITLEMENT",
];

/** BCP-47-ish, closed and short: `es`, `es-EC`. Nothing free-form. */
const LANGUAGE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

// ─── Reconstruction ──────────────────────────────────────────────────────────

function rebuildSource(value: unknown): ChapterMediaSource {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;

  switch (obj.kind) {
    case "CHAPTER_AUDIO":
      assertExactKeys(obj, ["kind"]);
      return { kind: "CHAPTER_AUDIO" };

    case "R2":
      assertExactKeys(obj, ["kind", "objectKey"]);
      return { kind: "R2", objectKey: requireObjectKey(obj.objectKey) };

    case "CLOUDFLARE_STREAM": {
      assertExactKeys(obj, ["kind", "videoUid", "captionLanguage"]);
      const videoUid = obj.videoUid;
      if (typeof videoUid !== "string" || !/^[a-z0-9]{16,64}$/.test(videoUid)) {
        fail();
      }
      const captionLanguage = obj.captionLanguage;
      if (
        typeof captionLanguage !== "string" ||
        !LANGUAGE_RE.test(captionLanguage)
      ) {
        fail();
      }
      return {
        kind: "CLOUDFLARE_STREAM",
        videoUid: videoUid as string,
        captionLanguage: captionLanguage as string,
      };
    }

    default:
      return fail();
  }
}

function rebuildChapterMark(value: unknown): ChapterMediaChapterMarkDefinition {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, ["startSec", "label"]);
  return {
    startSec: requireNonNegativeInt(obj.startSec),
    label: requireText(obj.label, 120),
  };
}

const DEFINITION_KEYS = [
  "mediaKey",
  "mediaVersion",
  "bookSlug",
  "chapterOrder",
  "kind",
  "status",
  "title",
  "description",
  "durationSec",
  "accessPolicy",
  "source",
  "posterObjectKey",
  "transcriptObjectKey",
  "chapters",
] as const;

/**
 * The runtime authority. Rejects anything the type system cannot see (an
 * `unknown` from a spec fixture, a hand-edited constant) and returns a DEEPLY
 * FROZEN definition without ever mutating its input.
 *
 * The two coupling rules that matter:
 *
 *   - `DRAFT` ⇒ `source === null` and `accessPolicy === null`. A draft that
 *     carries a provider reference would be one env flip away from serving an
 *     unreviewed master.
 *   - `PUBLISHED` ⇒ both present. A published item with no source is a player
 *     that cannot play.
 *
 * Plus: a `VIDEO` may only be Stream-backed, and a `CHAPTER_AUDIO` source only
 * makes sense for the audiobook — the one format that reuses the existing
 * chapter `Audio` row.
 */
export function validateChapterMediaDefinition(
  value: unknown,
): ChapterMediaDefinition {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, DEFINITION_KEYS);

  const kind = obj.kind;
  if (typeof kind !== "string" || !KINDS.includes(kind as ChapterMediaKind)) {
    fail();
  }
  const status = obj.status;
  if (
    typeof status !== "string" ||
    !STATUSES.includes(status as ChapterMediaStatus)
  ) {
    fail();
  }

  const rawPolicy = obj.accessPolicy;
  const accessPolicy: ChapterMediaAccessPolicy | null =
    rawPolicy === null
      ? null
      : typeof rawPolicy === "string" &&
          POLICIES.includes(rawPolicy as ChapterMediaAccessPolicy)
        ? (rawPolicy as ChapterMediaAccessPolicy)
        : fail();

  const source: ChapterMediaSource | null =
    obj.source === null ? null : rebuildSource(obj.source);

  if (status === "DRAFT" && (source !== null || accessPolicy !== null)) fail();
  if (status === "PUBLISHED" && (source === null || accessPolicy === null)) {
    fail();
  }

  if (kind === "VIDEO" && source && source.kind !== "CLOUDFLARE_STREAM") fail();
  if (kind !== "VIDEO" && source && source.kind === "CLOUDFLARE_STREAM") fail();
  if (source?.kind === "CHAPTER_AUDIO" && kind !== "AUDIOBOOK") fail();

  const rawChapters: unknown = obj.chapters;
  if (!Array.isArray(rawChapters)) fail();
  const chapters = (rawChapters as unknown[]).map(rebuildChapterMark);
  // Strictly increasing marks: two labels at the same second, or a rewind,
  // is an editorial mistake we would otherwise ship.
  chapters.forEach((mark, index) => {
    if (index > 0 && mark.startSec <= chapters[index - 1]!.startSec) fail();
  });

  const definition: ChapterMediaDefinition = {
    mediaKey: requireKey(obj.mediaKey),
    mediaVersion: requirePositiveInt(obj.mediaVersion),
    bookSlug: requireKey(obj.bookSlug),
    chapterOrder: requirePositiveInt(obj.chapterOrder),
    kind: kind as ChapterMediaKind,
    status: status as ChapterMediaStatus,
    title: requireText(obj.title, 160),
    description: requireText(obj.description, 400),
    durationSec: nullableNonNegativeInt(obj.durationSec),
    accessPolicy,
    source,
    posterObjectKey:
      obj.posterObjectKey === null
        ? null
        : requireObjectKey(obj.posterObjectKey),
    transcriptObjectKey:
      obj.transcriptObjectKey === null
        ? null
        : requireObjectKey(obj.transcriptObjectKey),
    chapters,
  };

  for (const mark of definition.chapters) Object.freeze(mark);
  Object.freeze(definition.chapters);
  if (definition.source) Object.freeze(definition.source);
  return Object.freeze(definition);
}

// ─── Registry ────────────────────────────────────────────────────────────────

export class ChapterMediaCatalogRegistry {
  private readonly byKey = new Map<string, ChapterMediaDefinition>();
  private readonly byChapter = new Map<string, ChapterMediaDefinition[]>();

  constructor(definitions: readonly unknown[]) {
    for (const raw of definitions) {
      const def = validateChapterMediaDefinition(raw);
      if (this.byKey.has(def.mediaKey)) {
        throw new ChapterMediaCatalogError(
          "CHAPTER_MEDIA_CATALOG_DUPLICATE_DEFINITION",
        );
      }
      this.byKey.set(def.mediaKey, def);
      const slot = `${def.bookSlug}#${def.chapterOrder}`;
      const list = this.byChapter.get(slot) ?? [];
      list.push(def);
      this.byChapter.set(slot, list);
    }
  }

  /**
   * EXACT lookup. `mediaKey` alone pins the version, because a new master is
   * published under a new key or a bumped `mediaVersion` in a reviewed diff —
   * there is no "latest" resolution and no fallback.
   */
  getExact(mediaKey: string): ChapterMediaDefinition {
    const def = this.byKey.get(mediaKey);
    if (!def) {
      throw new ChapterMediaCatalogError(
        "CHAPTER_MEDIA_CATALOG_UNKNOWN_DEFINITION",
      );
    }
    return def;
  }

  /** Null instead of throwing, for the manifest's "this chapter has nothing". */
  find(mediaKey: string): ChapterMediaDefinition | null {
    return this.byKey.get(mediaKey) ?? null;
  }

  /** Declaration order is presentation order: audiobook, podcast, video. */
  forChapter(
    bookSlug: string,
    chapterOrder: number,
  ): readonly ChapterMediaDefinition[] {
    return this.byChapter.get(`${bookSlug}#${chapterOrder}`) ?? [];
  }

  get size(): number {
    return this.byKey.size;
  }
}

// ─── Production definitions ──────────────────────────────────────────────────

/**
 * The audiobook of *Emociones en Construcción*, chapter 1.
 *
 * `source.kind = CHAPTER_AUDIO` on purpose: the chapter already has an `Audio`
 * row and a working R2 signing path (`LectorService.getAudio`). GR-2 reuses
 * both instead of introducing a second audio table.
 *
 * `PRO_ONLY` mirrors the policy chapter audio enforces today, so wiring the
 * media surface changes nobody's access.
 *
 * `durationSec: null` and no chapter marks: those are editorial data that
 * nobody has confirmed for this master yet, and inventing them would put a
 * fake timeline in front of a reader.
 */
export const EEC_C1_AUDIOBOOK = validateChapterMediaDefinition({
  mediaKey: "eec-c1-audiobook-v1",
  mediaVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  kind: "AUDIOBOOK",
  status: "PUBLISHED",
  title: "Audiolibro · capítulo 1",
  description:
    "Narración fiel del capítulo, para escucharlo tal como está escrito.",
  durationSec: null,
  accessPolicy: "PRO_ONLY",
  source: { kind: "CHAPTER_AUDIO" },
  posterObjectKey: null,
  transcriptObjectKey: null,
  chapters: [],
});

/**
 * The podcast — announced, not produced. §8 of the spec fixes the format
 * (`PODCAST_V1_FORMAT=JORGE_SOLO`); the master does not exist, so the
 * definition carries no source and the API says `COMING_SOON`.
 */
export const EEC_C1_PODCAST = validateChapterMediaDefinition({
  mediaKey: "eec-c1-podcast-v1",
  mediaVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  kind: "PODCAST",
  status: "DRAFT",
  title: "Podcast · capítulo 1",
  description:
    "Jorge explica el capítulo con un guion conversacional: una pregunta, un ejemplo cotidiano y qué hacer con eso.",
  durationSec: null,
  accessPolicy: null,
  source: null,
  posterObjectKey: null,
  transcriptObjectKey: null,
  chapters: [],
});

/**
 * The full video explainer — announced, not produced. Its editorial structure
 * is approved (spec §7) and lives in the chapter marks, because those are a
 * script decision rather than a provider fact. Everything provider-shaped
 * (`videoUid`, poster, captions) stays absent until the master exists.
 */
export const EEC_C1_VIDEO = validateChapterMediaDefinition({
  mediaKey: "eec-c1-video-v1",
  mediaVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  kind: "VIDEO",
  status: "DRAFT",
  title: "Videoexplicación · capítulo 1",
  description:
    "El capítulo explicado en video, con esquemas y pasajes del libro. Una alternativa al texto, no un adorno.",
  durationSec: null,
  accessPolicy: null,
  source: null,
  posterObjectKey: null,
  transcriptObjectKey: null,
  chapters: [
    { startSec: 0, label: "¿Qué ocurre antes de que pensemos?" },
    { startSec: 50, label: "El cuerpo inicia una respuesta" },
    { startSec: 130, label: "Nombrar no es lo mismo que reaccionar" },
    { startSec: 210, label: "Por qué no hay una única firma corporal" },
    { startSec: 300, label: "El papel del contexto y la experiencia" },
    { startSec: 390, label: "Qué observar en ti sin diagnosticarte" },
    { startSec: 450, label: "Idea de cierre" },
  ],
});

/**
 * The PRODUCTION registry — exactly the approved definitions, in presentation
 * order. Adding one is a deliberate, reviewed change: a real asset, an
 * editorial approval, and the ops steps in
 * docs/product/chapter-01-media-package.md §5.
 */
export const PRODUCTION_CHAPTER_MEDIA: readonly ChapterMediaDefinition[] = [
  EEC_C1_AUDIOBOOK,
  EEC_C1_PODCAST,
  EEC_C1_VIDEO,
];

export const productionChapterMediaRegistry = new ChapterMediaCatalogRegistry(
  PRODUCTION_CHAPTER_MEDIA,
);
