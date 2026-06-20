import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from "class-validator";

/**
 * Cryptographic input validators (Sprint S6 · ADR 0007).
 *
 * The DTOs that touch encrypted material MUST validate shape and bounded
 * size. We do NOT log the payload; the validators throw on shape errors and
 * the global filter returns a sanitized VALIDATION_ERROR envelope.
 *
 * Why custom validators (instead of @IsString + @Length):
 *  - We want a single source of truth for "what is a base64url string" and
 *    "what is a 24-byte nonce" so adding another encrypted field later is
 *    one decorator, not a new pair of regex + length.
 *  - The size cap on ciphertext (1 MB) lives here so the DTO declaration
 *    reads as `@IsBase64UrlCipher()` — intent first, magic numbers later.
 */

const BASE64URL_REGEX = /^[A-Za-z0-9_-]+={0,2}$/;

/** Max base64url length for a 1 MB plaintext + XChaCha20-Poly1305 tag. */
const MAX_CIPHERTEXT_B64 = 1_400_000;

/** XChaCha20-Poly1305 nonce = 24 bytes; base64url with no padding = 32 chars. */
const NONCE_B64_LENGTH = 32;

function isBase64Url(value: unknown, maxLen: number): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;
  if (value.length > maxLen) return false;
  return BASE64URL_REGEX.test(value);
}

/** Body or excerpt ciphertext: base64url, ≤ ~1.4 MB. */
export function IsBase64UrlCipher(opts?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: "isBase64UrlCipher",
      target: target.constructor,
      propertyName,
      options: opts,
      validator: {
        validate: (value: unknown) => isBase64Url(value, MAX_CIPHERTEXT_B64),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be a base64url ciphertext under 1 MB`,
      },
    });
  };
}

/** XChaCha20-Poly1305 nonce: base64url, exactly 24 bytes (32 chars unpadded). */
export function IsBase64UrlNonce(opts?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: "isBase64UrlNonce",
      target: target.constructor,
      propertyName,
      options: opts,
      validator: {
        validate: (value: unknown) =>
          isBase64Url(value, NONCE_B64_LENGTH + 4) &&
          (value as string).replace(/=+$/, "").length === NONCE_B64_LENGTH,
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be a base64url-encoded 24-byte nonce`,
      },
    });
  };
}

/** Generic base64url field (e.g. X25519 pubkey, wrapped ephemeral key). */
export function IsBase64UrlBlob(maxLen: number, opts?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: "isBase64UrlBlob",
      target: target.constructor,
      propertyName,
      options: opts,
      validator: {
        validate: (value: unknown) => isBase64Url(value, maxLen),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be a base64url string under ${maxLen} chars`,
      },
    });
  };
}
