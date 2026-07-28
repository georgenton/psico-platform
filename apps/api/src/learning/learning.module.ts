import { Module } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { ContentAccessModule } from "../content-core/access/content-access.module";
import { LearningCatalogResolver } from "./learning-catalog.resolver";
import { LearningCommandService } from "./learning-command.service";
import { LearningEventRepository } from "./learning-event.repository";
import { LearningProgressService } from "./learning-progress.service";
import { LearningController } from "./learning.controller";

/**
 * CC-7.3 — LearningModule (ADR 0017 §1).
 *
 * Domain commands + derived progress over the append-only V1 event log.
 * `ContentAccessModule` supplies THE entitlement gate every content surface
 * shares (CC-6E) — learning never re-implements the FREE/PRO condition. The
 * repository stays a plain Nest-free class (CC-7.2), provided via factory so
 * the single writer keeps its constructor-injected Prisma shape.
 */
@Module({
  imports: [ContentAccessModule],
  controllers: [LearningController],
  providers: [
    LearningCatalogResolver,
    LearningCommandService,
    LearningProgressService,
    {
      provide: LearningEventRepository,
      useFactory: (prisma: PrismaService) =>
        new LearningEventRepository(prisma),
      inject: [PrismaService],
    },
  ],
})
export class LearningModule {}
