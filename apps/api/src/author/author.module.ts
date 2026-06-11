import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma";
import { AuthorController } from "./author.controller";
import { AuthorService } from "./author.service";
import { AuthorAiService } from "./author-ai.service";
import { AuthorUploadsService } from "./author-uploads.service";
import { AuthorRevenueService } from "./author-revenue.service";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AuthorController],
  providers: [
    AuthorService,
    AuthorAiService,
    AuthorUploadsService,
    AuthorRevenueService,
  ],
  exports: [AuthorService],
})
export class AuthorModule {}
