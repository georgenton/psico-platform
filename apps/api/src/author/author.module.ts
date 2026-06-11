import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma";
import { AuthorController } from "./author.controller";
import { AuthorService } from "./author.service";
import { AuthorAiService } from "./author-ai.service";
import { AuthorUploadsService } from "./author-uploads.service";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AuthorController],
  providers: [AuthorService, AuthorAiService, AuthorUploadsService],
  exports: [AuthorService],
})
export class AuthorModule {}
