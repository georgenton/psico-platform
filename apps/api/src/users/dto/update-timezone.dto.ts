import { IsString, MaxLength, MinLength } from "class-validator";

/**
 * Sprint S53 — Auto-detected by the client from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` and PATCHed once
 * after login if `Profile.timezone === null`.
 *
 * IANA validation lives in the service (via Intl.DateTimeFormat
 * constructor probe) rather than here — class-validator can't enforce
 * the IANA list without a 4 KB+ wordlist dep.
 */
export class UpdateTimezoneDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone!: string;
}
