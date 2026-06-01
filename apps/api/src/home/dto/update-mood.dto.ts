import { IsNotEmpty, IsString } from "class-validator";

export class UpdateUserMoodBodyDto {
  @IsString()
  @IsNotEmpty()
  moodId!: string;
}
