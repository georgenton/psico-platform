import { Module } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { CircleEventRepository } from "./circle-event.repository";
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
import { CircleInvitationRepository } from "./circle-invitation.repository";
import { CircleMemberRepository } from "./circle-member.repository";
import { CirclesController } from "./circles.controller";
import {
  CIRCLES_ROLLOUT_CONFIG,
  resolveCirclesRolloutConfig,
} from "./circles-rollout";
import { CirclesGuestGuard } from "./circles-guest.guard";
import { CirclesGuestSurfaceGuard } from "./circles-guest-surface.guard";
import { CirclesRolloutGuard } from "./circles-rollout.guard";
import { CirclesRolloutService } from "./circles-rollout.service";
import { CirclesService } from "./circles.service";

/**
 * CirclesModule — the access spine of FeelVerse Círculos (PR2 · ADR 0023).
 *
 * Wired into `AppModule`, and inert: the rollout resolves to `off` unless an
 * environment says otherwise, and `off` means every route in
 * `CirclesController` answers 503 before doing anything else.
 *
 * The four repositories stay plain Nest-free classes, provided through explicit
 * factories over `PrismaService` — the same shape as Guide's (CC-7.2 /
 * CC-7.4B/C) and for the same reason: "this is the only writer of that table"
 * is a claim a ratchet can check when there is exactly one class that writes it
 * and nothing else reaches Prisma directly.
 *
 * `CirclesService` is NOT exported. Minting an invitation is a domain operation
 * with no HTTP route in this cut, and keeping it unreachable from other modules
 * means PR3 has to wire it deliberately rather than discover it already
 * injectable.
 */
@Module({
  controllers: [CirclesController],
  providers: [
    // The rollout config, resolved ONCE at boot. Unlike Guide's, this resolver
    // never throws: missing and invalid both land on `off`, which is already
    // the closed state, so a typo cannot take the API down and cannot open
    // Círculos either.
    {
      provide: CIRCLES_ROLLOUT_CONFIG,
      useFactory: () => resolveCirclesRolloutConfig(process.env),
    },
    CirclesRolloutService,
    CirclesRolloutGuard,
    CirclesGuestSurfaceGuard,
    CirclesGuestGuard,
    CirclesService,
    {
      provide: CircleInvitationRepository,
      useFactory: (prisma: PrismaService) =>
        new CircleInvitationRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CircleGuestSessionRepository,
      useFactory: (prisma: PrismaService) =>
        new CircleGuestSessionRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CircleMemberRepository,
      useFactory: (prisma: PrismaService) => new CircleMemberRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CircleEventRepository,
      useFactory: (prisma: PrismaService) => new CircleEventRepository(prisma),
      inject: [PrismaService],
    },
  ],
})
export class CirclesModule {}
