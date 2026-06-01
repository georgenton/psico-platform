import { IsString, MinLength, MaxLength } from "class-validator";

export class PasswordChangeDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt silently truncates at 72 bytes
  newPassword!: string;
}
