import { IsIn, IsOptional, IsString, Length, Matches } from "class-validator";

/**
 * Body for POST /api/notifications/devices — Sprint S43.
 *
 * Validation:
 * - `platform` is "EXPO" today; "WEB" is reserved for web push when we add
 *   it (post-v1 — design says VAPID via web-push library).
 * - `token` must match the Expo push token format
 *   `ExponentPushToken[xxx]` or `ExpoPushToken[xxx]`. We don't try to be
 *   stricter than that — the Expo push API itself rejects malformed tokens.
 */
export class RegisterDeviceDto {
  @IsIn(["EXPO", "WEB"])
  platform!: "EXPO" | "WEB";

  @IsString()
  @Length(8, 256)
  @Matches(/^(ExponentPushToken\[|ExpoPushToken\[|web:).+/, {
    message: "token must look like an Expo push token or 'web:...' prefix",
  })
  token!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  deviceLabel?: string;
}
