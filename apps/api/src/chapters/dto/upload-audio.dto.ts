import { IsString, IsNotEmpty, IsInt, IsPositive } from "class-validator";

export class UploadAudioDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsInt()
  @IsPositive()
  durationSeconds: number;
}
