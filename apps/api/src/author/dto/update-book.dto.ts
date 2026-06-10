import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateAuthorBookDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @IsIn(["warm", "cool", "mixed"], {
    message: "cover debe ser warm, cool o mixed.",
  })
  cover?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverArtUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  language?: string;
}
