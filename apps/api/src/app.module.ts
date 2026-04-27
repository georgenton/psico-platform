import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validate } from "./config";
import { PrismaModule } from "./prisma";
import { AuthModule } from "./auth";
import { StorageModule } from "./storage";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    StorageModule,
    AuthModule,
    // TODO senior: register feature modules here as they are created
    // ContentModule, SubscriptionModule, UsersModule, etc.
  ],
})
export class AppModule {}
