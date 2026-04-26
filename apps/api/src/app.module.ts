import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validate } from "./config";
import { PrismaModule } from "./prisma";
import { AuthModule } from "./auth";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    AuthModule,
    // TODO senior: register feature modules here as they are created
    // ContentModule, SubscriptionModule, UsersModule, etc.
  ],
})
export class AppModule {}
