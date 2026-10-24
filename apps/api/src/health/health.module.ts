import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { IntegrationsService } from "./integrations.service";
import { MapIdentityService } from "./map-identity.service";
import { SchemaReadinessService } from "./schema-readiness.service";

@Module({
  controllers: [HealthController],
  providers: [
    IntegrationsService,
    MapIdentityService,
    SchemaReadinessService,
  ],
  exports: [IntegrationsService, MapIdentityService, SchemaReadinessService],
})
export class HealthModule {}
