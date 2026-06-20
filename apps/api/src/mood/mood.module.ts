import { Module } from "@nestjs/common";
import { MoodController } from "./mood.controller";
import { MoodService } from "./mood.service";

/**
 * MoodModule — Sprint B1.
 *
 * Owns the global mood time series (`MoodLog` rows) consumed by the new
 * dashboard Topbar MoodChip, Patrones IA, and the WeeklyDigest narrative.
 * No PrismaModule import: PrismaModule is @Global().
 */
@Module({
  controllers: [MoodController],
  providers: [MoodService],
  exports: [MoodService],
})
export class MoodModule {}
