import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ChangeRoleDto {
  @IsString()
  @IsIn(["USER", "AUTHOR", "PSYCHOLOGIST", "ADMIN"])
  role!: "USER" | "AUTHOR" | "PSYCHOLOGIST" | "ADMIN";

  /** Optional reason captured for audit. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
