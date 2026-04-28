import { IsUrl } from "class-validator";

export class CreatePortalSessionDto {
  @IsUrl({}, { message: "returnUrl must be a valid URL" })
  returnUrl!: string;
}
