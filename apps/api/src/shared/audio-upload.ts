import { BadRequestException } from "@nestjs/common";
import { randomBytes } from "crypto";

/**
 * What counts as an uploadable audio master.
 *
 * The limits are the ones `/autor` already established for chapter audio, not
 * the image ones: 50 MB, and the formats the existing players actually handle.
 * Copying the 5 MB image ceiling here would reject almost every real audiobook.
 *
 * No transcoding. If a file is not already in a format the product plays, the
 * answer is to re-export it, not to build a conversion pipeline.
 */

/**
 * Narrowed from `/autor`'s eight to the four the web `<audio>` element and
 * `expo-av` both decode reliably. `wav` is uncompressed and would blow through
 * the size limit for anything chapter-length; `ogg` has no Safari support,
 * which is most of this product's iOS audience.
 */
export const AUDIO_MIME_ALLOWED: ReadonlySet<string> = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
]);

/** The existing `/autor` product limit. Deliberately not the image limit. */
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Multer aborts at OR ABOVE `fileSize`, so the transport limit sits one byte
 * above the rule. Without the `+ 1` a file of exactly 50 MB is refused by the
 * transport while the service and the UI copy both accept it — the same
 * off-by-one the image path hit.
 */
export const AUDIO_TRANSPORT_LIMIT = AUDIO_MAX_BYTES + 1;

const EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
};

export interface UploadedAudioFile {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Reject anything that is not audio we are willing to store. */
export function assertUploadableAudio(
  file: UploadedAudioFile | undefined,
): asserts file is UploadedAudioFile {
  if (!file) throw new BadRequestException({ code: "FILE_REQUIRED" });
  if (!AUDIO_MIME_ALLOWED.has(file.mimetype)) {
    throw new BadRequestException({
      code: "INVALID_AUDIO_TYPE",
      allowed: Array.from(AUDIO_MIME_ALLOWED),
      got: file.mimetype,
    });
  }
  // An empty file passes a MIME check and produces a player that spins forever.
  if (file.size === 0 || file.buffer.length === 0) {
    throw new BadRequestException({ code: "FILE_EMPTY" });
  }
  if (file.size > AUDIO_MAX_BYTES) {
    throw new BadRequestException({
      code: "FILE_TOO_LARGE",
      maxBytes: AUDIO_MAX_BYTES,
      got: file.size,
    });
  }
}

export function audioExtension(mimetype: string): string {
  return EXT_BY_MIME[mimetype] ?? "m4a";
}

/**
 * The object key, minted entirely server-side.
 *
 * Follows the catalog's existing convention — `media/<bookSlug>/c<order>/…` —
 * with a random leaf so a new master can never overwrite the bytes an older
 * media version still points at. The uploader's filename never appears: it is
 * attacker-controlled text that would otherwise decide where bytes land.
 */
export function audioObjectKey(
  bookSlug: string,
  chapterOrder: number,
  kind: "audiobook" | "podcast",
  mimetype: string,
): string {
  const random = randomBytes(8).toString("hex");
  return `media/${bookSlug}/c${chapterOrder}/${kind}/${random}.${audioExtension(mimetype)}`;
}
