import {
  IsBase64,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Max chars accepted in `textPlaintext`. ~2000 chars ≈ 500 tokens — well
 * under the LLM context budget and aligned with the design's "respuestas
 * cortas" voice. Hard-cap to prevent abuse (paying tokens for someone who
 * dumps a book chapter).
 */
const MAX_PLAINTEXT_LEN = 2000;

/**
 * Max base64url length for ciphertext + nonce. The plaintext cap above
 * means ciphertext is at most ~2730 chars (b64 expansion ~1.36× + AEAD
 * overhead). We cap at 4096 to leave room for unicode multi-byte.
 */
const MAX_CIPHER_B64_LEN = 4096;
const NONCE_B64_LEN = 32; // 24 raw bytes → 32 base64url chars

/**
 * Body for `POST /api/eco/messages` — send a user message to an Eco
 * thread. Throttled to 30 / min / user.
 *
 * **Hybrid encryption (ADR 0007 §C):** the client sends BOTH plaintext
 * AND ciphertext+nonce in the same request. The server uses the
 * plaintext in-flight (LLM call + layer-1 crisis detection) and
 * persists ONLY the ciphertext. The plaintext is never written to disk,
 * never logged, never returned in any response. Privacy spec
 * (`eco.privacy.spec.ts`) enforces no `logger.*` / `console.*` references
 * the plaintext field.
 *
 * Past USER turns the server reads back are encrypted under the same
 * thread key — only the current turn's plaintext is available to the
 * LLM; assistant past turns are LLM output (plaintext-at-rest by design).
 */
/**
 * Fase H — reading context for a reader-dock conversation. Scopes the RAG
 * retrieval to the book and anchors the prompt in the chapter theme; the
 * server also offers the chapter's concept as a confirmable resonance.
 */
export class EcoScopeDto {
  @IsString()
  @Length(1, 120)
  bookSlug!: string;

  @IsInt()
  @Min(1)
  chapterOrder!: number;
}

export class SendEcoMessageDto {
  /**
   * Server-side ID of the thread the message belongs to. The user must
   * own the thread or the service returns 404 (we do not 403 — would
   * leak existence). Max length 128 to allow opaque IDs.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  threadId!: string;

  /**
   * Ephemeral plaintext of the user's message. Server uses it for the
   * LLM prompt + layer-1 crisis regex detection, then drops it. NEVER
   * persists, NEVER logs, NEVER returns in any response. The privacy
   * spec enforces this at CI time.
   *
   * Hard cap 2000 chars (~500 tokens) to control LLM cost and stay
   * under the design's "respuestas cortas" voice.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PLAINTEXT_LEN)
  textPlaintext!: string;

  /**
   * XChaCha20-Poly1305 ciphertext of the same message, base64url-encoded.
   * Encrypted client-side under the eco subkey (HKDF from master key
   * with `ECO_KEY_INFO`). Server persists as-is, decrypts never.
   *
   * For replays / history reads, this is what the client decrypts
   * locally to render the message bubble.
   */
  @IsString()
  @IsBase64({ urlSafe: true })
  @MaxLength(MAX_CIPHER_B64_LEN)
  textCiphertext!: string;

  /**
   * Fresh 24-byte XChaCha20 nonce paired with `textCiphertext`,
   * base64url-encoded (32 chars exactly). Must be a new random nonce on
   * every send — reuse under the same key breaks confidentiality.
   */
  @IsString()
  @IsBase64({ urlSafe: true })
  @MaxLength(NONCE_B64_LEN)
  textNonce!: string;

  /**
   * Optional intent hint. `"suggest"` nudges Eco to recommend a book or
   * exercise instead of free-form chat. v1 routes both through the same
   * LLM call with the intent injected into the system prompt — explicit
   * dispatch can come later if recommendation tuning needs it.
   */
  @IsOptional()
  @IsEnum(["free", "suggest"])
  intent?: "free" | "suggest";

  /** Fase H — optional reading context (reader dock/sheet handoff). */
  @IsOptional()
  @ValidateNested()
  @Type(() => EcoScopeDto)
  scope?: EcoScopeDto;
}
