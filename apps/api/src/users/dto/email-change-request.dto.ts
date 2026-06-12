import { IsEmail } from "class-validator";

/**
 * Body for `POST /api/user/email-change-request` — request to change
 * the account email.
 *
 * Two-step flow (the second step is the email verification link):
 *
 *   1. POST this — server creates an `EmailChangeRequest` row + sends
 *      a confirmation link to `newEmail`. Service responds 409
 *      `EMAIL_ALREADY_REGISTERED` if the new email belongs to another
 *      account.
 *   2. User clicks the link in their inbox → consumed by a separate
 *      endpoint (`/user/email-change/:token`) → `User.email` updated.
 *
 * Until step 2 completes, the user can still log in with the old
 * email. The pending change is visible in profile settings.
 */
export class EmailChangeRequestDto {
  /**
   * Target email the user wants to switch to. Must be a valid RFC 5321
   * address and NOT already registered (409 `EMAIL_ALREADY_REGISTERED`
   * on conflict). Case is normalized server-side.
   */
  @IsEmail()
  newEmail!: string;
}
