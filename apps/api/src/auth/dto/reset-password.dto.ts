import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  /** Raw token from the email link. Server hashes before lookup. */
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{32,128}$/, {
    message: "Invalid token format",
  })
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt silently truncates at 72 bytes
  newPassword!: string;
}
