import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
<<<<<<< HEAD
import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import type { PrismaService } from "../prisma";
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
>>>>>>> origin/main
import type { Env } from "../config";
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";
import type { AuthResponseDto } from "./dto/auth-response.dto";
import type { JwtPayload } from "./strategies/jwt.strategy";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) throw new ConflictException("Email already in use");

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        profile: { create: {} },
      },
      select: { id: true, email: true, name: true, role: true, plan: true },
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        passwordHash: true,
        isActive: true,
      },
    });

    // Constant-time path: run bcrypt even when user not found to prevent timing attacks
    const passwordHash = user?.passwordHash ?? "$2b$12$invalidhashfortimingatk";
    const valid = await bcrypt.compare(dto.password, passwordHash);

    if (!user || !valid || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.issueTokens(user);
  }

  async refresh(
    rawToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponseDto> {
    const tokenHash = this.hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            plan: true,
            isActive: true,
          },
        },
      },
    });

    if (
      !stored ||
      stored.revokedAt !== null ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive
    ) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Atomic rotation: revoke old token and issue new pair in a transaction
    const [, response] = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      return [
        null,
        await this.issueTokens(stored.user, tx, userAgent, ipAddress),
      ];
    });

    return response;
  }

  async logout(userId: string, rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { userId, token: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      plan: string;
    },
    // TODO senior: accept Prisma transaction client type once shared kernel is extracted
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any = this.prisma,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    };

    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = randomBytes(64).toString("hex");
    const tokenHash = this.hashToken(rawRefreshToken);

    const expiresIn = this.configService.get("JWT_REFRESH_EXPIRES_IN", {
      infer: true,
    });

    await tx.refreshToken.create({
      data: {
        token: tokenHash,
        userId: user.id,
        userAgent,
        ipAddress,
        expiresAt: this.parseExpiry(expiresIn),
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
      },
    };
  }

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  private parseExpiry(expiry: string): Date {
    const now = Date.now();
    const match = /^(\d+)([smhd])$/.exec(expiry);
    if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const ms: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
    return new Date(now + value * ms[unit]);
  }
}
