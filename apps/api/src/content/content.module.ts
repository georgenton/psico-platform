import { Module } from "@nestjs/common";
import { BooksService } from "./books/books.service";
import { BooksController } from "./books/books.controller";
import { ChaptersService } from "./chapters/chapters.service";
import { ChaptersController } from "./chapters/chapters.controller";
import { ProgressService } from "./progress/progress.service";
import { ProgressController } from "./progress/progress.controller";

// PrismaModule and StorageModule are @Global() — no explicit import needed
@Module({
  controllers: [BooksController, ChaptersController, ProgressController],
  providers: [BooksService, ChaptersService, ProgressService],
})
export class ContentModule {}
