import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Authentication for a route that is public but personalised.
 *
 * The catalogue is readable by anybody, and it shows more when it knows who is
 * asking: which books you have started, which you have finished, which you
 * saved. Those handlers read `req.user` — but reading it does not populate it.
 * With no guard, Passport never runs, so a request carrying a perfectly valid
 * token was still served as a stranger. Every signed-in reader saw the
 * anonymous catalogue, and their started book kept offering to be started.
 *
 * `JwtAuthGuard` would have fixed that by making the catalogue private, which
 * is not what it is. So: authenticate when a credential is offered, and let the
 * request through when none is.
 *
 * ── Anonymous is allowed; a failed attempt is not ─────────────────────────
 *
 * The asymmetry is deliberate. No `Authorization` header means somebody is
 * browsing signed out, which is a legitimate way to use this endpoint. A header
 * that does not authenticate means something IS wrong — an expired session, a
 * corrupted token — and answering it anonymously with a 200 would hide that.
 * The web app depends on the 401 to notice and send the reader to log in again;
 * without it they would browse as a stranger inside their own account and
 * wonder where their books went.
 *
 * Verification itself belongs to `JwtStrategy` and stays there. This guard
 * decides only whether a failure is fatal.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  handleRequest<TUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    context: ExecutionContext,
  ): TUser | null {
    if (user) return user as TUser;

    const request = context
      .switchToHttp()
      .getRequest<{ headers?: Record<string, unknown> }>();
    const header = request.headers?.authorization;
    // Nothing was offered, so nothing failed.
    if (typeof header !== "string" || header.trim() === "") return null;

    // Something was offered and did not work. Surface the strategy's own error
    // when it has one, so an expired token still reads as expired.
    if (err instanceof Error) throw err;
    throw new UnauthorizedException();
  }
}
