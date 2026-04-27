import { IsOptional, IsNumber, Min, Max } from "class-validator";

export class MarkProgressDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;
}
