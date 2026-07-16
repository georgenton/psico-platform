import { Injectable, UnauthorizedException } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
import type { Env } from "../../config";

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string;
  plan: string;
  // Auth-revision claim (ADR 0015). Compared against User.authRevision on every
  // request. Tokens minted before this field existed have `ar` undefined and
  // are rejected (fail-closed → one-time global re-login on deploy).
  ar: number;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  plan: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get("JWT_SECRET", { infer: true }),
    });
  }

  /**
   * Runs on every authenticated request. Beyond signature + expiry (already
   * checked by passport-jwt), this does a DB lookup so server-side state —
   * account disabled, password changed, sessions revoked — invalidates a
   * still-unexpired access token immediately. Every failure path is a flat 401;
   * we never leak which check failed.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sub) throw new UnauthorizedException();
    // Legacy tokens (pre-ADR-0015) carry no `ar` claim → reject. `ar` must be a
    // real number; 0 is valid (fresh accounts), so check the type, not truthiness.
    if (typeof payload.ar !== "number") throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        plan: true,
        isActive: true,
        authRevision: true,
      },
    });

    if (!user) throw new UnauthorizedException();
    if (!user.isActive) throw new UnauthorizedException();
    if (user.authRevision !== payload.ar) throw new UnauthorizedException();

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    };
  }
}
