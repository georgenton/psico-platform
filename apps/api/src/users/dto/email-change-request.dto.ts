import { IsEmail } from "class-validator";

export class EmailChangeRequestDto {
  @IsEmail()
  newEmail!: string;
}
