import { IsISO8601, IsOptional, IsString, Length } from "class-validator";
import { IsBase64UrlBlob, IsBase64UrlCipher } from "./ciphertext-validators";

/**
 * Body for `POST /api/diario/entries/:id/share` — share a diary entry
 * with a therapist using an ephemeral one-shot key (ADR 0007 §E).
 *
 * The crypto work happens client-side BEFORE this call:
 *
 *   1. Decrypt the entry locally with the user's diary key.
 *   2. Derive a shared secret via ECDH X25519(userPriv, therapistPub).
 *   3. Encrypt the plaintext with a fresh ephemeralKey (XChaCha20-Poly1305).
 *   4. Wrap the ephemeralKey with the shared secret.
 *
 * The server stores the four blobs and the expiry — it cannot read the
 * entry. The therapist later reads via `/api/terapia/shared-entries/:id`
 * (v2) which retrieves these same blobs; the therapist's app derives
 * the shared secret with their private key + this `userOneShotPubKey`,
 * unwraps the ephemeralKey, then decrypts. Each share generates a NEW
 * one-shot keypair — no reuse, no key compromise propagation.
 */
export class ShareDiaryEntryDto {
  /**
   * Stable ID of the therapist the entry is being shared with. The
   * therapist must already be in the user's verified therapist list
   * (v2 — surface lives in TherapyModule).
   */
  @IsString()
  @Length(1, 64)
  therapistId!: string;

  /**
   * XChaCha20-Poly1305 ciphertext of the plaintext entry, encrypted with
   * the ephemeralKey. base64url-encoded. Same bounds as Diary
   * ciphertext (`~1.4 MB` max).
   */
  @IsBase64UrlCipher()
  ciphertextForTherapist!: string;

  /**
   * The ephemeralKey wrapped with the shared secret from
   * `ECDH(userPriv, therapistPub)`. Short blob (≤ 1 KB) — separate cap
   * from `ciphertextForTherapist` so a malformed payload here can't
   * bypass the body ciphertext size check.
   */
  @IsBase64UrlBlob(1024)
  wrappedKey!: string;

  /**
   * X25519 public key the client generated SPECIFICALLY for this share.
   * 32 raw bytes → 43 base64url chars unpadded. Burned after this share
   * — the therapist's app reads it to derive the shared secret, and the
   * user's app discards the matching private key.
   */
  @IsBase64UrlBlob(64)
  userOneShotPubKey!: string;

  /**
   * Optional explicit expiry (ISO-8601). Server caps at 30 days from
   * now; default is 7 days when omitted. After expiry the share row is
   * tombstoned by the sweeper job (v2) — the therapist can no longer
   * read.
   */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
