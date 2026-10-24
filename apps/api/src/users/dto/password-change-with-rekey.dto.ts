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
// El mínimo y el tope viven en `@psico/types` (`password-policy`), que es la
// única fuente para API, web y móvil. Aquí había 10 y 256: el 10 discrepaba
// del 8 del registro, y el 256 dejaba pasar contraseñas que bcrypt trunca a
// 72 BYTES sin avisar — justo en el flujo que recifra el diario.
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
   * La contraseña nueva, contra la política compartida.
   *
   * Aquí el tope en bytes importa más que en ningún otro sitio. La misma
   * contraseña alimenta dos cosas con límites distintos: bcrypt, que ignora
   * lo que pase de 72 bytes, y Argon2id en el cliente, que no tiene ese
   * tope. Con una contraseña más larga, la clave del diario se derivaría de
   * la cadena entera mientras el hash de acceso sólo vería su prefijo — dos
   * verdades distintas sobre el mismo secreto. Rechazar es la única salida
   * que no deja a nadie con un diario que su propia contraseña no abre.
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
