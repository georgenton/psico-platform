import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type {
  CreateAnnotationResponse,
  UpdateAnnotationResponse,
} from "@psico/types";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { CurrentUser } from "../shared/decorators/current-user.decorator";
import { AnnotationsService } from "./annotations.service";
import {
  CreateAnnotationDto,
  UpdateAnnotationDto,
} from "./dto/create-annotation.dto";

@ApiTags("Annotations")
@Controller("annotations")
@UseGuards(JwtAuthGuard)
export class AnnotationsController {
  constructor(private readonly annotations: AnnotationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAnnotationDto,
  ): Promise<CreateAnnotationResponse> {
    return this.annotations.create(user.userId, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateAnnotationDto,
  ): Promise<UpdateAnnotationResponse> {
    return this.annotations.update(user.userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<void> {
    await this.annotations.delete(user.userId, id);
  }
}
