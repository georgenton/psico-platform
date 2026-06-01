import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";

export class UpdateReaderPreferencesDto {
  @IsOptional()
  @IsIn(["serif", "sans"])
  font?: "serif" | "sans";

  @IsOptional()
  @IsInt()
  @Min(12)
  @Max(28)
  fontSize?: number;

  @IsOptional()
  @IsIn(["system", "light", "sepia", "dark"])
  theme?: "system" | "light" | "sepia" | "dark";

  @IsOptional()
  @IsNumber()
  @Min(1.0)
  @Max(2.5)
  lineHeight?: number;
}
