import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional } from "class-validator";
import { CreateChapterDto } from "./create-chapter.dto";

export class UpdateChapterDto extends PartialType(CreateChapterDto) {
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
