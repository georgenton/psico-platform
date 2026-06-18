import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { IntegrationsService } from "./integrations.service";

@Module({
  controllers: [HealthController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class HealthModule {}
