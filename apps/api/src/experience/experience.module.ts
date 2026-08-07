/**
 * GR-6 — the experience read surface.
 *
 * One provider and one route. The repository is bound through a token so the
 * database-backed implementation can replace the code-owned one without
 * touching anything downstream (ADR 0021 §5).
 */

import { Module } from "@nestjs/common";
import { ExperienceController } from "./experience.controller";
import { ExperienceDiscoveryService } from "./experience-discovery.service";
import { EXPERIENCE_DEFINITION_REPOSITORY } from "./experience-definition.repository";
import { productionExperienceRepository } from "./experience-production-catalog";

@Module({
  controllers: [ExperienceController],
  providers: [
    ExperienceDiscoveryService,
    {
      provide: EXPERIENCE_DEFINITION_REPOSITORY,
      useValue: productionExperienceRepository,
    },
  ],
  exports: [ExperienceDiscoveryService],
})
export class ExperienceModule {}
