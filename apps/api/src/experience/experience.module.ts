/**
 * GR-6 — the experience read surface, plus the CMS write surface (#637).
 *
 * The repository token now resolves to the HYBRID implementation: database
 * first for an exact pin, code-owned as the fallback, and the highest published
 * version of each key when listing a chapter. Nothing downstream changed to
 * make that work — which was the point of putting a port here (ADR 0021 §5).
 *
 * `productionExperienceRepository` stays wired in deliberately. Making the
 * database the only source of truth on day one would bet every reader's session
 * on rows that have never served production traffic; it retires once every
 * experience has a published database row.
 */

import { Module } from "@nestjs/common";
import { ExperienceController } from "./experience.controller";
import { ExperienceAdminController } from "./experience-admin.controller";
import { ExperienceDiscoveryService } from "./experience-discovery.service";
import { ExperienceAdminService } from "./experience-admin.service";
import { EXPERIENCE_DEFINITION_REPOSITORY } from "./experience-definition.repository";
import { DatabaseExperienceDefinitionRepository } from "./database-experience-definition.repository";
import { HybridExperienceDefinitionRepository } from "./hybrid-experience-definition.repository";
import { productionExperienceRepository } from "./experience-production-catalog";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  controllers: [ExperienceController, ExperienceAdminController],
  providers: [
    ExperienceDiscoveryService,
    ExperienceAdminService,
    {
      provide: EXPERIENCE_DEFINITION_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        new HybridExperienceDefinitionRepository(
          new DatabaseExperienceDefinitionRepository(prisma),
          productionExperienceRepository,
        ),
      inject: [PrismaService],
    },
  ],
  exports: [ExperienceDiscoveryService],
})
export class ExperienceModule {}
