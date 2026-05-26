import { IsString, MinLength } from "class-validator";

export class OAuthGoogleDto {
  /**
   * Google ID token (JWT) obtained from Google Identity Services in the
   * browser or from Google Sign-In SDK on mobile. The backend verifies the
   * signature against Google's public keys via google-auth-library.
   *
   * Typical length: ~1000-1500 characters.
   */
  @IsString()
  @MinLength(64)
  idToken!: string;
}
