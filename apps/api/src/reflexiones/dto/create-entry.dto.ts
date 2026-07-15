import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from "class-validator";
import { DIARY_MOOD_IDS } from "@psico/types";
import type { DiaryMoodId } from "@psico/types";
import { IsBase64UrlCipher, IsBase64UrlNonce } from "./ciphertext-validators";

const KINDS = ["free", "prompted", "voz"] as const;

/**
 * Body for `POST /api/diario/entries` — create a new encrypted diary
 * entry.
 *
 * The server validates shape, bounds, and the categorical metadata
 * (`mood` / `tags` / `kind`). It NEVER inspects the contents of
 * `textCiphertext` — Diary entries are E2E-encrypted (ADR 0007 §A) and
 * decrypt only on the user's device under the master key derived from
 * their password.
 *
 * `audioUrl` is plaintext because design `07-voz.md` commits to discarding
 * the voice transcript once extracted — only the file URL travels.
 */
export class CreateDiaryEntryDto {
  /**
   * Mood token from the shared `DIARY_MOODS` catalog (great / good / ok /
   * low / hard). Plaintext by design (patterns analytics). Server derives the
   * normalization columns; the client controls neither provenance nor
   * eligibility.
   *
   * PR-2A · **optional**: a new composer may save a reflexion without a mood
   * pick. When omitted the entry is stored with `mood = null` (no eligible
   * observation is created). The plugin auto-emits the enum in OpenAPI.
   */
  @IsOptional()
  @IsIn(DIARY_MOOD_IDS)
  mood?: DiaryMoodId;

  /**
   * Origin of the entry. `"free"` for user-initiated, `"prompted"` for a
   * journal-prompt response, `"voz"` for a voice-to-text dictation.
   * Default `"free"` if omitted.
   */
  @IsOptional()
  @IsIn(KINDS)
  kind?: (typeof KINDS)[number];

  /**
   * The `DiaryPrompt.id` the user is responding to, when `kind="prompted"`.
   * Up to 64 chars to allow opaque server-side identifiers.
   */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  promptId?: string;

  /**
   * The XChaCha20-Poly1305 ciphertext of the entry body, base64url-encoded.
   * Encrypted client-side under a per-user subkey derived via HKDF from
   * the master key. Server never decrypts. Bounded at ~1.4 MB ciphertext
   * (≈1 MB plaintext) — anything bigger is a UI bug.
   */
  @IsBase64UrlCipher()
  textCiphertext!: string;

  /**
   * The 24-byte XChaCha20 nonce that pairs with `textCiphertext`,
   * base64url-encoded. Must be unique per (key, write) — the client
   * generates a fresh random nonce on every encryption (server doesn't
   * enforce uniqueness; the client invariant is documented in ADR 0007 §C).
   */
  @IsBase64UrlNonce()
  textNonce!: string;

  /**
   * Optional preview ciphertext, used by the list view to render a short
   * snippet without decrypting the full body. Bounded the same way as
   * `textCiphertext`. Short entries may omit it.
   */
  @IsOptional()
  @IsBase64UrlCipher()
  excerptCiphertext?: string;

  /**
   * The 24-byte XChaCha20 nonce for `excerptCiphertext`. Required IF
   * `excerptCiphertext` is provided.
   */
  @IsOptional()
  @IsBase64UrlNonce()
  excerptNonce?: string;

  /**
   * Up to 12 plain-text tags (each 1–32 chars). Plaintext by design — the
   * patterns module clusters by tag for the weekly summary. Users should
   * NOT include private info in tags (the UI nudges them toward
   * categorical labels like `trabajo` / `familia` / `sueño`).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @Length(1, 32, { each: true })
  tags?: string[];

  /**
   * R2 signed URL for an attached voice recording. The audio itself is
   * NOT stored long-term — the Voice module discards it post-transcription
   * (07-voz.md). Persisted in the entry for replay during the active
   * session only.
   */
  @IsOptional()
  @IsUrl()
  audioUrl?: string;

  /** Duration in seconds of the attached voice recording, when present. */
  @IsOptional()
  @IsInt()
  @Min(0)
  audioDurationSec?: number;
}
