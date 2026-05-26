import { IsBoolean, IsOptional, Matches } from "class-validator";

export class UpdateNotificationsDto {
  @IsOptional()
  @IsBoolean()
  dailyReminder?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "reminderTime must be in HH:MM 24h format",
  })
  reminderTime?: string;

  @IsOptional()
  @IsBoolean()
  streakReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  ecoReplies?: boolean;

  @IsOptional()
  @IsBoolean()
  terapiaReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  weeklyReport?: boolean;
}
