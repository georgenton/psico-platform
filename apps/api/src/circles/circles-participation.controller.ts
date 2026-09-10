import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type {
  CircleActivityView,
  CircleActor,
  CircleShareConfirmation,
} from "@psico/types";
import { JwtAuthGuard } from "../auth";
import { CirclesGuestGuard } from "./circles-guest.guard";
import { CirclesRolloutGuard } from "./circles-rollout.guard";
import { CurrentCircleActor } from "./current-circle-actor.decorator";
import { circlesException, mapCirclesErrors } from "./circles-http-errors";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesParticipationFacade } from "./circles-participation.facade";
import {
  ConfirmArtifactDto,
  ConfirmEditedSummaryDto,
  ConfirmKeepPrivateDto,
  ConfirmSelectedFieldsDto,
  CreateDuoDto,
  ProposeArtifactDto,
  RecordFollowUpDto,
} from "./dto/participation.dto";

/**
 * The participation surface (PR3), as two thin controllers over one facade.
 *
 * ── Why two controllers and not one with a branch ──────────────────────────
 *
 * A member arrives with a JWT; a guest arrives with an opaque session header.
 * Those are different guards, and a single controller would need a conditional
 * guard — which is a place where "which one ran" becomes a runtime question
 * instead of a routing one. Two controllers make the guard a property of the
 * route: `JwtAuthGuard` cannot be skipped on the member surface, and
 * `CirclesGuestGuard` cannot be skipped on the guest one.
 *
 * Both build a `CircleActor` server-side and call the SAME services. There is
 * no guest-flavoured domain logic anywhere; the only difference between the two
 * paths is how the actor was proven, which is exactly the difference that
 * should exist.
 *
 * ── The rollout gate is on every route ─────────────────────────────────────
 *
 * Under `off` — the default, and production's state — every route below answers
 * `503 CIRCLES_UNAVAILABLE` before a body is validated, a secret is hashed or
 * anything is encrypted.
 */

/** Commands are cheap to replay and expensive to abuse. */
const COMMAND_THROTTLE = { default: { limit: 30, ttl: 15 * 60_000 } };
/** Creating a Dúo mints a secret; it gets the tighter limit. */
const CREATE_THROTTLE = { default: { limit: 10, ttl: 60 * 60_000 } };

/** Responses that carry shared content must not sit in any cache. */
function noStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
}

/** The header every command requires, canonical UUID or nothing. */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireIdempotencyKey(raw: string | undefined): string {
  if (typeof raw !== "string" || !UUID_V4.test(raw)) {
    throw circlesException("CIRCLE_INVALID_PAYLOAD");
  }
  return raw.toLowerCase();
}

/**
 * The confirmation body, narrowed to the closed union.
 *
 * The pipe has already validated ONE of the three DTOs; this is what turns the
 * validated object into the domain's type without a cast that could let a
 * fourth shape through.
 */
function asConfirmation(
  dto:
    | ConfirmSelectedFieldsDto
    | ConfirmEditedSummaryDto
    | ConfirmKeepPrivateDto,
): CircleShareConfirmation {
  if (dto.mode === "SELECTED_FIELDS") {
    return { mode: "SELECTED_FIELDS", fields: dto.fields };
  }
  if (dto.mode === "EDITED_SUMMARY") {
    return { mode: "EDITED_SUMMARY", summary: dto.summary };
  }
  return { mode: "KEEP_PRIVATE" };
}

// ─── The authenticated surface ───────────────────────────────────────────────

@ApiTags("circles")
@Controller("circles")
@UseGuards(JwtAuthGuard, CirclesRolloutGuard)
export class CirclesMemberParticipationController {
  constructor(private readonly facade: CirclesParticipationFacade) {}

  @Post("duo")
  @HttpCode(201)
  @Throttle(CREATE_THROTTLE)
  @ApiOperation({ summary: "Create a Dúo and its first activity" })
  @ApiResponse({ status: 201, description: "Created, or replayed unchanged." })
  @ApiResponse({ status: 422, description: "CIRCLE_TEMPLATE_UNAVAILABLE." })
  @ApiResponse({ status: 409, description: "CIRCLE_IDEMPOTENCY_CONFLICT." })
  createDuo(
    @CurrentCircleActor() actor: CircleActor,
    @Body() dto: CreateDuoDto,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ circleId: string; activityId: string }> {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.createDuo(actor, dto, idempotencyKey),
    );
  }

  @Get("activities/:activityId")
  @ApiOperation({ summary: "The activity, filtered for this actor" })
  activity(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CircleActivityView> {
    noStore(res);
    return mapCirclesErrors(() => this.facade.read(actor, activityId));
  }

  @Post("activities/:activityId/share-confirmations")
  @HttpCode(201)
  @Throttle(COMMAND_THROTTLE)
  @ApiOperation({ summary: "Confirm what you share; may trigger the reveal" })
  confirmShare(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Body()
    dto:
      | ConfirmSelectedFieldsDto
      | ConfirmEditedSummaryDto
      | ConfirmKeepPrivateDto,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.confirmShare(
        actor,
        activityId,
        asConfirmation(dto),
        idempotencyKey,
      ),
    );
  }

  @Post("activities/:activityId/withdraw")
  @HttpCode(200)
  @Throttle(COMMAND_THROTTLE)
  @ApiOperation({ summary: "Leave. No reason is accepted." })
  withdraw(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.withdraw(actor, activityId, idempotencyKey),
    );
  }

  @Put("activities/:activityId/artifact")
  @HttpCode(200)
  @Throttle(COMMAND_THROTTLE)
  @ApiOperation({ summary: "Propose or edit the shared result" })
  proposeArtifact(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Body() dto: ProposeArtifactDto,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.proposeArtifact(actor, activityId, dto.body, idempotencyKey),
    );
  }

  @Post("activities/:activityId/artifact/confirm")
  @HttpCode(200)
  @Throttle(COMMAND_THROTTLE)
  @ApiOperation({ summary: "Confirm an exact artifact and version" })
  confirmArtifact(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Body() dto: ConfirmArtifactDto,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.confirmArtifact(
        actor,
        activityId,
        dto.artifactId,
        dto.version,
        idempotencyKey,
      ),
    );
  }

  @Post("activities/:activityId/follow-up")
  @HttpCode(200)
  @Throttle(COMMAND_THROTTLE)
  @ApiOperation({ summary: "Record KEEP | ADJUST | CLOSE" })
  followUp(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Body() dto: RecordFollowUpDto,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.recordFollowUp(
        actor,
        activityId,
        dto.decision,
        idempotencyKey,
      ),
    );
  }
}

// ─── The guest surface ───────────────────────────────────────────────────────

/**
 * The same commands, for someone without an account.
 *
 * Every route is scoped to the activity the guest's session names. There is no
 * `POST /guest/duo`: creating a circle is an authenticated act, and a guest has
 * no circle to create one in.
 */
@ApiTags("circles")
@Controller("circles/guest")
@UseGuards(CirclesGuestGuard)
export class CirclesGuestParticipationController {
  constructor(private readonly facade: CirclesParticipationFacade) {}

  @Get("activities/:activityId")
  @ApiOperation({ summary: "The activity, filtered for this guest" })
  activity(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CircleActivityView> {
    noStore(res);
    return mapCirclesErrors(() => this.facade.read(actor, activityId));
  }

  @Post("activities/:activityId/share-confirmations")
  @HttpCode(201)
  @Throttle(COMMAND_THROTTLE)
  @ApiOperation({ summary: "Confirm what you share; may trigger the reveal" })
  confirmShare(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Body()
    dto:
      | ConfirmSelectedFieldsDto
      | ConfirmEditedSummaryDto
      | ConfirmKeepPrivateDto,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.confirmShare(
        actor,
        activityId,
        asConfirmation(dto),
        idempotencyKey,
      ),
    );
  }

  @Post("activities/:activityId/withdraw")
  @HttpCode(200)
  @Throttle(COMMAND_THROTTLE)
  @ApiOperation({ summary: "Leave. No reason is accepted." })
  withdraw(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.withdraw(actor, activityId, idempotencyKey),
    );
  }

  @Put("activities/:activityId/artifact")
  @HttpCode(200)
  @Throttle(COMMAND_THROTTLE)
  @ApiOperation({ summary: "Propose or edit the shared result" })
  proposeArtifact(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Body() dto: ProposeArtifactDto,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.proposeArtifact(actor, activityId, dto.body, idempotencyKey),
    );
  }

  @Post("activities/:activityId/artifact/confirm")
  @HttpCode(200)
  @Throttle(COMMAND_THROTTLE)
  @ApiOperation({ summary: "Confirm an exact artifact and version" })
  confirmArtifact(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Body() dto: ConfirmArtifactDto,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.confirmArtifact(
        actor,
        activityId,
        dto.artifactId,
        dto.version,
        idempotencyKey,
      ),
    );
  }

  @Post("activities/:activityId/follow-up")
  @HttpCode(200)
  @Throttle(COMMAND_THROTTLE)
  @ApiOperation({ summary: "Record KEEP | ADJUST | CLOSE" })
  followUp(
    @CurrentCircleActor() actor: CircleActor,
    @Param("activityId") activityId: string,
    @Body() dto: RecordFollowUpDto,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    const idempotencyKey = requireIdempotencyKey(key);
    return mapCirclesErrors(() =>
      this.facade.recordFollowUp(
        actor,
        activityId,
        dto.decision,
        idempotencyKey,
      ),
    );
  }
}
