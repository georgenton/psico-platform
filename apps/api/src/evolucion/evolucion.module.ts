import { Module } from "@nestjs/common";

import { EvolucionController } from "./evolucion.controller";
import { EvolucionService } from "./evolucion.service";

// PrismaModule is @Global — no explicit import needed.
@Module({
  controllers: [EvolucionController],
  providers: [EvolucionService],
  exports: [EvolucionService],
})
export class EvolucionModule {}
