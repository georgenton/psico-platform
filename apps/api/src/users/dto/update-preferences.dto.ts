import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { AMBIENT_IDS } from "@psico/types";
import type { AmbientId } from "@psico/types";

/**
 * Body for `PATCH /api/user/preferences` — update behavioural prefs
 * stored in `UserPreferences`. All fields optional; only sent fields are
 * touched.
 *
 * Different from `UpdateProfileDto` (display fields) and
 * `UpdateNotificationsDto` (transport toggles) — these drive product
 * behaviour: recommendation, goals, UI theme.
 */
export class UpdatePreferencesDto {
  /**
   * Preferred narrator voice for audio chapters. Mirrors the
   * onboarding step 3 choice. Plugin emits the enum in OpenAPI.
   */
  @IsOptional()
  @IsIn(["marina", "tomas", "none"])
  voicePreference?: "marina" | "tomas" | "none";

  /**
   * Whether the home screen should prompt for a mood ping in the
   * morning if not already pinged today. Disable for users who find
   * the nudges noisy.
   */
  @IsOptional()
  @IsBoolean()
  moodPrompts?: boolean;

  /**
   * The time of day the user prefers to engage. Drives the inactive-nudge
   * scheduler + future smart-reminder timing. `"any"` opts out of the
   * heuristic.
   */
  @IsOptional()
  @IsIn(["morning", "noon", "evening", "any"])
  bestTime?: "morning" | "noon" | "evening" | "any";

  /**
   * Self-set weekly reading goal in minutes (0–10080 = max 1 week). The
   * patterns module surfaces progress against this in the weekly
   * summary email. 0 = no goal set; UI hides the progress bar.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  weeklyGoalMinutes?: number;

  /**
   * UI theme preference. `"system"` follows OS dark-mode setting (web
   * + mobile); `"light"`/`"dark"` force the corresponding palette.
   * Client renders the change instantly.
   */
  @IsOptional()
  @IsIn(["system", "light", "dark"])
  theme?: "system" | "light" | "dark";

  /**
   * UI language. v1 only has Spanish flavours: `"es-419"` (LATAM,
   * neutral / Ecuadorian) and `"es-ES"` (peninsular). User input
   * normalized to the Ecuadorian "tú" register either way — this just
   * picks copy tweaks.
   */
  @IsOptional()
  @IsIn(["es-419", "es-ES"])
  language?: "es-419" | "es-ES";

  /**
   * Ambient theme (Sprint B1). Re-skins the dashboard with a different
   * palette + typography. All ambients are free regardless of plan — purely
   * cosmetic, no functional gating.
   */
  @IsOptional()
  @IsIn(AMBIENT_IDS as readonly string[])
  ambient?: AmbientId;
}
