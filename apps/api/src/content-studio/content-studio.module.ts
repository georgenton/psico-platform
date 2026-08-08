import { Module } from "@nestjs/common";
import { ContentStudioController } from "./content-studio.controller";
import { ContentStudioService } from "./content-studio.service";

/**
 * Content Studio — a small, dedicated admin module rather than more weight in
 * PulsoController. It owns no domain rules: the lifecycle lives in Content Core
 * and this only resolves identities and maps errors to HTTP.
 */
@Module({
  controllers: [ContentStudioController],
  providers: [ContentStudioService],
})
export class ContentStudioModule {}
