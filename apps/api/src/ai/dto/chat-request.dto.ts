import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ChatRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
