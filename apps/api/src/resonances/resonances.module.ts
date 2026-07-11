import { Module } from "@nestjs/common";
import { EmotionalMapModule } from "../emotional-map";
import { ResonancesController } from "./resonances.controller";
import { ResonancesService } from "./resonances.service";

/**
 * ResonancesModule — Fase E (V2, ARC cycle).
 *
 * Owns the confirmed resonances: the only content-side signal allowed into
 * the emotional map ("nothing enters silently"). EmotionalMapModule is
 * imported to bust the map cache after confirm/remove. PrismaModule is
 * @Global().
 */
@Module({
  imports: [EmotionalMapModule],
  controllers: [ResonancesController],
  providers: [ResonancesService],
  exports: [ResonancesService],
})
export class ResonancesModule {}
