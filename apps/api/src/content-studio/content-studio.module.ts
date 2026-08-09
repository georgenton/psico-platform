import { Module } from "@nestjs/common";
import { ContentStudioController } from "./content-studio.controller";
import { ContentStudioService } from "./content-studio.service";
import { ContentStudioAssetsService } from "./content-studio-assets.service";
import { ChapterMediaAdminService } from "./chapter-media-admin.service";
import { MediaUploadService } from "./media-upload.service";

/**
 * Content Studio — a small, dedicated admin module rather than more weight in
 * PulsoController. It owns no domain rules: the lifecycle lives in Content Core
 * and this only resolves identities and maps errors to HTTP.
 */
@Module({
  controllers: [ContentStudioController],
  providers: [
    ContentStudioService,
    ContentStudioAssetsService,
    ChapterMediaAdminService,
    MediaUploadService,
  ],
})
export class ContentStudioModule {}
