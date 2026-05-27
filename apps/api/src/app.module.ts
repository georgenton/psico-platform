import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { validate } from "./config";
import { PrismaModule } from "./prisma";
import { RedisModule } from "./redis";
import { AuthModule } from "./auth";
import { StorageModule } from "./storage";
import { BooksModule } from "./books";
import { ChaptersModule } from "./chapters";
import { ProgressModule } from "./progress";
import { HomeModule } from "./home";
import { DiarioModule } from "./diario";
import { SubscriptionModule } from "./subscription";
import { HealthModule } from "./health";
import { AIModule } from "./ai";
import { UsersModule } from "./users";
import { OnboardingModule } from "./onboarding";
import { NotificationsModule } from "./notifications";
import { JobsModule } from "./jobs";
import { VoiceModule } from "./voice";
import { AppThrottlerModule, IdempotencyInterceptor } from "./shared";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    RedisModule, // global — exposes REDIS_CLIENT token
    AppThrottlerModule, // global ThrottlerGuard via APP_GUARD
    NotificationsModule, // global — exposes ResendService
    JobsModule, // global — exposes JobsService + 3 queues
    StorageModule,
    AuthModule,
    BooksModule,
    ChaptersModule,
    ProgressModule,
    HomeModule,
    DiarioModule,
    SubscriptionModule,
    HealthModule,
    AIModule,
    UsersModule,
    OnboardingModule,
    VoiceModule,
    // TODO senior: register remaining feature modules here
    // AnalyticsModule, PatternsModule (S11)
  ],
  providers: [
    // Global interceptor — activates only on handlers marked with @Idempotent()
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
