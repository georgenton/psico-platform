import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class ListUsersQueryDto {
  /** Substring match on email or name (case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  /** Filter by exact role. */
  @IsOptional()
  @IsString()
  @IsIn(["USER", "AUTHOR", "PSYCHOLOGIST", "ADMIN"])
  role?: "USER" | "AUTHOR" | "PSYCHOLOGIST" | "ADMIN";

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  limit?: number;
}
