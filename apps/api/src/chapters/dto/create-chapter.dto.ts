import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsPositive,
} from "class-validator";

export class CreateChapterDto {
  @IsInt()
  @IsPositive()
  order: number;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  durationMinutes?: number;
}
