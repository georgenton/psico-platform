import { Module } from "@nestjs/common";
import { EmotionalMapModule } from "../emotional-map";
import { ReflexionesController } from "./reflexiones.controller";
import { ReflexionesService } from "./reflexiones.service";

// PrismaModule is @Global — no explicit import needed.
//
// ReflexionesService is exported because HomeService and UsersService need
// the entry-count helpers (countEntriesSince / countTotalEntries) to fill
// stats.diaryEntries and stats.minutesTotal without leaking the cipher.
//
// PR-2B · EmotionalMapModule is imported so a reflexion write can bust the map
// cache (best-effort) — a new/edited mood or tag set feeds the map's plaintext
// metadata aggregation, so a stale map would otherwise lag by the cache TTL.
@Module({
  imports: [EmotionalMapModule],
  controllers: [ReflexionesController],
  providers: [ReflexionesService],
  exports: [ReflexionesService],
})
export class ReflexionesModule {}
