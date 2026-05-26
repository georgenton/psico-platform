import { Module } from "@nestjs/common";
import { BooksController } from "./books.controller";
import { BooksService } from "./books.service";

// PrismaModule is @Global — no explicit import needed.
@Module({
  controllers: [BooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}
