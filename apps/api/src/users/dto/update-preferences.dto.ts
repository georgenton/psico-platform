import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(["marina", "tomas", "none"])
  voicePreference?: "marina" | "tomas" | "none";

  @IsOptional()
  @IsBoolean()
  moodPrompts?: boolean;

  @IsOptional()
  @IsIn(["morning", "noon", "evening", "any"])
  bestTime?: "morning" | "noon" | "evening" | "any";

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  weeklyGoalMinutes?: number;

  @IsOptional()
  @IsIn(["system", "light", "dark"])
  theme?: "system" | "light" | "dark";

  @IsOptional()
  @IsIn(["es-419", "es-ES"])
  language?: "es-419" | "es-ES";
}
