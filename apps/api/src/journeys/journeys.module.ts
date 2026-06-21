import { Module } from "@nestjs/common";
import { JourneysController } from "./journeys.controller";
import { JourneysService } from "./journeys.service";

/**
 * JourneysModule — Sprint B5. Curated Exploraciones catalog.
 * PrismaModule is @Global; no explicit import needed.
 */
@Module({
  controllers: [JourneysController],
  providers: [JourneysService],
  exports: [JourneysService],
})
export class JourneysModule {}
