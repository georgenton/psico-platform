import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { ContentAccessModule } from "./access/content-access.module";
import { ContentController } from "./read/content.controller";
import { ContentReadService } from "./read/content-read.service";

/**
 * ContentCoreModule — CC-6A.
 *
 * Read-only HTTP surface over Content Core (Work → Edition → Revision), with a
 * fail-closed dual-read to the legacy Book/Chapter tables. Exposes
 * `GET /api/content/editions/:editionKey/units/:unitKey`. Writes (backfill,
 * ingest-v2) stay in scripts/tests — this module never writes.
 */
@Module({
  imports: [PrismaModule, ContentAccessModule],
  controllers: [ContentController],
  providers: [ContentReadService],
  exports: [ContentReadService],
})
export class ContentCoreModule {}
