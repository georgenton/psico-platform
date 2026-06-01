import { Module } from "@nestjs/common";
import { DiarioController } from "./diario.controller";
import { DiarioService } from "./diario.service";

// PrismaModule is @Global — no explicit import needed.
//
// DiarioService is exported because HomeService and UsersService need the
// entry-count helpers (countEntriesSince / countTotalEntries) to fill
// stats.diaryEntries and stats.minutesTotal without leaking the cipher.
@Module({
  controllers: [DiarioController],
  providers: [DiarioService],
  exports: [DiarioService],
})
export class DiarioModule {}
