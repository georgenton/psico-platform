import { IsString, Matches } from "class-validator";

export class VerifyEmailDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{32,128}$/, {
    message: "Invalid token format",
  })
  token!: string;
}
