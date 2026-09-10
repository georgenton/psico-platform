import { ApiProperty } from "@nestjs/swagger";
import { Equals, IsString, Length } from "class-validator";
import { MAX_PRESENTED_SECRET_LENGTH } from "../circles-secrets";

/**
 * The two request bodies of the Círculos guest surface (PR2 · spec §E/§F).
 *
 * What is NOT here is the point. There is no `userId`, no `participantId`, no
 * `activityId`, no `circleId` and no role — not optional, not ignored: absent.
 * The global pipe runs `whitelist` + `forbidNonWhitelisted`, so a body carrying
 * one is rejected before a handler sees it, and `circles-scope.spec.ts` pins
 * that no DTO in this module ever declares such a field. The actor is built
 * server-side from a verified JWT or a database row (ADR 0023 §2.3).
 *
 * The length bound is deliberately loose. A tight one would turn "your value is
 * the wrong shape for a code" into a distinguishable answer, and that is a
 * confirmation an attacker can use; a value inside the bound that does not
 * exist gets exactly the same response as one that expired.
 */
export class InspectInvitationDto {
  @ApiProperty({
    description:
      "The invitation link token, or the short code, exactly as received. " +
      "Never stored; hashed on arrival.",
    maxLength: MAX_PRESENTED_SECRET_LENGTH,
  })
  @IsString()
  @Length(1, MAX_PRESENTED_SECRET_LENGTH)
  secret!: string;
}

export class AcceptInvitationDto extends InspectInvitationDto {
  /**
   * Acceptance is a separate, explicit act.
   *
   * Opening a link, prefetching it or inspecting it must not spend it, so
   * consuming the invitation requires this literal `true`. A body without it
   * cannot consume an invitation even by reaching this route: the field is
   * required and pinned to one value, so there is no default that could be
   * read as consent.
   */
  @ApiProperty({
    description:
      "Must be literally true. Explicit acceptance, distinct from opening " +
      "or inspecting the invitation.",
    enum: [true],
  })
  @Equals(true)
  accept!: true;
}
