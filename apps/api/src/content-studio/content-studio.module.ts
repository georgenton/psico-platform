import { Module } from "@nestjs/common";
import { ContentStudioController } from "./content-studio.controller";
import { ContentStudioService } from "./content-studio.service";
import { ContentStudioAssetsService } from "./content-studio-assets.service";
import { ChapterMediaAdminService } from "./chapter-media-admin.service";
import { MediaUploadService } from "./media-upload.service";
import { VideoUploadService } from "./video-upload.service";
import { CloudflareStreamUploadService } from "../lector/media/cloudflare-stream-upload.service";

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
    VideoUploadService,
    CloudflareStreamUploadService,
  ],
})
export class ContentStudioModule {}
