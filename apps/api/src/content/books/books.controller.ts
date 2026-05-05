import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
<<<<<<< HEAD
<<<<<<< HEAD
import type { BooksService } from "./books.service";
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BooksService } from "./books.service";
>>>>>>> origin/main
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BooksService } from "./books.service";
>>>>>>> origin/main
import { JwtAuthGuard } from "../../auth";
import { RolesGuard } from "../guards/roles.guard";
import { RequiredRole } from "../guards/required-role.decorator";
import type { CreateBookDto } from "../dto/create-book.dto";
import type { UpdateBookDto } from "../dto/update-book.dto";

@Controller("content/books")
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  findAllPublished() {
    return this.booksService.findAllPublished();
  }

  @Get(":slug")
  findBySlug(@Param("slug") slug: string) {
    return this.booksService.findBySlug(slug);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequiredRole("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBookDto) {
    return this.booksService.create(dto);
  }

  @Patch(":slug")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequiredRole("ADMIN")
  update(@Param("slug") slug: string, @Body() dto: UpdateBookDto) {
    return this.booksService.update(slug, dto);
  }
}
