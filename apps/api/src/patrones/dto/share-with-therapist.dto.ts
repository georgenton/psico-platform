import { IsString, Length } from "class-validator";

export class ShareWithTherapistDto {
  @IsString()
  @Length(1, 64)
  therapistId!: string;
}
