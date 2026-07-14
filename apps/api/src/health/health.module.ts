import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { IntegrationsService } from "./integrations.service";
import { MapIdentityService } from "./map-identity.service";

@Module({
  controllers: [HealthController],
  providers: [IntegrationsService, MapIdentityService],
  exports: [IntegrationsService, MapIdentityService],
})
export class HealthModule {}
