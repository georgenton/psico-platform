import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { CircleActor } from "@psico/types";
import { JwtAuthGuard } from "../auth";
import { CirclesGuestGuard } from "./circles-guest.guard";
import { CirclesGuestSurfaceGuard } from "./circles-guest-surface.guard";
import { CirclesRolloutGuard } from "./circles-rollout.guard";
import { CurrentCircleActor } from "./current-circle-actor.decorator";
import { circlesException, mapCirclesErrors } from "./circles-http-errors";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesService } from "./circles.service";
import {
  AcceptInvitationDto,
  InspectInvitationDto,
} from "./dto/invitation.dto";
import type { CircleInvitationPreview } from "@psico/types";

/**
 * The Círculos HTTP surface as of PR2.
 *
 * Three routes, and all three are inert in production: `CIRCLES_ROLLOUT_MODE`
 * defaults to `off`, under which every one of them answers
 * `503 CIRCLES_UNAVAILABLE` before validating a body or hashing a secret.
 *
 * There is deliberately no route to create a circle, create an activity, mint
 * an invitation, confirm a share or read anybody's content. Those are PR3's.
 * What ships here is the access spine — the part that decides WHO is asking —
 * so it can be attacked and tested before anything exists worth reaching.
 *
 * Both invitation routes carry the same rate limit. Giving `inspect` a looser
 * one would make it the cheaper oracle and quietly undo the limit on `accept`.
 */
const INVITATION_THROTTLE = { default: { limit: 10, ttl: 15 * 60_000 } };

@ApiTags("circles")
@Controller("circles")
export class CirclesController {
  constructor(private readonly circles: CirclesService) {}

  /**
   * The authenticated probe. Its only job is to answer whether Círculos is on
   * for THIS actor, which is the same question the rollout guard already
   * answered by letting the request through — so the body is a constant and
   * the information is entirely in the status code.
   */
  @Get("access")
  @UseGuards(JwtAuthGuard, CirclesRolloutGuard)
  @ApiOperation({ summary: "Whether Círculos is enabled for the caller" })
  @ApiResponse({ status: 200, description: "Enabled." })
  @ApiResponse({ status: 503, description: "CIRCLES_UNAVAILABLE." })
  access(): { available: true } {
    return { available: true };
  }

  /**
   * Check a link or code WITHOUT spending it.
   *
   * Opening a link is not accepting an invitation: a browser prefetch, a link
   * scanner in a messaging app, or a second tap must all leave the invitation
   * exactly as they found it.
   */
  @Post("invitations/inspect")
  @HttpCode(200)
  @UseGuards(CirclesGuestSurfaceGuard)
  @Throttle(INVITATION_THROTTLE)
  @ApiOperation({ summary: "Check an invitation without consuming it" })
  @ApiResponse({
    status: 200,
    description:
      "Usable. `preview` carries the minimum needed to decide — who invites, " +
      "what it is, how long — or is null when this build cannot describe the " +
      "invitation. Never ids, roster, state or content.",
  })
  @ApiResponse({
    status: 404,
    description:
      "CIRCLE_INVITATION_UNUSABLE — one answer for nonexistent, malformed, " +
      "expired, already used, declined and revoked alike.",
  })
  inspect(
    @Body() dto: InspectInvitationDto,
  ): Promise<{ usable: true; preview: CircleInvitationPreview | null }> {
    return mapCirclesErrors(async () => {
      // Being asked to accept something described only as "an invitation" is
      // being asked to agree to an unknown. The preview is what makes the
      // explicit acceptance on the next screen a real decision — and it costs
      // nothing in disclosure, because every refusal is still the same one.
      const preview = await this.circles.inspect(dto.secret);
      return { usable: true as const, preview };
    });
  }

  /**
   * Accept an invitation and receive an opaque guest session.
   *
   * The raw session secret is returned HERE and nowhere else, exactly once. It
   * is not stored, not logged and not recoverable — losing it means the person
   * needs a new invitation.
   */
  @Post("invitations/accept")
  @HttpCode(201)
  @UseGuards(CirclesGuestSurfaceGuard)
  @Throttle(INVITATION_THROTTLE)
  @ApiOperation({ summary: "Trade an invitation for a guest session" })
  @ApiResponse({ status: 201, description: "The guest session was created." })
  @ApiResponse({
    status: 404,
    description: "CIRCLE_INVITATION_UNUSABLE — the same single answer.",
  })
  accept(
    @Body() dto: AcceptInvitationDto,
  ): Promise<{ guestSessionToken: string; expiresAt: string }> {
    return mapCirclesErrors(async () => {
      const session = await this.circles.exchange(dto.secret);
      return {
        guestSessionToken: session.rawGuestToken,
        expiresAt: session.expiresAt.toISOString(),
      };
    });
  }

  /**
   * What this guest session is, as the SERVER resolved it.
   *
   * The response is the actor: the one activity and the one participant this
   * session may ever act as. Nothing in the request contributed to either
   * value, which is what makes the endpoint worth having — it is the observable
   * form of "the client does not get to say who it is".
   */
  @Get("guest/session")
  @UseGuards(CirclesGuestGuard)
  @ApiOperation({ summary: "The scope of the presented guest session" })
  @ApiResponse({ status: 200, description: "The resolved guest actor." })
  @ApiResponse({
    status: 401,
    description:
      "CIRCLE_GUEST_SESSION_INVALID — one answer for missing, unknown, " +
      "expired and revoked alike.",
  })
  guestSession(@CurrentCircleActor() actor: CircleActor): {
    kind: "GUEST";
    activityId: string;
    participantId: string;
  } {
    // The guard only ever attaches a GUEST actor on this route. The check is a
    // real throw rather than a cast so that a future rewiring fails closed
    // instead of type-asserting its way into serving a member's actor here.
    if (actor.kind !== "GUEST") {
      throw circlesException("CIRCLE_FORBIDDEN");
    }
    return {
      kind: "GUEST",
      activityId: actor.activityId,
      participantId: actor.participantId,
    };
  }
}
