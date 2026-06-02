import { IsString, Length } from "class-validator";

export class CreateAnnotationDto {
  @IsString()
  @Length(1, 64)
  blockId!: string;

  /**
   * Cap at 4 KB. Diary is the right place for longer reflection; the
   * Annotation model is for margin-style notes against a specific block.
   */
  @IsString()
  @Length(1, 4096)
  text!: string;
}

export class UpdateAnnotationDto {
  @IsString()
  @Length(1, 4096)
  text!: string;
}
