import { IsBoolean, IsOptional, Matches } from "class-validator";

/**
 * Body for `PATCH /api/user/notifications` — toggle notification
 * preferences. All fields optional; only sent fields are updated.
 *
 * Settings are split across two transports: `dailyReminder` /
 * `streakReminders` gate push (mobile + web), `weeklyReport` /
 * `terapiaReminders` gate email (Resend). The user-local hour for
 * digests is decided by `reminderTime` + `Profile.timezone`
 * (Sprint S53).
 */
export class UpdateNotificationsDto {
  /**
   * If `true`, the inactive-nudge processor may push a daily reminder at
   * `reminderTime` local. Also gates the weekly-digest push companion
   * (the email itself is governed by `weeklyReport`).
   */
  @IsOptional()
  @IsBoolean()
  dailyReminder?: boolean;

  /**
   * Local hour for daily/weekly notifications, format `HH:MM` 24h
   * (e.g. `"07:00"`, `"19:30"`). Interpreted in the user's
   * `Profile.timezone` (Sprint S53); legacy users without a timezone
   * fall back to UTC.
   */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "reminderTime must be in HH:MM 24h format",
  })
  reminderTime?: string;

  /**
   * Push notifications celebrating streak milestones (3-day, 7-day,
   * 30-day, etc). Separate from `dailyReminder` so users can keep the
   * habit nudge but mute the celebrations.
   */
  @IsOptional()
  @IsBoolean()
  streakReminders?: boolean;

  /**
   * Push notifications when Eco posts a reply (e.g. async LLM finishes
   * a long generation). v1 SSE streams to the live tab, so this only
   * fires for closed-app + Live Activities flows.
   */
  @IsOptional()
  @IsBoolean()
  ecoReplies?: boolean;

  /**
   * Push + email reminders for upcoming therapy sessions (24h, 1h before
   * the slot). Only firing while the user has at least one SCHEDULED
   * session.
   */
  @IsOptional()
  @IsBoolean()
  terapiaReminders?: boolean;

  /**
   * Monday-morning email digest summarising the prior week (entries
   * count, mood distribution, top tags, optional LLM-backed narrative
   * if available). Push companion to the digest is gated by
   * `dailyReminder` — the email itself flips with this flag alone.
   */
  @IsOptional()
  @IsBoolean()
  weeklyReport?: boolean;
}
