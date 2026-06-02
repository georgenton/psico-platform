import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { AnnotationsController } from "./annotations.controller";
import { AnnotationsService } from "./annotations.service";
import { HighlightsController } from "./highlights.controller";
import { HighlightsService } from "./highlights.service";
import { LectorController } from "./lector.controller";
import { LectorService } from "./lector.service";

/**
 * LectorModule — Sprint S6.
 *
 * Three controllers, three services, all under `/api/`:
 *   - LectorController  → /api/lector/* (chapter read + heartbeat + complete + audio)
 *   - HighlightsController → /api/highlights/*
 *   - AnnotationsController → /api/annotations/*
 *
 * They share a single Prisma client and the lector service is consumed by
 * the highlight + annotation services for block-existence and content-length
 * checks (so we don't duplicate the lookup logic).
 */
@Module({
  imports: [PrismaModule],
  controllers: [LectorController, HighlightsController, AnnotationsController],
  providers: [LectorService, HighlightsService, AnnotationsService],
  exports: [LectorService],
})
export class LectorModule {}
