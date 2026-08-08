import { BadRequestException } from "@nestjs/common";
import { randomBytes } from "crypto";

/**
 * What counts as an uploadable image, in one place.
 *
 * `/autor` had this inline and the CMS needed the same rules; two copies of a
 * MIME allow-list drift, and the half that drifts is the half that accepts
 * something it should not.
 *
 * SVG is deliberately absent. It is XML that can carry script and external
 * references, so it needs a sanitisation boundary this product does not have —
 * and an image format nobody has asked for is not worth that boundary.
 */

export const IMAGE_MIME_ALLOWED: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface UploadedImageFile {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Reject anything that is not an image we are willing to store.
 *
 * Checks the declared MIME type and the size, and nothing about the filename —
 * an extension is a claim by the uploader, not a fact about the bytes.
 */
export function assertUploadableImage(
  file: UploadedImageFile | undefined,
): asserts file is UploadedImageFile {
  if (!file) throw new BadRequestException({ code: "FILE_REQUIRED" });
  if (!IMAGE_MIME_ALLOWED.has(file.mimetype)) {
    throw new BadRequestException({
      code: "INVALID_IMAGE_TYPE",
      allowed: Array.from(IMAGE_MIME_ALLOWED),
      got: file.mimetype,
    });
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new BadRequestException({
      code: "FILE_TOO_LARGE",
      maxBytes: IMAGE_MAX_BYTES,
      got: file.size,
    });
  }
}

/** The extension we will store under, derived from the MIME we accepted. */
export function imageExtension(mimetype: string): string {
  return EXT_BY_MIME[mimetype] ?? "jpg";
}

/**
 * The object key, built entirely server-side.
 *
 * The uploader's filename never reaches the key. It is attacker-controlled text
 * that would otherwise decide where bytes land — path traversal, collisions
 * with somebody else's asset, or a name that leaks who uploaded what.
 */
export function imageObjectKey(prefix: string, mimetype: string): string {
  const random = randomBytes(8).toString("hex");
  return `${prefix}/${random}.${imageExtension(mimetype)}`;
}
