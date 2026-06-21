import { Module } from "@nestjs/common";

import { ActivityModule } from "../activity";
import { EmotionalMapModule } from "../emotional-map";
import { HomeController } from "./home.controller";
import { HomeService } from "./home.service";

// PrismaModule is @Global — no explicit import needed.
@Module({
  imports: [EmotionalMapModule, ActivityModule],
  controllers: [HomeController],
  providers: [HomeService],
  exports: [HomeService],
})
export class HomeModule {}
