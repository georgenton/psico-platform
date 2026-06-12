import { IsInt, IsNumber, IsString, Length, Max, Min } from "class-validator";

/**
 * Body for `PATCH /api/lector/session` — heartbeat fired every ~5 s by
 * the reader while the user is actively scrolling.
 *
 * Heavy clamping at the service level: these numbers come from a browser
 * tab that could be paused, throttled, or maliciously massaged. The
 * service accepts the payload, then sanitizes:
 *
 *   - `progressPct` is monotonic — never lets it decrease for the same session
 *   - `timeSpentDeltaSec` is capped at 60 — a tab waking from suspend
 *     should not credit hours of "reading"
 *
 * One row per `(userId, chapterId)` upserted by these heartbeats.
 */
export class LectorSessionHeartbeatDto {
  /**
   * ID of the `Book` the reading session belongs to. The service
   * resolves the `chapterId` from `(bookId, chapterOrder)` for the
   * upsert; an unknown pair returns 404.
   */
  @IsString()
  @Length(1, 64)
  bookId!: string;

  /**
   * Ordinal of the chapter being read (1-indexed). Combined with
   * `bookId` to identify the active chapter.
   */
  @IsInt()
  @Min(1)
  @Max(999)
  chapterOrder!: number;

  /**
   * ID of the last `ChapterBlock` the user has scrolled past. Used to
   * resume the session on next open (UI scrolls back to this block).
   */
  @IsString()
  @Length(1, 64)
  lastBlockId!: string;

  /**
   * Seconds since the previous heartbeat. Cap at 3600 in validation;
   * service further clamps to 60 to defend against suspend-and-resume
   * spikes. The cumulative `timeSpentSec` on the row grows monotonically.
   */
  @IsInt()
  @Min(0)
  @Max(3600)
  timeSpentDeltaSec!: number;

  /**
   * 0.0–1.0 ratio of how far the user has scrolled through the chapter.
   * Server clamps to [0, 1] and never lets the stored value decrease —
   * once 0.78 has been observed, the next heartbeat with 0.42 is silently
   * ignored (likely a UI bug / refresh / scroll-back). Use `complete`
   * endpoint to set 1.0 explicitly.
   */
  @IsNumber()
  @Min(0)
  @Max(1)
  progressPct!: number;
}
