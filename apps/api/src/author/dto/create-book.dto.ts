import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateAuthorBookDto {
  @IsString()
  @MinLength(2, { message: "El título debe tener al menos 2 caracteres." })
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateId?: string;
}
