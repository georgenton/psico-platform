import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validate } from "./config";
import { PrismaModule } from "./prisma";
import { AuthModule } from "./auth";
import { StorageModule } from "./storage";
import { ContentModule } from "./content";
import { SubscriptionModule } from "./subscription";
import { HealthModule } from "./health";
import { AIModule } from "./ai";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    StorageModule,
    AuthModule,
    ContentModule,
    SubscriptionModule,
    HealthModule,
    AIModule,
    // TODO senior: register remaining feature modules here
    // UsersModule, NotificationsModule, AnalyticsModule, ProgressModule
  ],
})
export class AppModule {}
