import { Module } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { ContentAccessModule } from "../content-core/access/content-access.module";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import { LearningEventRepository } from "../learning/learning-event.repository";
import { GuideCommandReceiptRepository } from "./guide-command-receipt.repository";
import { GuideLifecycleService } from "./guide-lifecycle.service";
import { GuideSessionRepository } from "./guide-session.repository";
import { GuideSessionStepRepository } from "./guide-session-step.repository";
import { GuideTargetContextService } from "./guide-target-context.service";
import { GuideController } from "./guide.controller";

/**
 * CC-7.4D — GuideModule (ADR 0019).
 *
 * The five Guide commands over HTTP. `ContentAccessModule` supplies THE
 * entitlement gate every content surface shares (CC-6E) — Guide never
 * re-implements the FREE/PRO condition.
 *
 * The three single-writer repositories stay plain Nest-free classes (CC-7.2 /
 * CC-7.4B/C) so their ratchets keep meaning something: they are provided via
 * explicit factories over `PrismaService`, never re-declared as a second
 * writer and never bypassed with direct Prisma access.
 *
 * `GuideLifecycleService` is deliberately NOT exported: the transactional
 * lifecycle is reachable only through this module's controller.
 */
@Module({
  imports: [ContentAccessModule],
  controllers: [GuideController],
  providers: [
    LearningCatalogResolver,
    GuideTargetContextService,
    GuideLifecycleService,
    {
      provide: GuideSessionRepository,
      useFactory: (prisma: PrismaService) => new GuideSessionRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: GuideSessionStepRepository,
      useFactory: (prisma: PrismaService) =>
        new GuideSessionStepRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: GuideCommandReceiptRepository,
      useFactory: (prisma: PrismaService) =>
        new GuideCommandReceiptRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: LearningEventRepository,
      useFactory: (prisma: PrismaService) =>
        new LearningEventRepository(prisma),
      inject: [PrismaService],
    },
  ],
})
export class GuideModule {}
