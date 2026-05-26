import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import type { Env } from "../../config";

/**
 * Verified payload from a Google ID token. We only expose the fields the
 * AuthService needs — `sub` (provider user id), `email`, `email_verified`
 * (Google's own verification status), `name`, `picture`.
 */
export interface VerifiedGoogleIdToken {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/**
 * Verifies Google ID tokens server-side.
 *
 * Why this exists instead of using passport-google-oauth20:
 *   - Modern SPAs and mobile apps use Google Identity Services / Sign-In SDK
 *     to obtain an ID token client-side. They then POST it to the backend
 *     for verification.
 *   - The Passport "redirect" flow requires us to maintain callback URLs in
 *     Google Console for every environment (dev, staging, prod). The ID
 *     token flow needs only the clientId.
 *   - The flow matches the design exactly: `POST /api/auth/oauth/:provider`.
 *
 * Verification does:
 *   1. Check the JWT signature against Google's public keys (cached).
 *   2. Validate the `aud` claim matches our GOOGLE_CLIENT_ID.
 *   3. Validate the `iss` claim is "accounts.google.com" or
 *      "https://accounts.google.com".
 *   4. Reject expired tokens.
 *
 * Any failure → `UnauthorizedException` with a generic message. We do NOT
 * leak the specific reason to the client (could help phishing).
 *
 * See ADR 0009 for the architectural decision.
 */
@Injectable()
export class GoogleVerifier {
  private readonly logger = new Logger(GoogleVerifier.name);
  private readonly client: OAuth2Client | null;
  private readonly clientId: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get("GOOGLE_CLIENT_ID", { infer: true });

    if (this.clientId) {
      this.client = new OAuth2Client(this.clientId);
      this.logger.log(
        `Google OAuth ready (clientId=${this.clientId.slice(0, 12)}…)`,
      );
    } else {
      this.client = null;
      this.logger.warn(
        "GOOGLE_CLIENT_ID not set — POST /api/auth/oauth/google will return 503.",
      );
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async verify(idToken: string): Promise<VerifiedGoogleIdToken> {
    if (!this.client || !this.clientId) {
      // Defensive: controller should have gated on isEnabled() already.
      throw new UnauthorizedException("Google sign-in is not configured");
    }

    let ticket;
    try {
      ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
    } catch (err) {
      this.logger.warn(
        `Google ID token verification failed: ${(err as Error).message}`,
      );
      throw new UnauthorizedException("Invalid Google credential");
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      throw new UnauthorizedException("Invalid Google credential");
    }

    // Reject tokens where Google itself hasn't verified the email — those
    // can be created by anyone with the email + an SMTP server.
    if (payload.email_verified === false) {
      throw new UnauthorizedException(
        "Your Google email is not verified yet. Verify it in Google before signing in.",
      );
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified ?? false,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  }
}
