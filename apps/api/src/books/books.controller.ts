import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth";
import { JwtAuthGuard } from "../auth";
import { CurrentUser, RequiredRole, RolesGuard } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BooksService } from "./books.service";
// IMPORTANT: do NOT use `import type` for these DTOs. NestJS reads the
// parameter type at runtime via reflect-metadata to apply the global
// ValidationPipe. `import type` strips the class out of the compiled JS,
// so the pipe sees `undefined` as the target type and rejects EVERY
// query/body field as "should not exist". This is the same hazard that
// burned us with DI tokens earlier in the project.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateBookDto } from "./dto/create-book.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateBookDto } from "./dto/update-book.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ListBooksQueryDto } from "./dto/list-books-query.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ListReviewsQueryDto } from "./dto/list-reviews-query.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateBookReviewDto } from "./dto/create-review.dto";

/**
 * BooksController — the Sprint S5 catalog surface.
 *
 * Auth model:
 *   - Catalog endpoints (list, categories, authors, detail, reviews list) are
 *     publicly readable. When a JWT is present we hydrate user-scoped fields
 *     (isFavorite, isBookmarked, userProgress). When absent they default to
 *     false/null.
 *   - Mutating endpoints (favorite/bookmark toggle, create review, start)
 *     require JwtAuthGuard.
 *   - Admin CRUD (create, update) is gated by RequiredRole("ADMIN").
 *
 * Path strategy: `/books/:idOrSlug` accepts both the cuid id (canonical, used
 * by the design 04-detalle.md) and the slug (used by existing seed and any
 * link-by-name flow). The service resolves which one matched.
 */
@ApiTags("Books")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto })
@Controller("books")
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  // ─── List + filters ────────────────────────────────────────────────────────

  @Get()
  list(@Req() req: Request, @Query() query: ListBooksQueryDto) {
    const userId = (req.user as AuthenticatedUser | undefined)?.userId ?? null;
    return this.booksService.list(userId, query);
  }

  @Get("recos")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  getRecos(@CurrentUser() user: AuthenticatedUser) {
    return this.booksService.getRecos(user.userId);
  }

  @Get("categories")
  getCategories() {
    return this.booksService.getCategories();
  }

  @Get("authors")
  getAuthors() {
    return this.booksService.getAuthors();
  }

  // ─── Detail + reviews ──────────────────────────────────────────────────────

  @Get(":idOrSlug")
  getDetail(@Req() req: Request, @Param("idOrSlug") idOrSlug: string) {
    const userId = (req.user as AuthenticatedUser | undefined)?.userId ?? null;
    return this.booksService.getDetail(userId, idOrSlug);
  }

  @Get(":idOrSlug/reviews")
  listReviews(
    @Param("idOrSlug") idOrSlug: string,
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.booksService.listReviews(idOrSlug, query);
  }

  @Post(":idOrSlug/reviews")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @HttpCode(HttpStatus.OK)
  createReview(
    @Param("idOrSlug") idOrSlug: string,
    @Body() dto: CreateBookReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.booksService.createReview(user.userId, idOrSlug, dto);
  }

  // ─── Toggles + lifecycle ───────────────────────────────────────────────────

  @Post(":idOrSlug/favorite")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @HttpCode(HttpStatus.OK)
  toggleFavorite(
    @Param("idOrSlug") idOrSlug: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.booksService.toggleFavorite(user.userId, idOrSlug);
  }

  @Post(":idOrSlug/bookmark")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @HttpCode(HttpStatus.OK)
  toggleBookmark(
    @Param("idOrSlug") idOrSlug: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.booksService.toggleBookmark(user.userId, idOrSlug);
  }

  @Post(":idOrSlug/start")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @HttpCode(HttpStatus.OK)
  startBook(
    @Param("idOrSlug") idOrSlug: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.booksService.startBook(user.userId, idOrSlug);
  }

  // ─── Admin CMS ─────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequiredRole("ADMIN")
  @ApiBearerAuth("bearer")
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBookDto) {
    return this.booksService.create(dto);
  }

  @Patch(":slug")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequiredRole("ADMIN")
  @ApiBearerAuth("bearer")
  update(@Param("slug") slug: string, @Body() dto: UpdateBookDto) {
    return this.booksService.update(slug, dto);
  }
}
