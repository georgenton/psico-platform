import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma";
import { ContentAccessService } from "./content-access.service";

/**
 * CC-6E — the single content access policy, shared by LectorModule and
 * ContentCoreModule so both apply the identical FREE/PRO entitlement.
 */
@Module({
  imports: [PrismaModule],
  providers: [ContentAccessService],
  exports: [ContentAccessService],
})
export class ContentAccessModule {}
