import { Module } from "@nestjs/common";
import { EmotionalMapModule } from "../emotional-map";
import { MoodController } from "./mood.controller";
import { MoodService } from "./mood.service";

/**
 * MoodModule — Sprint B1 + Mapa Emocional Etapa 2 (micro-checkins).
 *
 * Owns the global mood time series (`MoodLog` rows) consumed by the new
 * dashboard Topbar MoodChip, Patrones IA, and the WeeklyDigest narrative,
 * plus the daily micro-checkin answers that feed the Emotional Map.
 * EmotionalMapModule is imported to bust the map cache after a checkin.
 * No PrismaModule import: PrismaModule is @Global().
 */
@Module({
  imports: [EmotionalMapModule],
  controllers: [MoodController],
  providers: [MoodService],
  exports: [MoodService],
})
export class MoodModule {}
