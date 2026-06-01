import {
  IsBase64,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

/** Max chars accepted in `textPlaintext`. ~2000 chars ≈ 500 tokens — well
 * under the LLM context budget and aligned with the design's "respuestas
 * cortas" voice. Hard-cap to prevent abuse (paying tokens for someone who
 * dumps a book chapter). */
const MAX_PLAINTEXT_LEN = 2000;

/** Max base64url length for ciphertext + nonce. The plaintext cap above
 * means ciphertext is at most ~2730 chars (b64 expansion ~1.36x + AEAD
 * overhead). We cap at 4096 to leave room for unicode multi-byte. */
const MAX_CIPHER_B64_LEN = 4096;
const NONCE_B64_LEN = 32; // 24 raw bytes → 32 base64url chars

export class SendEcoMessageDto {
  /**
   * Server-side identifier of the thread. The user must own the thread or
   * the service returns 404 — we do not 403 (would leak existence).
   */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  threadId!: string;

  /**
   * Ephemeral plaintext. The server uses it for the LLM call + layer-1
   * crisis detection, and NEVER persists it. The privacy spec enforces no
   * logger.* / console.* statement may reference this field.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PLAINTEXT_LEN)
  textPlaintext!: string;

  /** base64url cipher. Persisted as-is. */
  @IsString()
  @IsBase64({ urlSafe: true })
  @MaxLength(MAX_CIPHER_B64_LEN)
  textCiphertext!: string;

  /** base64url 24-byte nonce. */
  @IsString()
  @IsBase64({ urlSafe: true })
  @MaxLength(NONCE_B64_LEN)
  textNonce!: string;

  /**
   * Optional intent hint. `suggest` asks Eco to recommend a book or
   * exercise instead of free-form chat. v1 routes both through the same
   * LLM call with intent included in the prompt — explicit dispatch can
   * come later if recommendation tuning needs it.
   */
  @IsOptional()
  @IsEnum(["free", "suggest"])
  intent?: "free" | "suggest";
}
