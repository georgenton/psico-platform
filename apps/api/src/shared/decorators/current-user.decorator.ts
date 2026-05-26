import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";
import type { AuthenticatedUser } from "../../auth";

/**
 * Extracts the JWT-authenticated user from the request. Returns `AuthenticatedUser`
 * (the lean shape the JwtStrategy attaches under `request.user` after validation).
 *
 * Must be used together with `JwtAuthGuard` — without it, `request.user` is undefined
 * and downstream handlers will crash. We deliberately do NOT throw here so the guard
 * remains the single source of truth for "is this request authenticated?".
 *
 * Usage:
 * ```ts
 * @Get("me")
 * @UseGuards(JwtAuthGuard)
 * getMe(@CurrentUser() user: AuthenticatedUser) {
 *   return this.service.getMe(user.userId);
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
);
