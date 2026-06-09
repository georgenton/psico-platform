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
import { BillingModule } from "./billing";
import { HealthModule } from "./health";
import { AIModule } from "./ai";
import { UsersModule } from "./users";
import { OnboardingModule } from "./onboarding";
import { NotificationsModule } from "./notifications";
import { JobsModule } from "./jobs";
import { VoiceModule } from "./voice";
import { EcoModule } from "./eco";
import { LectorModule } from "./lector";
import { PatronesModule } from "./patrones";
import { PulsoModule } from "./pulso";
import { LiveActivitiesModule } from "./live-activities";
import { TerapiaModule } from "./terapia";
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
    BillingModule, // Sprint S11 — /api/billing/* + /api/plan, depends on SubscriptionModule
    HealthModule,
    AIModule,
    UsersModule,
    OnboardingModule,
    VoiceModule,
    EcoModule,
    LectorModule, // Sprint S6 — /api/lector/*, /api/highlights/*, /api/annotations/*
    PatronesModule, // Sprint S10 — /api/patrones/* (Pro)
    PulsoModule, // Sprint S42 — /api/pulso/* (ADMIN only)
    LiveActivitiesModule, // Sprint E.5 — /api/push/live-activity/* (iOS 16.1+)
    TerapiaModule, // Sprint S62 — /api/terapia/* (Crisis público + Hub auth)
    // TODO senior: register remaining feature modules here
    // AnalyticsModule, TerapiaModule (S13)
  ],
  providers: [
    // Global interceptor — activates only on handlers marked with @Idempotent()
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
