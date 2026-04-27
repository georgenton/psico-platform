import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validate } from "./config";
import { PrismaModule } from "./prisma";
import { AuthModule } from "./auth";
import { StorageModule } from "./storage";
import { ContentModule } from "./content";

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
    // TODO senior: register feature modules here as they are created
    // SubscriptionModule, UsersModule, AIModule, etc.
  ],
})
export class AppModule {}
