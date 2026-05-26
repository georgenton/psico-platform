import { IsIn } from "class-validator";

// Restricted whitelist — keeps the back agnostic about UI tokens but prevents free-form abuse.
export const ALLOWED_MOODS = [
  "great",
  "good",
  "calm",
  "neutral",
  "tired",
  "anxious",
  "sad",
  "angry",
] as const;

export type AllowedMood = (typeof ALLOWED_MOODS)[number];

export class UpdateMoodDto {
  @IsIn(ALLOWED_MOODS as unknown as string[])
  mood!: AllowedMood;
}
