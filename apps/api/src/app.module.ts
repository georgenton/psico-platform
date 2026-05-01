import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validate } from "./config";
import { PrismaModule } from "./prisma";
import { AuthModule } from "./auth";
import { StorageModule } from "./storage";
import { ContentModule } from "./content";
import { SubscriptionModule } from "./subscription";
import { HealthModule } from "./health";

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
    // TODO senior: register feature modules here as they are created
    // UsersModule, AIModule, NotificationsModule, etc.
  ],
})
export class AppModule {}
