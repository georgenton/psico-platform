import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { RedisModule } from "../redis";
import { PulsoController } from "./pulso.controller";
import { PulsoService } from "./pulso.service";
import { AuthorReviewService } from "./author-review.service";
import { AdminUsersService } from "./admin-users.service";

/**
 * PulsoModule — Sprint S42 (reports) + S48 (overview).
 *
 * Admin-only back-office. Slices shipped so far:
 *   - S42 — Eco message reports inbox (`/api/pulso/reports/eco/*`)
 *   - S48 — Platform overview KPIs (`/api/pulso/overview`)
 *
 * The larger Pulso v2 design (`docs/design/pulso/HANDOFF.md`) has 6 views;
 * the rest land in follow-up sprints. RedisModule was added in S48 so the
 * overview can cache its (potentially expensive) aggregation.
 */
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [PulsoController],
  providers: [PulsoService, AuthorReviewService, AdminUsersService],
  exports: [PulsoService, AuthorReviewService, AdminUsersService],
})
export class PulsoModule {}
