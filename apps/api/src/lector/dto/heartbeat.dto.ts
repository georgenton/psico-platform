import { IsInt, IsNumber, IsString, Length, Max, Min } from "class-validator";

/**
 * Heartbeat fired every ~5 s by the reader while the user is scrolling.
 * Heavy clamping at the service level — these numbers come from a browser
 * tab that could be paused, throttled, or maliciously massaged. We accept
 * the payload, then sanitize.
 */
export class LectorSessionHeartbeatDto {
  @IsString()
  @Length(1, 64)
  bookId!: string;

  @IsInt()
  @Min(1)
  @Max(999)
  chapterOrder!: number;

  @IsString()
  @Length(1, 64)
  lastBlockId!: string;

  /**
   * Seconds since the previous heartbeat. Cap at 60 at the service layer:
   * a tab that wakes from suspend should not credit hours of "reading".
   */
  @IsInt()
  @Min(0)
  @Max(3600)
  timeSpentDeltaSec!: number;

  /** 0–1 ratio. Server clamps and never lets it decrease. */
  @IsNumber()
  @Min(0)
  @Max(1)
  progressPct!: number;
}
