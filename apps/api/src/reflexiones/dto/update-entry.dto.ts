import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from "class-validator";
import { CLIENT_SELECTION_VERSIONS, DIARY_MOOD_IDS } from "@psico/types";
import type { ClientMoodSelectionVersion, DiaryMoodId } from "@psico/types";
import { IsBase64UrlCipher, IsBase64UrlNonce } from "./ciphertext-validators";

/**
 * Body for `PATCH /api/diario/entries/:id` — update an existing
 * encrypted diary entry. All fields optional; only sent fields are
 * touched.
 *
 * When editing the body, BOTH `textCiphertext` AND `textNonce` must be
 * sent together — a fresh nonce per write is mandatory under XChaCha20
 * to avoid nonce reuse under the same key. The server enforces the
 * pairing (`CIPHER_NONCE_PAIRING` 400). The same rule applies to
 * `excerptCiphertext` / `excerptNonce`.
 *
 * Same privacy contract as `CreateDiaryEntryDto` (ADR 0007 §A):
 * the server never decrypts; it only validates shape and bounds.
 */
export class UpdateDiaryEntryDto {
  /**
   * New mood token from the shared `DIARY_MOODS` catalog. Server uses
   * it for the patterns analytics — visible in plaintext by design.
   * Plugin emits the enum in OpenAPI from `@IsIn`.
   *
   * PR-2B · null-capable, three-way. The service distinguishes the cases via
   * `hasOwnProperty`, so the validator must let both `null` and a canonical
   * string through while still rejecting garbage:
   *   - **absent** (property omitted) → leave the mood untouched.
   *   - **`null`** → clear the mood (`not_selected`, ineligible).
   *   - **canonical string** → set it (eligible only with `explicit-v1`).
   *   - empty / legacy / unknown token → 400.
   * `@ValidateIf(value !== undefined && value !== null)` skips validation for
   * the absent and null cases (both legitimate) and enforces `@IsIn` on any
   * present value.
   */
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsIn(DIARY_MOOD_IDS)
  mood?: DiaryMoodId | null;

  /**
   * PR-2B · client attestation that the new `mood` was an EXPLICIT pick. Only
   * `explicit-v1` (`CLIENT_SELECTION_VERSIONS`) is accepted from a client; the
   * server-owned attestations are stamped elsewhere. Sending it without a
   * `mood`, or alongside `mood: null`, is a 400 (`MOOD_SELECTION_WITHOUT_MOOD`).
   * Re-saving the SAME canonical mood WITHOUT this attestation never degrades an
   * already-eligible row (the service preserves the existing normalization).
   */
  @IsOptional()
  @IsIn(CLIENT_SELECTION_VERSIONS)
  moodSelectionVersion?: ClientMoodSelectionVersion;

  /**
   * New XChaCha20-Poly1305 ciphertext of the entry body, base64url-encoded.
   * Encrypted client-side under the diary subkey derived via HKDF from
   * the master key. Server never decrypts.
   *
   * If sent, `textNonce` MUST also be sent (paired write).
   */
  @IsOptional()
  @IsBase64UrlCipher()
  textCiphertext?: string;

  /**
   * Fresh 24-byte XChaCha20 nonce paired with `textCiphertext`,
   * base64url-encoded. Must be a new random nonce — reusing the previous
   * nonce under the same key catastrophically breaks confidentiality
   * (XChaCha20 invariant).
   *
   * If sent, `textCiphertext` MUST also be sent.
   */
  @IsOptional()
  @IsBase64UrlNonce()
  textNonce?: string;

  /**
   * New preview ciphertext for the list view. Same pairing rules as
   * `textCiphertext`/`textNonce` — sending one requires sending the other.
   */
  @IsOptional()
  @IsBase64UrlCipher()
  excerptCiphertext?: string;

  /**
   * Fresh 24-byte XChaCha20 nonce paired with `excerptCiphertext`. Required
   * if `excerptCiphertext` is sent.
   */
  @IsOptional()
  @IsBase64UrlNonce()
  excerptNonce?: string;

  /**
   * Replacement tag set (up to 12, each 1–32 chars). Plaintext by
   * design — used by the patterns module to cluster entries for the
   * weekly summary. The UI nudges users to categorical labels (e.g.
   * `trabajo` / `familia` / `sueño`) and explicitly NOT to put private
   * info here.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @Length(1, 32, { each: true })
  tags?: string[];
}
