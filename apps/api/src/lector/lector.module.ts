import { Module } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaModule, PrismaService } from "../prisma";
import { ContentAccessModule } from "../content-core/access/content-access.module";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import { LearningEventRepository } from "../learning/learning-event.repository";
import { AnnotationsController } from "./annotations.controller";
import { AnnotationsService } from "./annotations.service";
import { HighlightsController } from "./highlights.controller";
import { HighlightsService } from "./highlights.service";
import { LectorController } from "./lector.controller";
import { LectorService } from "./lector.service";
import {
  CHAPTER_MEDIA_REGISTRY,
  ChapterMediaService,
  DEFAULT_CHAPTER_MEDIA_REGISTRY,
} from "./media/chapter-media.service";
import { CloudflareStreamAccessService } from "./media/cloudflare-stream-access.service";

/**
 * LectorModule — Sprint S6, extended by GR-2.
 *
 * Three controllers, all under `/api/`:
 *   - LectorController  → /api/lector/* (chapter read + heartbeat + complete +
 *     audio + GR-2 chapter media)
 *   - HighlightsController → /api/highlights/*
 *   - AnnotationsController → /api/annotations/*
 *
 * They share a single Prisma client and the lector service is consumed by
 * the highlight + annotation services for block-existence and content-length
 * checks (so we don't duplicate the lookup logic).
 *
 * GR-2 adds the chapter-media surface. It reuses, rather than rebuilds:
 * `ContentAccessModule` is the one entitlement gate (CC-6E), and the media
 * completion goes through the SAME single writer the learning module uses —
 * `LearningEventRepository` is provided here by factory (mirroring
 * `GuideModule`) because it is a plain Nest-free class, and
 * `LearningCatalogResolver` resolves the editorial context without duplicating
 * its rules. `StorageModule` is `@Global()`, so R2 signing needs no import.
 */
@Module({
  imports: [PrismaModule, ContentAccessModule],
  controllers: [LectorController, HighlightsController, AnnotationsController],
  providers: [
    LectorService,
    HighlightsService,
    AnnotationsService,
    ChapterMediaService,
    CloudflareStreamAccessService,
    {
      provide: CHAPTER_MEDIA_REGISTRY,
      useValue: DEFAULT_CHAPTER_MEDIA_REGISTRY,
    },
    LearningCatalogResolver,
    {
      provide: LearningEventRepository,
      useFactory: (prisma: PrismaService) =>
        new LearningEventRepository(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [LectorService],
})
export class LectorModule {}
