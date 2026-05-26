import { Module } from "@nestjs/common";
import { ProgressController } from "./progress.controller";
import { ProgressService } from "./progress.service";

// PrismaModule is @Global — no explicit import needed.
@Module({
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
