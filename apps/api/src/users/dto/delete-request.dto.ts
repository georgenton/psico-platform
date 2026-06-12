import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Body for `POST /api/user/delete-request` — request permanent account
 * deletion.
 *
 * NOT instant: the service writes `User.deleteRequestedAt`, enqueues a
 * BullMQ `account-deletion` job with `delay: 30d`, and emails a
 * confirmation. The worker re-validates `deleteRequestedAt` + elapsed
 * cooldown before executing the hard `prisma.user.delete()` cascade
 * (Sprint S3).
 *
 * If the user logs back in within the 30-day window, they can cancel
 * via `Profile.deleteRequestedAt = null` (UI calls a separate endpoint).
 * OAuth users (no `passwordHash`) get 400 `OAUTH_USER_NO_PASSWORD`.
 */
export class DeleteRequestDto {
  /**
   * Current password — required to confirm intent. The 30-day cooldown
   * + email confirmation is the second factor. Verified against
   * bcrypt; never logged.
   */
  @IsString()
  password!: string;

  /**
   * Optional reason for leaving (up to 500 chars). Captured for
   * retention analytics. Not surfaced anywhere user-facing.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
