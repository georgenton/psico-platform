import { IsEmail } from "class-validator";

/**
 * Body of `POST /api/auth/resend-verification`.
 *
 * Deliberately the same shape as `ForgotPasswordDto`: an address and nothing
 * else. The endpoint is unauthenticated on purpose — the person who needs it
 * is looking at a dead verification link, which is exactly the moment they
 * may not have a session.
 */
export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}
