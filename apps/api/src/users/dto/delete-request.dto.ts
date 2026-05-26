import { IsOptional, IsString, MaxLength } from "class-validator";

export class DeleteRequestDto {
  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
