import { createParamDecorator } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { CircleActor } from "@psico/types";
import { readCircleActor } from "./circles-actor";
import type { CircleActorRequest } from "./circles-actor";
import { circlesException } from "./circles-http-errors";

/**
 * Read the actor a Círculos guard resolved.
 *
 * It throws when no guard has run rather than returning `undefined`, so a
 * handler wired without its guard fails loudly at the first request instead of
 * quietly operating with no actor. There is no parameter and no fallback:
 * the only source is the request property a guard wrote.
 */
export const CurrentCircleActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CircleActor => {
    const request = context.switchToHttp().getRequest<CircleActorRequest>();
    const actor = readCircleActor(request);
    if (!actor) throw circlesException("CIRCLE_FORBIDDEN");
    return actor;
  },
);
