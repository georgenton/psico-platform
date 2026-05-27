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
import { Type } from "class-transformer";

/**
 * POST /api/user/password-change-with-rekey body — Sprint seed-and-password-rekey.
 *
 * The client did the cripto work first; this body carries the result. The
 * shape of each ciphertext field follows ADR 0007 §A (base64url, AEAD, etc.)
 * but we don't re-validate the contents because:
 *   - we don't have the key → can't decrypt
 *   - bad ciphertext = the user pays with unreadable entries (their loss)
 *
 * What we DO validate: shape, length caps, ownership (in the service).
 */

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const NEW_PASSWORD_MIN = 10;
const NEW_PASSWORD_MAX = 256;
const SALT_B64_LEN = 24; // 16 bytes b64url unpadded
const MAX_ENTRIES_PER_REKEY = 500;
const MAX_CIPHER_LEN = 1_400_000; // ~1MB plaintext + tag (matches diario DTO)
const NONCE_B64_LEN = 32; // 24-byte XChaCha20 nonce in base64url

export class ReencryptedEntryDto {
  @IsString()
  @Length(1, 64)
  id!: string;

  @IsString()
  @MaxLength(MAX_CIPHER_LEN)
  @Matches(BASE64URL)
  textCiphertext!: string;

  @IsString()
  @Length(NONCE_B64_LEN, NONCE_B64_LEN + 4)
  @Matches(BASE64URL)
  textNonce!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CIPHER_LEN)
  @Matches(BASE64URL)
  excerptCiphertext?: string;

  @IsOptional()
  @IsString()
  @Length(NONCE_B64_LEN, NONCE_B64_LEN + 4)
  @Matches(BASE64URL)
  excerptNonce?: string;
}

export class PasswordChangeWithRekeyDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(NEW_PASSWORD_MIN)
  @MaxLength(NEW_PASSWORD_MAX)
  newPassword!: string;

  /** Fresh Argon2id salt the client generated for the new master key. */
  @IsString()
  @Length(SALT_B64_LEN, SALT_B64_LEN + 4)
  @Matches(BASE64URL)
  newCryptoSalt!: string;

  /** Every active diary entry re-encrypted with the new key. */
  @IsArray()
  @ArrayMaxSize(MAX_ENTRIES_PER_REKEY)
  @ValidateNested({ each: true })
  @Type(() => ReencryptedEntryDto)
  reencryptedEntries!: ReencryptedEntryDto[];
}
