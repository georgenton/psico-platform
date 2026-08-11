import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { ContentAssetsController } from "../shared/content-assets.controller";

/**
 * The asset route lives here rather than in a feature module because what it
 * needs is storage and nothing else — no Prisma, no policy, no feature. Keeping
 * it beside the service it signs with makes the whole surface that can mint a
 * signed URL readable in one place.
 */
@Global()
@Module({
  controllers: [ContentAssetsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
