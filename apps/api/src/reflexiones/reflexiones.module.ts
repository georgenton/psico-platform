import { Module } from "@nestjs/common";
import { ReflexionesController } from "./reflexiones.controller";
import { ReflexionesService } from "./reflexiones.service";

// PrismaModule is @Global — no explicit import needed.
//
// ReflexionesService is exported because HomeService and UsersService need
// the entry-count helpers (countEntriesSince / countTotalEntries) to fill
// stats.diaryEntries and stats.minutesTotal without leaking the cipher.
@Module({
  controllers: [ReflexionesController],
  providers: [ReflexionesService],
  exports: [ReflexionesService],
})
export class ReflexionesModule {}
