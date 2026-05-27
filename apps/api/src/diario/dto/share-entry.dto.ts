import { IsISO8601, IsOptional, IsString, Length } from "class-validator";
import { IsBase64UrlBlob, IsBase64UrlCipher } from "./ciphertext-validators";

/**
 * POST /diario/entries/:id/share body.
 *
 * The client did the re-encrypt on its side (ADR 0007 §E):
 *   1. Decrypted the entry locally with the diaryKey.
 *   2. Derived a shared secret via ECDH X25519(userPriv, therapistPub).
 *   3. Encrypted the plaintext with an ephemeralKey (XChaCha20-Poly1305).
 *   4. Wrapped the ephemeralKey with the shared secret.
 *
 * The server stores the four blobs and the expiry. The server cannot read
 * the entry. Therapist reads via /api/terapia/shared-entries/:id (v2).
 */
export class ShareDiaryEntryDto {
  @IsString()
  @Length(1, 64)
  therapistId!: string;

  @IsBase64UrlCipher()
  ciphertextForTherapist!: string;

  // wrappedKey is short (≤ a few hundred bytes) — separate cap so a wrong
  // payload here doesn't bypass the body ciphertext check.
  @IsBase64UrlBlob(1024)
  wrappedKey!: string;

  // X25519 public key, base64url. 32 bytes → 43 chars unpadded.
  @IsBase64UrlBlob(64)
  userOneShotPubKey!: string;

  /** Optional shorter expiry. Server caps at 30 days; default 7. */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
