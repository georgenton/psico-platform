import { IsEmail } from "class-validator";

/**
 * Body for `POST /api/user/email-change-request`.
 *
 * Withdrawn: every valid body is answered 503 `EMAIL_CHANGE_UNAVAILABLE`,
 * before any row is created or any email queued. The second step this used to
 * describe — consuming the link and updating `User.email` — was never built:
 * no endpoint and no page exist for it. See
 * `docs/product/tarea-cambio-de-correo.md`.
 */
export class EmailChangeRequestDto {
  /**
   * Target address. Validated as an email and not used: the operation is
   * withdrawn and the answer does not depend on it.
   */
  @IsEmail()
  newEmail!: string;
}
