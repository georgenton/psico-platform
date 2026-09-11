import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { CIRCLE_FOLLOW_UP_DECISIONS, CIRCLE_SHARE_LIMITS } from "@psico/types";

/**
 * 256 bits, base64url, unpadded — exactly 43 characters from the URL-safe
 * alphabet. Anchored at both ends so a longer string with a valid prefix is
 * not a match.
 */
export const BASE64URL_256 = /^[A-Za-z0-9_-]{43}$/;

/**
 * The participation request bodies (PR3).
 *
 * What is NOT here is the point, and `circles-scope.spec.ts` pins it: no
 * `userId`, no `participantId`, no `circleId`, no `memberId`, no role and no
 * `contentUnitId`. The global pipe runs `whitelist` + `forbidNonWhitelisted`,
 * so a body carrying one is rejected before a handler sees it — and even if it
 * were not, nothing reads it. The actor is built server-side from a verified
 * JWT or from a guest-session row.
 *
 * The confirmation is a CLOSED discriminated union, split into one class per
 * mode. `class-validator` cannot express "these fields only when mode is X" on
 * a single class without a custom validator, and a custom validator is a place
 * for a mistake to hide; three classes and a discriminator make the invalid
 * combinations unrepresentable instead.
 *
 * `WITHDRAW` is deliberately absent as a mode. Leaving is not a kind of
 * sharing: it has its own route, its own semantics, and a database constraint
 * that refuses to store it as a `sharingMode`.
 */

export class SelectedFieldDto {
  @ApiProperty({ description: "A field key the template declares." })
  @IsString()
  @Length(1, 128)
  fieldKey!: string;

  @ApiProperty({ description: "The text the person previewed and confirmed." })
  @IsString()
  @Length(1, CIRCLE_SHARE_LIMITS.maxFieldLength)
  value!: string;
}

export class ConfirmSelectedFieldsDto {
  @ApiProperty({ enum: ["SELECTED_FIELDS"] })
  @Equals("SELECTED_FIELDS")
  mode!: "SELECTED_FIELDS";

  @ApiProperty({ type: [SelectedFieldDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CIRCLE_SHARE_LIMITS.maxFields)
  @ValidateNested({ each: true })
  @Type(() => SelectedFieldDto)
  fields!: SelectedFieldDto[];
}

export class ConfirmEditedSummaryDto {
  @ApiProperty({ enum: ["EDITED_SUMMARY"] })
  @Equals("EDITED_SUMMARY")
  mode!: "EDITED_SUMMARY";

  @ApiProperty({ maxLength: CIRCLE_SHARE_LIMITS.maxSummaryLength })
  @IsString()
  @Length(1, CIRCLE_SHARE_LIMITS.maxSummaryLength)
  summary!: string;
}

export class ConfirmKeepPrivateDto {
  /**
   * The whole body. There is nowhere to put a reason, which is the design:
   * "I am not sharing this" is an answer, and answers do not owe explanations.
   */
  @ApiProperty({ enum: ["KEEP_PRIVATE"] })
  @Equals("KEEP_PRIVATE")
  mode!: "KEEP_PRIVATE";
}

export class ProposeArtifactDto {
  @ApiProperty({ description: "The shared result, as the pair agreed it." })
  @IsString()
  @Length(1, CIRCLE_SHARE_LIMITS.maxSummaryLength)
  body!: string;
}

export class ConfirmArtifactDto {
  @ApiProperty({ description: "The exact artifact being confirmed." })
  @IsString()
  @Length(1, 64)
  artifactId!: string;

  /**
   * The version, required and checked.
   *
   * Not a hint: a client holding stale copy must not be able to agree to text
   * it never saw. Confirming a version that is no longer the live one is
   * refused rather than helpfully redirected to the current version.
   */
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class RecordFollowUpDto {
  @ApiProperty({ enum: CIRCLE_FOLLOW_UP_DECISIONS })
  @IsIn([...CIRCLE_FOLLOW_UP_DECISIONS])
  decision!: "KEEP" | "ADJUST" | "CLOSE";
}

export class CreateDuoDto {
  @ApiProperty({ description: "Template key. Must resolve to PUBLISHED." })
  @IsString()
  @Length(1, 128)
  templateKey!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  templateVersion!: number;

  /**
   * 256 bits of caller-supplied entropy, base64url.
   *
   * The caller mints it because the server cannot hand a secret back twice: a
   * replay must return the same resource, and there is no stored copy of the
   * token to return — only its hash. Having the caller supply it makes replay
   * and conflict distinguishable without ever persisting anything recoverable.
   *
   * PR4 replaces this caller with the BFF. Until then the request is
   * same-origin and sensitive: it is hashed on arrival and never reaches a
   * logger, an error, an event, a metric or a test snapshot.
   */
  @ApiProperty({
    description:
      "43-character base64url token, 256 bits. Hashed on arrival; never stored raw.",
    pattern: BASE64URL_256.source,
    minLength: 43,
    maxLength: 43,
  })
  @IsString()
  // `@Length(43, 43)` alone proved only that the string is 43 characters —
  // 43 spaces satisfied it. Length is a consequence of the encoding, not the
  // property worth checking: what makes this 256 bits is that all 43
  // characters are base64url. The alphabet is the assertion; the length falls
  // out of it, and is kept as a bound so the pattern cannot be widened by
  // accident.
  @Matches(BASE64URL_256)
  invitationToken!: string;
}

/**
 * Every command carries one. Canonical UUID, rejected otherwise — a key the
 * server normalises is a key two clients can collide on by accident.
 */
export class IdempotencyKeyHeaderDto {
  @IsUUID(4)
  idempotencyKey!: string;
}
