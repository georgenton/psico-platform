import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RejectAuthorRequestDto {
  /**
   * Editorial feedback shown to the author in the publication checklist UI.
   * Empty allowed (e.g. generic "no apto"), but ops should write something
   * actionable.
   */
  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(2000)
  feedback?: string;
}
