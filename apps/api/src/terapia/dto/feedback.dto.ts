import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

/**
 * Body for `POST /api/terapia/sessions/:id/feedback` — Sprint S65.
 *
 * Post-session feedback from the client about a therapy session.
 *
 * Privacy split (ADR 0007 §A):
 * - `rating` + `tags` are plaintext, analytics-safe categorical fields.
 *   Therapy module surfaces them for the therapist; Pulso uses them for
 *   aggregate quality reports.
 * - `noteCiphertext` + `noteNonce` are E2E-encrypted. Free-form
 *   reflection meant for the user's eyes only (and optionally shared
 *   with the therapist via the dedicated share endpoint). Pairing
 *   enforced in service: sending one without the other returns 400.
 *
 * Only the session owner can call. The session must be `COMPLETED` or
 * `IN_PROGRESS`. Feedback is single-write — re-submission overwrites.
 */
export class SessionFeedbackDto {
  /**
   * 1–5 star rating of the session. Public to the therapist for
   * reflection + Pulso aggregates. 1 = worst, 5 = best.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  /**
   * Up to 8 categorical tags (e.g. `"util"`, `"empatico"`,
   * `"poca-conexion"`) from a curated picker on the post-session
   * screen. Plaintext — same analytics-safe contract as Diary tags.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  tags?: string[];

  /**
   * XChaCha20-Poly1305 ciphertext of the user's free-form note,
   * base64url-encoded. Encrypted client-side under the therapy subkey
   * derived from the master key (ADR 0007 §A). Server never decrypts.
   * Required if `noteNonce` is provided.
   */
  @IsOptional()
  @IsString()
  @Length(0, 8192)
  noteCiphertext?: string;

  /**
   * 24-byte XChaCha20 nonce paired with `noteCiphertext`,
   * base64url-encoded. Required if `noteCiphertext` is provided.
   * Server enforces pairing → 400 `CIPHER_NONCE_PAIRING` on
   * mismatch.
   */
  @IsOptional()
  @IsString()
  @Length(0, 64)
  noteNonce?: string;
}
