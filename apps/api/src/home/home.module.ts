import { Module } from "@nestjs/common";
import { HomeController } from "./home.controller";
import { HomeService } from "./home.service";

// PrismaModule is @Global — no explicit import needed.
@Module({
  controllers: [HomeController],
  providers: [HomeService],
  exports: [HomeService],
})
export class HomeModule {}
