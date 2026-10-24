import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

import { IsNewPassword } from "../../shared/validators/is-new-password.validator";
import { Type } from "class-transformer";

/**
 * `POST /api/user/password-change-with-rekey` — atomic password change
 * with re-encrypted diary entries. Sprint seed-and-password-rekey.
 *
 * The client did the crypto work first; this body carries the result.
 * The shape of each ciphertext field follows ADR 0007 §A (base64url,
 * AEAD, fresh nonce) but the server does not re-validate the contents
 * because:
 *
 *   - we don't have the key → can't decrypt
 *   - bad ciphertext = the user pays with unreadable entries (their
 *     loss, not a security issue)
 *
 * What the server DOES validate: shape, length caps, ownership (in the
 * service: every entry ID must belong to the user). Bcrypt(currentPassword)
 * is verified before any write. On success, all active refresh tokens
 * are revoked.
 */

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
// Salt size on the wire (base64url, no padding).
//
// Auth produces 16-byte salts via Node's `randomBytes(16).toString("base64url")`
// which yields 22 chars unpadded. We accept 22–28 to also let clients
// generating slightly larger salts (e.g. 18-byte, 24 chars) pass — both
// are cryptographically equivalent above the 128-bit floor and the wire
// format is the same. Anything outside this range is a client bug.
//
// Pre-2026-06-17 this was Length(24, 28), which silently broke every real
// rekey in prod since auth always shipped 22-char salts. Sprint
// `fix-salt-length-dto` widened the lower bound.
const SALT_B64_MIN = 22;
const SALT_B64_MAX = 28;
const MAX_ENTRIES_PER_REKEY = 500;
const MAX_CIPHER_LEN = 1_400_000; // ~1MB plaintext + tag (matches diario DTO)
const NONCE_B64_LEN = 32; // 24-byte XChaCha20 nonce in base64url

/**
 * One diary entry re-encrypted under the new master key. The client
 * produced this by: derive new masterKey from newPassword + newCryptoSalt,
 * derive diary subkey, decrypt the old ciphertext, re-encrypt under the
 * new subkey with a fresh nonce.
 */
export class ReencryptedEntryDto {
  /**
   * Server ID of the existing `DiaryEntry`. Must belong to the
   * authenticated user — service enforces ownership and throws
   * 400 ENTRY_NOT_OWNED if any ID in the array doesn't match.
   */
  @IsString()
  @Length(1, 64)
  id!: string;

  /**
   * New XChaCha20-Poly1305 ciphertext of the entry body, base64url-encoded.
   * Replaces the entry's `textCiphertext` atomically inside the
   * transaction.
   */
  @IsString()
  @MaxLength(MAX_CIPHER_LEN)
  @Matches(BASE64URL)
  textCiphertext!: string;

  /**
   * Fresh 24-byte XChaCha20 nonce for `textCiphertext`. Must be a new
   * random value — reusing the old nonce under the new key would still
   * be fine cryptographically (different key) but loses the nonce-uniqueness
   * habit clients should keep.
   */
  @IsString()
  @Length(NONCE_B64_LEN, NONCE_B64_LEN + 4)
  @Matches(BASE64URL)
  textNonce!: string;

  /**
   * Optional re-encrypted preview ciphertext (used by the list view).
   * Required if the entry had an excerpt cipher before; the client
   * decides based on the existing entry.
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CIPHER_LEN)
  @Matches(BASE64URL)
  excerptCiphertext?: string;

  /**
   * Fresh nonce for `excerptCiphertext`. Required if `excerptCiphertext`
   * is provided.
   */
  @IsOptional()
  @IsString()
  @Length(NONCE_B64_LEN, NONCE_B64_LEN + 4)
  @Matches(BASE64URL)
  excerptNonce?: string;
}

/**
 * Body for `POST /api/user/password-change-with-rekey` — see file-level
 * doc for the threat model. The whole operation is one Prisma
 * transaction: bcrypt update + every entry UPDATE + refresh-token
 * revoke all happen together or not at all.
 */
export class PasswordChangeWithRekeyDto {
  /**
   * Current password (plaintext, used only to verify bcrypt match before
   * the rekey). Never logged. Not the same as `newPassword`.
   */
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  /**
   * The new password, checked against the shared policy in `@psico/types`
   * (`password-policy`) — the one source API, web and mobile all read.
   *
   * The byte ceiling matters more here than anywhere else. This single
   * password feeds two things with different limits: bcrypt, which ignores
   * everything past 72 bytes, and client-side Argon2id, which has no such
   * cap. A longer password would derive the diary key from the whole string
   * while the login hash saw only its prefix — two different truths about
   * one secret, and a diary its own password cannot open. Rejecting is the
   * only exit that leaves nobody locked out.
   *
   * This field used to allow 10–256 characters: the 10 disagreed with
   * register's 8, and the 256 waved through passwords bcrypt truncates.
   */
  @IsString()
  @IsNewPassword()
  newPassword!: string;

  /**
   * Fresh 16-byte (or up to 21-byte) Argon2id salt the client generated
   * for the new master key, base64url-encoded (22–28 chars). Distinct
   * from the old salt — the client throws away the old master key entirely
   * and starts over.
   */
  @IsString()
  @Length(SALT_B64_MIN, SALT_B64_MAX)
  @Matches(BASE64URL)
  newCryptoSalt!: string;

  /**
   * Every active diary entry re-encrypted with the new diary subkey
   * (HKDF from the new master key). Cap of 500 entries per request to
   * keep the transaction bounded; if the user has more, the UI chunks
   * across multiple requests.
   */
  @IsArray()
  @ArrayMaxSize(MAX_ENTRIES_PER_REKEY)
  @ValidateNested({ each: true })
  @Type(() => ReencryptedEntryDto)
  reencryptedEntries!: ReencryptedEntryDto[];
}
