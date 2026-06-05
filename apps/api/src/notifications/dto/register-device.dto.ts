import { IsIn, IsOptional, IsString, Length, Matches } from "class-validator";

/**
 * Body for POST /api/notifications/devices — Sprint S43 + S47.
 *
 * Validation:
 * - `platform` is "EXPO" (mobile · S43) or "WEB" (browser · S47).
 * - `token` shape depends on platform:
 *   - EXPO: `ExponentPushToken[xxx]` or `ExpoPushToken[xxx]` (~30 chars).
 *   - WEB: `web:<JSON-of-PushSubscription>` (~400–1200 chars). The JSON
 *     payload after `web:` is the serialized
 *     [PushSubscription.toJSON()](https://developer.mozilla.org/docs/Web/API/PushSubscription/toJSON)
 *     with `endpoint`, `keys.p256dh`, `keys.auth`.
 *
 * We don't strictly schema-validate the WEB JSON here — `PushService`
 * parses it at send time and skips malformed tokens with status="error".
 * That keeps the controller lean and the validation localized.
 */
export class RegisterDeviceDto {
  @IsIn(["EXPO", "WEB"])
  platform!: "EXPO" | "WEB";

  @IsString()
  // S47: bumped from 256 to 2048 to fit serialized Web Push subscriptions
  // (endpoint URLs alone can be 400+ chars; full JSON ≤ ~1200 chars).
  @Length(8, 2048)
  @Matches(/^(ExponentPushToken\[|ExpoPushToken\[|web:).+/, {
    message: "token must look like an Expo push token or 'web:...' prefix",
  })
  token!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  deviceLabel?: string;
}
